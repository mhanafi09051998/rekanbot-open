import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runAgent, type AgentEvent } from "../src/agent/loop.ts";
import { createOpenAI } from "../src/providers/openai.ts";
import type { Message } from "../src/providers/types.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import { makeTaskTool } from "../src/tools/task.ts";
import { openaiCalls, openaiText, startMock, tmpDir } from "./helpers.ts";

/** Skrip percakapan: giliran ke-n dijawab skrip[n] (teks atau daftar panggilan alat). */
type Giliran = string | { id: string; name: string; args: object }[];
function skripMock(skrip: Giliran[]) {
  return startMock((_q, res, _b, n) => {
    const g = skrip[Math.min(n, skrip.length - 1)]!;
    typeof g === "string" ? openaiText(res, g) : openaiCalls(res, g);
  });
}

async function jalankan(mockUrl: string, cwd: string, mode: "ask" | "auto-edit" | "auto", approve: (s: string) => boolean, prompt = "kerjakan", ekstra: Partial<Parameters<typeof runAgent>[0]> = {}) {
  const messages: Message[] = [{ role: "user", content: prompt }];
  const events: AgentEvent[] = [];
  const diminta: string[] = [];
  await runAgent({
    provider: createOpenAI({ baseUrl: mockUrl }),
    model: "m",
    messages,
    tools: new ToolRegistry(),
    cwd,
    mode,
    approve: async (r) => (diminta.push(r.tool), approve(r.tool)),
    onEvent: (e) => events.push(e),
    ...ekstra,
  });
  return { messages, events, diminta };
}

test("loop: tulis berkas lewat alat, lalu model menyimpulkan (mode auto-edit tanpa tanya)", async () => {
  const cwd = tmpDir();
  const mock = await skripMock([[{ id: "w1", name: "write_file", args: { path: "hi.txt", content: "halo" } }], "Selesai membuat hi.txt"]);
  const { messages, events, diminta } = await jalankan(mock.url, cwd, "auto-edit", () => true);
  await mock.close();
  assert.equal(readFileSync(join(cwd, "hi.txt"), "utf8"), "halo");
  assert.deepEqual(diminta, []);
  assert.deepEqual(events.at(-1), { type: "done", reason: "end" });
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "tool", "assistant"]);
  assert.equal(messages[2]!.toolCallId, "w1");
  // giliran ke-2 harus membawa hasil alat ke model
  const kedua = mock.requests[1]!.body.messages;
  assert.equal(kedua.at(-1).role, "tool");
  assert.match(kedua.at(-1).content, /Tertulis hi\.txt/);
});

test("loop: mode ask meminta izin; ditolak berarti berkas TIDAK dibuat dan model diberi tahu", async () => {
  const cwd = tmpDir();
  const mock = await skripMock([[{ id: "w1", name: "write_file", args: { path: "x.txt", content: "z" } }], "Baik, dibatalkan"]);
  const { messages, diminta } = await jalankan(mock.url, cwd, "ask", () => false);
  await mock.close();
  assert.deepEqual(diminta, ["write_file"]);
  assert.equal(existsSync(join(cwd, "x.txt")), false);
  assert.match(messages[2]!.content, /menolak/);
  assert.equal(messages[2]!.isError, true);
});

test("loop: shell di mode auto-edit tetap minta izin; disetujui maka jalan", async () => {
  const cwd = tmpDir();
  const mock = await skripMock([[{ id: "b1", name: "bash", args: { command: "echo dari-shell" } }], "ok"]);
  const { messages, diminta } = await jalankan(mock.url, cwd, "auto-edit", () => true);
  await mock.close();
  assert.deepEqual(diminta, ["bash"]);
  assert.match(messages[2]!.content, /dari-shell/);
});

test("loop: alat baca-saja paralel, hasil kembali sesuai urutan panggilan", async () => {
  const cwd = tmpDir();
  writeFileSync(join(cwd, "a.txt"), "AAA");
  writeFileSync(join(cwd, "b.txt"), "BBB");
  const mock = await skripMock([
    [{ id: "r1", name: "read_file", args: { path: "a.txt" } }, { id: "r2", name: "read_file", args: { path: "b.txt" } }],
    "dua berkas terbaca",
  ]);
  const { messages, diminta } = await jalankan(mock.url, cwd, "ask", () => false);
  await mock.close();
  assert.deepEqual(diminta, [], "baca-saja tidak boleh minta izin");
  assert.deepEqual(messages.filter((m) => m.role === "tool").map((m) => [m.toolCallId, /AAA|BBB/.exec(m.content)![0]]), [["r1", "AAA"], ["r2", "BBB"]]);
});

