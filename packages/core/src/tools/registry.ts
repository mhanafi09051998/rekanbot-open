import type { ToolCall, ToolSpec } from "../providers/types.ts";
import { bash } from "./bash.ts";
import { editFile, listDir, readFile, writeFile } from "./files.ts";
import { glob, grep } from "./search.ts";
import { truncate } from "./sandbox.ts";
import { todoWrite } from "./todo.ts";
import type { Tool, ToolContext } from "./types.ts";
import { webFetch } from "./web.ts";

export const TOOLS_BAWAAN: Tool[] = [readFile, writeFile, editFile, listDir, glob, grep, bash, webFetch, todoWrite];

export class ToolRegistry {
  private readonly map = new Map<string, Tool>();

  constructor(tools: Tool[] = TOOLS_BAWAAN) {
    for (const t of tools) this.add(t);
  }

  add(t: Tool): void {
    this.map.set(t.spec.name, t);
  }

  get(nama: string): Tool | undefined {
    return this.map.get(nama);
  }

  specs(): ToolSpec[] {
    return [...this.map.values()].map((t) => t.spec);
  }

  /** Salinan registry tanpa alat selain yang diizinkan (untuk sub-agen baca-saja). */
  only(kind: Tool["kind"][]): ToolRegistry {
    return new ToolRegistry([...this.map.values()].filter((t) => kind.includes(t.kind)));
  }

  without(nama: string): ToolRegistry {
    return new ToolRegistry([...this.map.values()].filter((t) => t.spec.name !== nama));
  }

  /** Jalankan satu panggilan; galat alat dikembalikan sebagai teks (bukan dilempar) agar model bisa memperbaiki. */
  async execute(call: ToolCall, ctx: ToolContext): Promise<{ output: string; isError: boolean }> {
    const tool = this.map.get(call.name);
    if (!tool) return { output: `Alat tidak dikenal: ${call.name}`, isError: true };
    try {
      return { output: truncate(await tool.run(call.args, ctx)), isError: false };
    } catch (e) {
      return { output: `Galat: ${(e as Error).message}`, isError: true };
    }
  }
}
