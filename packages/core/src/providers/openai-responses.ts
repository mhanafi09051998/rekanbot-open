import { parseArgs, postJson, trimSlash } from "./http.ts";
import { readSse } from "./sse.ts";
import type { Message, Provider, StreamEvent, StreamRequest } from "./types.ts";

export interface ResponsesOptions {
  baseUrl: string;
  apiKey?: string;
  /** Pengambil token + header tambahan (mis. chatgpt-account-id) untuk jalur OAuth. */
  auth?: () => Promise<{ bearer: string; headers?: Record<string, string> }>;
  headers?: Record<string, string>;
}

/** Responses API: dipakai jalur Codex (ChatGPT) dan OpenAI baru. */
export function createResponses(opt: ResponsesOptions): Provider {
  return {
    id: "openai-responses",
    async *stream(req: StreamRequest): AsyncGenerator<StreamEvent> {
      const headers: Record<string, string> = { accept: "text/event-stream", ...(opt.headers ?? {}) };
      if (opt.auth) {
        const a = await opt.auth();
        headers.authorization = `Bearer ${a.bearer}`;
        Object.assign(headers, a.headers ?? {});
      } else if (opt.apiKey) headers.authorization = `Bearer ${opt.apiKey}`;
      const body = {
        model: req.model,
        stream: true,
        store: false,
        instructions: req.system ?? "",
        input: toInput(req.messages),
        tools: req.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })),
        tool_choice: "auto",
        parallel_tool_calls: true,
      };
      const res = await postJson(`${trimSlash(opt.baseUrl)}/responses`, body, headers, req.signal);
      let stop = "stop";
      for await (const m of readSse(res)) {
        let j: any;
        try {
          j = JSON.parse(m.data);
        } catch {
          continue;
        }
        if (j.type === "response.output_text.delta") yield { type: "text", delta: String(j.delta ?? "") };
        else if (j.type === "response.output_item.done" && j.item?.type === "function_call") {
          const it = j.item;
          yield { type: "tool_call", call: { id: it.call_id ?? it.id, name: it.name, args: parseArgs(it.arguments ?? "") } };
        } else if (j.type === "response.completed") {
          const u = j.response?.usage;
          if (u) yield { type: "usage", input: u.input_tokens ?? 0, output: u.output_tokens ?? 0 };
          stop = j.response?.status ?? stop;
        } else if (j.type === "response.failed" || j.type === "error") {
          throw new Error(`Responses: ${j.response?.error?.message ?? j.message ?? "gagal"}`);
        }
      }
      yield { type: "done", stop };
    },
  };
}

export function toInput(messages: Message[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === "tool") out.push({ type: "function_call_output", call_id: m.toolCallId, output: m.content });
    else if (m.role === "assistant") {
      if (m.content) out.push({ role: "assistant", content: [{ type: "output_text", text: m.content }] });
      for (const c of m.toolCalls ?? [])
        out.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.args) });
    } else out.push({ role: "user", content: [{ type: "input_text", text: m.content }] });
  }
  return out;
}
