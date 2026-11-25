import { parseArgs, postJson, trimSlash } from "./http.ts";
import { readSse } from "./sse.ts";
import type { Message, Provider, StreamEvent, StreamRequest, ToolCall } from "./types.ts";

export interface OpenAIOptions {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

/** Chat Completions: OpenAI, OpenRouter, Ollama, LM Studio, dan semua endpoint compatible. */
export function createOpenAI(opt: OpenAIOptions): Provider {
  return {
    id: "openai-compatible",
    async *stream(req: StreamRequest): AsyncGenerator<StreamEvent> {
      const headers: Record<string, string> = { ...(opt.headers ?? {}) };
      if (opt.apiKey) headers.authorization = `Bearer ${opt.apiKey}`;
      const body = {
        model: req.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: toWire(req),
        ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: "function", function: t })) } : {}),
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      };
      const res = await postJson(`${trimSlash(opt.baseUrl)}/chat/completions`, body, headers, req.signal);
      const acc = new Map<number, { id: string; name: string; args: string }>();
      let stop = "stop";
      for await (const m of readSse(res)) {
        if (m.data === "[DONE]") break;
        let j: any;
        try {
          j = JSON.parse(m.data);
        } catch {
          continue;
        }
        if (j.usage) yield { type: "usage", input: j.usage.prompt_tokens ?? 0, output: j.usage.completion_tokens ?? 0 };
        const ch = j.choices?.[0];
        if (!ch) continue;
        const d = ch.delta ?? {};
        if (d.content) yield { type: "text", delta: String(d.content) };
        for (const tc of d.tool_calls ?? []) {
          const cur = acc.get(tc.index ?? 0) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          acc.set(tc.index ?? 0, cur);
        }
        if (ch.finish_reason) stop = ch.finish_reason;
      }
      let n = 0;
      for (const [, c] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
        const call: ToolCall = { id: c.id || `call_${n++}`, name: c.name, args: parseArgs(c.args) };
        yield { type: "tool_call", call };
      }
      yield { type: "done", stop };
    },
  };
}

export function toWire(req: StreamRequest): unknown[] {
  const out: unknown[] = [];
  if (req.system) out.push({ role: "system", content: req.system });
  for (const m of req.messages) out.push(wireMessage(m));
  return out;
}

function wireMessage(m: Message): unknown {
  if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  if (m.role === "assistant" && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  }
  return { role: m.role, content: m.content };
}
