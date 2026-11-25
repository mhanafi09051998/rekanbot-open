import { runAgent } from "../agent/loop.ts";
import type { Message, Provider } from "../providers/types.ts";
import type { ToolRegistry } from "./registry.ts";
import { str, type Tool } from "./types.ts";

const SISTEM_SUB =
  "Anda sub-agen riset baca-saja. Telusuri kode dengan alat yang tersedia lalu jawab ringkas dan konkret " +
  "(sebut jalur berkas dan nomor baris). Jangan mengarang; bila tidak ketemu, katakan tidak ketemu.";

/** Sub-agen baca-saja: menjawab pertanyaan penelusuran tanpa mengotori konteks agen utama. */
export function makeTaskTool(provider: Provider, model: string, registry: ToolRegistry): Tool {
  return {
    kind: "read",
    spec: {
      name: "task",
      description:
        "Delegasikan penelusuran kode/riset ke sub-agen baca-saja (read_file, list_dir, glob, grep). Mengembalikan jawaban akhirnya. Cocok untuk pertanyaan luas.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", description: "Pertanyaan/tugas rinci untuk sub-agen" } },
        required: ["prompt"],
      },
    },
    summary: (a) => `Sub-agen: ${String(a.prompt).slice(0, 120)}`,
    async run(a, ctx) {
      const messages: Message[] = [{ role: "user", content: str(a, "prompt") }];
      let jawaban = "";
      await runAgent({
        provider,
        model,
        system: SISTEM_SUB,
        messages,
        tools: registry.only(["read"]).without("task").without("todo_write"),
        cwd: ctx.cwd,
        mode: "ask",
        approve: async () => false,
        signal: ctx.signal,
        maxSteps: 15,
        onEvent: (e) => {
          if (e.type === "text") jawaban += e.delta;
        },
      });
      return jawaban.trim() || "(sub-agen tidak memberi jawaban)";
    },
  };
}