test("loop: galat alat dikembalikan ke model sebagai hasil, loop lanjut dan pulih", async () => {
  const cwd = tmpDir();
  const mock = await skripMock([[{ id: "r1", name: "read_file", args: { path: "../rahasia" } }], "tidak bisa, di luar folder"]);
  const { messages, events } = await jalankan(mock.url, cwd, "auto", () => true);
  await mock.close();
  assert.equal(messages[2]!.isError, true);
  assert.match(messages[2]!.content, /di luar folder kerja/);
  assert.deepEqual(events.at(-1), { type: "done", reason: "end" });
});

test("loop: batas langkah menghentikan model yang memanggil alat tanpa henti", async () => {
  const cwd = tmpDir();
  const mock = await skripMock([[{ id: "l", name: "list_dir", args: {} }]]);
  const { events } = await jalankan(mock.url, cwd, "auto", () => true, "ulang", { maxSteps: 3 });
  await mock.close();
  assert.deepEqual(events.at(-1), { type: "done", reason: "max_steps" });
  assert.equal(mock.requests.length, 3);
});

test("loop: abort sebelum mulai menghasilkan done:aborted tanpa memanggil model", async () => {
  const cwd = tmpDir();
  const mock = await skripMock(["tidak boleh dipanggil"]);
  const ac = new AbortController();
  ac.abort();
  const { events } = await jalankan(mock.url, cwd, "auto", () => true, "x", { signal: ac.signal });
  await mock.close();
  assert.deepEqual(events, [{ type: "done", reason: "aborted" }]);
  assert.equal(mock.requests.length, 0);
});

test("loop: konteks melewati anggaran dipangkas dan peristiwa compacted dikirim", async () => {
  const cwd = tmpDir();
  writeFileSync(join(cwd, "besar.txt"), "x".repeat(20_000));
  const mock = await skripMock([
    ...Array.from({ length: 8 }, (_, i) => [{ id: `r${i}`, name: "read_file", args: { path: "besar.txt" } }] as Giliran),
    "selesai",
  ]);
  const { events, messages } = await jalankan(mock.url, cwd, "auto", () => true, "baca banyak", { contextBudget: 6000 });
  await mock.close();
  const c = events.find((e) => e.type === "compacted") as any;
  assert.ok(c && c.after < c.before, "harus ada pemangkasan yang menurunkan ukuran");
  assert.ok(messages.some((m) => m.role === "tool" && m.content.includes("dipangkas")));
  assert.deepEqual(events.at(-1), { type: "done", reason: "end" });
});

test("loop: todo_write memancarkan peristiwa todos", async () => {
  const cwd = tmpDir();
  const mock = await skripMock([[{ id: "t", name: "todo_write", args: { todos: [{ content: "langkah 1", status: "in_progress" }] } }], "ok"]);
  const { events } = await jalankan(mock.url, cwd, "ask", () => false);
  await mock.close();
  const t = events.find((e) => e.type === "todos") as any;
  assert.deepEqual(t.todos, [{ content: "langkah 1", status: "in_progress" }]);
});

test("task: sub-agen baca-saja menjawab dan tidak bisa menulis", async () => {
  const cwd = tmpDir();
  writeFileSync(join(cwd, "p.txt"), "isi p");
  // urutan permintaan: utama→task; sub→read_file; sub→jawaban; utama→teks akhir
  const mock = await skripMock([
    [{ id: "k", name: "task", args: { prompt: "apa isi p.txt?" } }],
    [{ id: "s1", name: "read_file", args: { path: "p.txt" } }],
    "p.txt berisi 'isi p'",
    "Sub-agen melapor: p.txt berisi isi p",
  ]);
  const registry = new ToolRegistry();
  const provider = createOpenAI({ baseUrl: mock.url });
  registry.add(makeTaskTool(provider, "m", registry));
  const messages: Message[] = [{ role: "user", content: "tanya sub-agen" }];
  await runAgent({ provider, model: "m", messages, tools: registry, cwd, mode: "ask", approve: async () => false, onEvent: () => {} });
  await mock.close();
  const hasilTask = messages.find((m) => m.role === "tool")!;
  assert.match(hasilTask.content, /isi p/);
  const alatSub = mock.requests[1]!.body.tools.map((t: any) => t.function.name).sort();
  assert.deepEqual(alatSub, ["glob", "grep", "list_dir", "read_file"]);
});
