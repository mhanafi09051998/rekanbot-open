import type { Tool, TodoItem } from "./types.ts";

const TANDA = { pending: "[ ]", in_progress: "[~]", completed: "[x]" } as const;

export const todoWrite: Tool = {
  kind: "read",
  spec: {
    name: "todo_write",
    description:
      "Tulis ulang daftar tugas untuk pekerjaan multi-langkah. Kirim seluruh daftar tiap kali; satu item in_progress pada satu waktu.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            },
            required: ["content", "status"],
          },
        },
      },
      required: ["todos"],
    },
  },
  summary: () => "Perbarui daftar tugas",
  async run(a, ctx) {
    const mentah = a.todos;
    if (!Array.isArray(mentah)) throw new Error("'todos' wajib berupa larik");
    const baru: TodoItem[] = mentah.map((t) => {
      const o = t as Record<string, unknown>;
      const status = o.status === "in_progress" || o.status === "completed" ? o.status : "pending";
      return { content: String(o.content ?? "").slice(0, 300), status };
    });
    ctx.todos.splice(0, ctx.todos.length, ...baru);
    ctx.onTodos?.(baru);
    return baru.map((t) => `${TANDA[t.status]} ${t.content}`).join("\n") || "(daftar kosong)";
  },
};
