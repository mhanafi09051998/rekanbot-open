import assert from "node:assert/strict";
import { test } from "node:test";
import { toWire as anthropicWire, createAnthropic } from "../src/providers/anthropic.ts";
import { createOpenAI } from "../src/providers/openai.ts";
import { createResponses, toInput } from "../src/providers/openai-responses.ts";
import type { Message, ToolSpec } from "../src/providers/types.ts";
import { collect, openaiCalls, openaiText, sse, startMock } from "./helpers.ts";

const alat: ToolSpec[] = [{ name: "read_file", description: "baca", parameters: { type: "object", properties: {} } }];
const pesan: Message[] = [{ role: "user", content: "halo" }];

test("openai: teks mengalir, usage dibaca, header Authorization dikirim", async () => {
  const mock = await startMock((_q, res) => openaiText(res, "Halo!"));
  const p = createOpenAI({ baseUrl: mock.url, apiKey: "kunci-uji" });
  const ev = await collect(p.stream({ model: "m", messages: pesan, tools: [], system: "sis" }));
  await mock.close();
  assert.deepEqual(ev.filter((e) => e.type === "text"), [{ type: "text", delta: "Halo!" }]);
  assert.deepEqual(ev.find((e) => e.type === "usage"), { type: "usage", input: 5, output: 3 });
  assert.equal(mock.requests[0]!.path, "/chat/completions");
  assert.equal(mock.requests[0]!.headers.authorization, "Bearer kunci-uji");
  assert.equal(mock.requests[0]!.body.messages[0].role, "system");
  assert.equal(mock.requests[0]!.body.stream, true);
});

test("openai: argumen alat yang terpecah digabung; dua panggilan paralel terjaga urutannya", async () => {
  const mock = await startMock((_q, res) =>
    openaiCalls(res, [
      { id: "c1", name: "read_file", args: { path: "a.txt" } },
      { id: "c2", name: "read_file", args: { path: "b.txt" } },
    ]),
  );
  const ev = await collect(createOpenAI({ baseUrl: mock.url }).stream({ model: "m", messages: pesan, tools: alat }));
  await mock.close();
  const calls = ev.filter((e) => e.type === "tool_call").map((e: any) => e.call);
  assert.deepEqual(calls, [
    { id: "c1", name: "read_file", args: { path: "a.txt" } },
    { id: "c2", name: "read_file", args: { path: "b.txt" } },
  ]);
  assert.equal(mock.requests[0]!.body.tools[0].function.name, "read_file");
});

test("openai: galat HTTP menjadi ProviderError dengan pesan server", async () => {
  const mock = await startMock((_q, res) => {
    res.writeHead(401, { "content-type": "application/json" }).end('{"error":{"message":"kunci salah"}}');
  });
  const p = createOpenAI({ baseUrl: mock.url });
  await assert.rejects(collect(p.stream({ model: "m", messages: pesan, tools: [] })), /HTTP 401.*kunci salah/);
  await mock.close();
});

test("openai: pesan assistant+alat dan hasil alat diterjemahkan ke format kawat", async () => {
  const mock = await startMock((_q, res) => openaiText(res, "ok"));
  const riwayat: Message[] = [
    { role: "user", content: "buka" },
    { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "read_file", args: { path: "x" } }] },
    { role: "tool", content: "isi", toolCallId: "t1" },
  ];
  await collect(createOpenAI({ baseUrl: mock.url }).stream({ model: "m", messages: riwayat, tools: alat }));
  await mock.close();
  const m = mock.requests[0]!.body.messages;
  assert.equal(m[1].tool_calls[0].function.arguments, '{"path":"x"}');
  assert.deepEqual(m[2], { role: "tool", tool_call_id: "t1", content: "isi" });
});

const anthropicAliran = (res: any, blok: object[]) =>
  sse(res, [
    { event: "message_start", data: { type: "message_start", message: { usage: { input_tokens: 11 } } } },
    ...blok.map((b) => ({ data: b })),
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ]);

