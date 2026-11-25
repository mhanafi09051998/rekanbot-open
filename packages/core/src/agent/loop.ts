import { needsApproval, type Approver, type PermissionMode } from "../permissions.ts";
import type { Message, Provider, ToolCall } from "../providers/types.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { TodoItem, ToolContext } from "../tools/types.ts";
import { estimateTokens, pruneToolResults, summarizeOld } from "./compact.ts";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; call: ToolCall; summary: string }
  | { type: "tool_result"; call: ToolCall; output: string; isError: boolean }
  | { type: "todos"; todos: TodoItem[] }
  | { type: "usage"; input: number; output: number }
  | { type: "compacted"; before: number; after: number }
  | { type: "done"; reason: "end" | "max_steps" | "aborted" };

export interface RunOptions {
  provider: Provider;
  model: string;
  system?: string;
  /** Riwayat percakapan; fungsi ini menambahkan pesan baru ke larik yang sama. */
  messages: Message[];
  tools: ToolRegistry;
  cwd: string;
  mode: PermissionMode;
  approve: Approver;
  onEvent: (e: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  /** Batas konteks (token perkiraan) sebelum dipangkas/diringkas. */
  contextBudget?: number;
  todos?: TodoItem[];
}

export async function runAgent(o: RunOptions): Promise<void> {
  const todos = o.todos ?? [];
  const ctx: ToolContext = { cwd: o.cwd, signal: o.signal, todos, onTodos: (t) => o.onEvent({ type: "todos", todos: [...t] }) };
  const maks = o.maxSteps ?? 40;
  const budget = o.contextBudget ?? 100_000;

  for (let langkah = 0; langkah < maks; langkah++) {
    if (o.signal?.aborted) return o.onEvent({ type: "done", reason: "aborted" });
    await jagaKonteks(o, budget);

    let teks = "";
    const panggilan: ToolCall[] = [];
    try {
      for await (const ev of o.provider.stream({
        model: o.model,
        system: o.system,
        messages: o.messages,
        tools: o.tools.specs(),
        signal: o.signal,
      })) {
        if (ev.type === "text") {
          teks += ev.delta;
          o.onEvent(ev);
        } else if (ev.type === "tool_call") panggilan.push(ev.call);
        else if (ev.type === "usage") o.onEvent(ev);
      }
    } catch (e) {
      if (o.signal?.aborted) return o.onEvent({ type: "done", reason: "aborted" });
      throw e;
    }

    o.messages.push({ role: "assistant", content: teks, ...(panggilan.length ? { toolCalls: panggilan } : {}) });
    if (!panggilan.length) return o.onEvent({ type: "done", reason: "end" });

    const hasil = await jalankanAlat(o, panggilan, ctx);
    for (const h of hasil) o.messages.push(h);
  }
  o.onEvent({ type: "done", reason: "max_steps" });
}

async function jagaKonteks(o: RunOptions, budget: number): Promise<void> {
  const sebelum = estimateTokens(o.messages, o.system);
  if (sebelum <= budget) return;
  // Pangkas bertahap: simpan 6, lalu 3, lalu 1 hasil alat terbaru utuh, berhenti begitu muat.
  let sesudah = sebelum;
  for (const simpan of [6, 3, 1]) {
    o.messages.splice(0, o.messages.length, ...pruneToolResults(o.messages, simpan));
    sesudah = estimateTokens(o.messages, o.system);
    if (sesudah <= budget) break;
  }
  if (sesudah > budget) {
    const ringkas = await summarizeOld(o.provider, o.model, o.messages, 8, o.signal);
    o.messages.splice(0, o.messages.length, ...ringkas);
    sesudah = estimateTokens(o.messages, o.system);
  }
  o.onEvent({ type: "compacted", before: sebelum, after: sesudah });
}

/** Alat baca-saja dijalankan paralel; sisanya berurutan dan melewati gerbang izin. Urutan hasil = urutan panggilan. */
async function jalankanAlat(o: RunOptions, panggilan: ToolCall[], ctx: ToolContext): Promise<Message[]> {
  const out = new Map<string, Message>();
  const msg = (c: ToolCall, output: string, isError: boolean): Message => ({ role: "tool", content: output, toolCallId: c.id, isError });

  const jalan = async (c: ToolCall): Promise<void> => {
    const tool = o.tools.get(c.name);
    const ringkasan = tool ? tool.summary(c.args) : c.name;
    if (tool && needsApproval(tool.kind, o.mode)) {
      const ok = await o.approve({ tool: c.name, kind: tool.kind, summary: ringkasan, args: c.args });
      if (!ok) {
        o.onEvent({ type: "tool_result", call: c, output: "Ditolak pengguna", isError: true });
        out.set(c.id, msg(c, "Pengguna menolak menjalankan alat ini. Tanyakan arahan atau coba pendekatan lain.", true));
        return;
      }
    }
    o.onEvent({ type: "tool_start", call: c, summary: ringkasan });
    const r = await o.tools.execute(c, ctx);
    o.onEvent({ type: "tool_result", call: c, output: r.output, isError: r.isError });
    out.set(c.id, msg(c, r.output, r.isError));
  };

  const baca = panggilan.filter((c) => o.tools.get(c.name)?.kind === "read");
  const lain = panggilan.filter((c) => o.tools.get(c.name)?.kind !== "read");
  await Promise.all(baca.map(jalan));
  for (const c of lain) {
    if (o.signal?.aborted) {
      out.set(c.id, msg(c, "Dibatalkan", true));
      continue;
    }
    await jalan(c);
  }
  return panggilan.map((c) => out.get(c.id) ?? msg(c, "Tidak dijalankan", true));
}
