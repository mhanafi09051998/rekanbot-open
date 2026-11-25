import type { ToolSpec } from "../providers/types.ts";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/** Konteks yang diteruskan ke setiap alat. */
export interface ToolContext {
  /** Folder kerja: semua jalur dikurung di sini. */
  cwd: string;
  signal?: AbortSignal;
  /** Daftar tugas bersama (dipakai alat todo_write). */
  todos: TodoItem[];
  /** Dipanggil alat todo_write agar UI bisa menampilkan daftar terbaru. */
  onTodos?: (todos: TodoItem[]) => void;
}

export type ToolKind = "read" | "write" | "exec" | "network";

export interface Tool {
  spec: ToolSpec;
  /** read: tanpa efek samping (boleh paralel). write/exec/network: perlu izin menurut mode. */
  kind: ToolKind;
  /** Ringkasan satu baris untuk dialog persetujuan. */
  summary(args: Record<string, unknown>): string;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

export function str(args: Record<string, unknown>, k: string, wajib = true): string {
  const v = args[k];
  if (typeof v === "string") return v;
  if (wajib) throw new Error(`Argumen '${k}' wajib berupa teks`);
  return "";
}

export function num(args: Record<string, unknown>, k: string): number | undefined {
  const v = args[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