test("anthropic: teks, tool_use dari input_json_delta, usage; header x-api-key", async () => {
  const mock = await startMock((_q, res) =>
    anthropicAliran(res, [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Membaca" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu1", name: "read_file" } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":' } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"a.txt"}' } },
      { type: "content_block_stop", index: 1 },
    ]),
  );
  const ev = await collect(createAnthropic({ baseUrl: mock.url, apiKey: "ak" }).stream({ model: "c", messages: pesan, tools: alat, system: "S" }));
  await mock.close();
  assert.deepEqual(ev.find((e) => e.type === "text"), { type: "text", delta: "Membaca" });
  assert.deepEqual((ev.find((e) => e.type === "tool_call") as any).call, { id: "tu1", name: "read_file", args: { path: "a.txt" } });
  assert.deepEqual(ev.find((e) => e.type === "usage"), { type: "usage", input: 11, output: 7 });
  const r = mock.requests[0]!;
  assert.equal(r.path, "/v1/messages");
  assert.equal(r.headers["x-api-key"], "ak");
  assert.equal(r.headers["anthropic-version"], "2023-06-01");
  assert.equal(r.body.tools[0].input_schema.type, "object");
  assert.deepEqual(r.body.system, [{ type: "text", text: "S" }]);
});

test("anthropic: jalur OAuth memakai Bearer, header beta, dan awalan sistem", async () => {
  const mock = await startMock((_q, res) => anthropicAliran(res, []));
  await collect(createAnthropic({ baseUrl: mock.url, auth: async () => "tok-oauth" }).stream({ model: "c", messages: pesan, tools: [], system: "S" }));
  await mock.close();
  const r = mock.requests[0]!;
  assert.equal(r.headers.authorization, "Bearer tok-oauth");
  assert.equal(r.headers["anthropic-beta"], "oauth-2025-04-20");
  assert.equal(r.headers["x-api-key"], undefined);
  assert.equal(r.body.system.length, 2);
  assert.match(r.body.system[0].text, /Claude Code/);
});

test("anthropic: hasil alat berurutan digabung ke satu pesan user", () => {
  const w = anthropicWire([
    { role: "user", content: "x" },
    { role: "assistant", content: "oke", toolCalls: [{ id: "a", name: "t", args: {} }, { id: "b", name: "t", args: {} }] },
    { role: "tool", content: "ra", toolCallId: "a" },
    { role: "tool", content: "rb", toolCallId: "b", isError: true },
  ]) as any[];
  assert.equal(w.length, 3);
  assert.equal(w[2].role, "user");
  assert.deepEqual(w[2].content.map((c: any) => [c.tool_use_id, c.is_error]), [["a", false], ["b", true]]);
  assert.equal(w[1].content[1].type, "tool_use");
});

test("responses: teks, function_call, usage; Authorization dan header tambahan dari auth()", async () => {
  const mock = await startMock((_q, res) =>
    sse(res, [
      { data: { type: "response.output_text.delta", delta: "Hai" } },
      { data: { type: "response.output_item.done", item: { type: "function_call", call_id: "fc1", name: "read_file", arguments: '{"path":"z"}' } } },
      { data: { type: "response.completed", response: { status: "completed", usage: { input_tokens: 4, output_tokens: 2 } } } },
    ]),
  );
  const p = createResponses({ baseUrl: mock.url, auth: async () => ({ bearer: "tk", headers: { "chatgpt-account-id": "acct-1" } }) });
  const ev = await collect(p.stream({ model: "gpt", messages: pesan, tools: alat, system: "I" }));
  await mock.close();
  assert.deepEqual(ev.find((e) => e.type === "text"), { type: "text", delta: "Hai" });
  assert.deepEqual((ev.find((e) => e.type === "tool_call") as any).call, { id: "fc1", name: "read_file", args: { path: "z" } });
  assert.deepEqual(ev.find((e) => e.type === "usage"), { type: "usage", input: 4, output: 2 });
  const r = mock.requests[0]!;
  assert.equal(r.path, "/responses");
  assert.equal(r.headers.authorization, "Bearer tk");
  assert.equal(r.headers["chatgpt-account-id"], "acct-1");
  assert.equal(r.body.instructions, "I");
  assert.equal(r.body.store, false);
  assert.equal(r.body.tools[0].name, "read_file");
});

test("responses: input memetakan assistant, function_call, dan function_call_output", () => {
  const i = toInput([
    { role: "user", content: "u" },
    { role: "assistant", content: "a", toolCalls: [{ id: "k", name: "t", args: { q: 1 } }] },
    { role: "tool", content: "out", toolCallId: "k" },
  ]) as any[];
  assert.equal(i[0].content[0].type, "input_text");
  assert.equal(i[1].content[0].type, "output_text");
  assert.deepEqual(i[2], { type: "function_call", call_id: "k", name: "t", arguments: '{"q":1}' });
  assert.deepEqual(i[3], { type: "function_call_output", call_id: "k", output: "out" });
});
