import { parseArgs, postJson, trimSlash } from "./http.ts";
import { readSse } from "./sse.ts";
import type { Message, Provider, StreamEvent, StreamRequest } from "./types.ts";

export interface AnthropicOptions {
  baseUrl?: string;
  apiKey?: string;
  /** Pengambil token OAuth langganan (Bearer, diperbarui otomatis). Dipakai alih-alih apiKey. */
  auth?: () => Promise<string>;
  headers?: Record<string, string>;
}

/** Awalan sistem yang lazim diminta backend untuk token OAuth langganan (belum teruji dengan akun nyata). */
export const OAUTH_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude.";

export function createAnthropic(opt: AnthropicOptions): Provider {
  return {
    id: "anthropic",
    async *stream(req: StreamRequest): AsyncGenerator<StreamEvent> {
      const headers: Record<string, string> = { "anthropic-version": "2023-06-01", ...(opt.headers ?? {}) };
      const system: { type: string; text: string }[] = [];
      if (opt.auth) {
        headers.authorization = `Bearer ${await opt.auth()}`;
        headers["anthropic-beta"] = "oauth-2025-04-20";
        system.push({ type: "text", text: OAUTH_SYSTEM_PREFIX });
      } else if (opt.apiKey) headers["x-api-key"] = opt.apiKey;
      if (req.system) system.push({ type: "text", text: req.system });
      const body = {
        model: req.model,
        stream: true,
        max_tokens: req.maxTokens ?? 8192,
        ...(system.length ? { system } : {}),
        messages: toWire(req.messages),
        ...(req.tools.length
          ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
          : {}),
      };
      const url = `${trimSlash(opt.baseUrl ?? "https://api.anthropic.com")}/v1/messages`;
      const res = await postJson(url, body, headers, req.signal);
      const blok = new Map<number, { id: string; name: string; json: string }>();
      let masuk = 0;
      let stop = "end_turn";
      for await (const m of readSse(res)) {
        let j: any;
        try {
          j = JSON.parse(m.data);
        } catch {
          continue;
        }
        if (j.type === "message_start") masuk = j.message?.usage?.input_tokens ?? 0;
        else if (j.type === "content_block_start" && j.content_block?.type === "tool_use") {
          blok.set(j.index, { id: j.content_block.id, name: j.content_block.name, json: "" });
        } else if (j.type === "content_block_delta") {
          if (j.delta?.type === "text_delta") yield { type: "text", delta: String(j.delta.text) };
          else if (j.delta?.type === "input_json_delta") {
            const b = blok.get(j.index);
            if (b) b.json += j.delta.partial_json ?? "";
          }
        } else if (j.type === "content_block_stop") {
          const b = blok.get(j.index);
          if (b) {
            yield { type: "tool_call", call: { id: b.id, name: b.name, args: parseArgs(b.json) } };
            blok.delete(j.index);
          }
        } else if (j.type === "message_delta") {
          if (j.delta?.stop_reason) stop = j.delta.stop_reason;
          if (j.usage) yield { type: "usage", input: masuk, output: j.usage.output_tokens ?? 0 };
        } else if (j.type === "error") {
          throw new Error(`Anthropic: ${j.error?.message ?? "galat tak dikenal"}`);
        }
      }
      yield { type: "done", stop };
    },
  };
}

/** Hasil alat berurutan digabung menjadi satu pesan user berisi blok tool_result. */
export function toWire(messages: Message[]): unknown[] {
  const out: { role: string; content: any[] }[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const blk = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content, is_error: !!m.isError };
      const last = out[out.length - 1];
      if (last && last.role === "user" && last.content.every((c) => c.type === "tool_result")) last.content.push(blk);
      else out.push({ role: "user", content: [blk] });
    } else if (m.role === "assistant") {
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      if (content.length) out.push({ role: "assistant", content });
    } else {
      out.push({ role: "user", content: [{ type: "text", text: m.content }] });
    }
  }
  return out;
}
