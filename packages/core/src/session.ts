import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Message } from "./providers/types.ts";

/** Riwayat percakapan sebagai JSONL: satu pesan per baris, ditambahkan saat terjadi. */
export class SessionLog {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
  }

  append(m: Message): void {
    appendFileSync(this.file, JSON.stringify(m) + "\n", { encoding: "utf8", mode: 0o600 });
  }

  load(): Message[] {
    if (!existsSync(this.file)) return [];
    const out: Message[] = [];
    for (const baris of readFileSync(this.file, "utf8").split("\n")) {
      if (!baris.trim()) continue;
      try {
        const m = JSON.parse(baris) as Message;
        if (m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant" || m.role === "tool")) out.push(m);
      } catch {
        /* baris rusak dilewati */
      }
    }
    return out;
  }
}
