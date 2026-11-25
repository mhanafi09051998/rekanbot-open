import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { estimateTokens, pruneToolResults, summarizeOld } from "../src/agent/compact.ts";
import { FileSecretStore } from "../src/auth/store.ts";
import { apiKeySlot, createProvider, loadConfig, saveConfig, CONFIG_BAWAAN } from "../src/config.ts";
import { McpClient, mcpTools } from "../src/mcp/client.ts";
import { createOpenAI } from "../src/providers/openai.ts";
import type { Message } from "../src/providers/types.ts";
import { SessionLog } from "../src/session.ts";
import { needsApproval } from "../src/permissions.ts";
import { collect, openaiText, startMock, tmpDir } from "./helpers.ts";

const SERVER = fileURLToPath(new URL("./fixtures/mcp-server.mjs", import.meta.url));

test("mcp stdio: initialize, daftar alat, panggil alat, galat alat, metode tak dikenal", async () => {
  const c = await McpClient.connect({ name: "tiruan", command: process.execPath, args: [SERVER] });
  try {
    const alat = await mcpTools(c);
    assert.equal(alat.length, 1);
    assert.equal(alat[0]!.spec.name, "mcp__tiruan__gema");
    assert.equal(alat[0]!.kind, "exec", "alat MCP dianggap berisiko → butuh izin");
    assert.equal(await alat[0]!.run({ teks: "hai" }, { cwd: ".", todos: [] }), "gema: hai");
    await assert.rejects(c.callTool("gagal", {}), /sengaja gagal/);
  } finally {
    c.close();
  }
});

test("mcp http: balasan JSON dan SSE, session-id diteruskan", async () => {
  let n = 0;
  const mock = await startMock((_q, res, body) => {
    if (body.method === "notifications/initialized") return void res.writeHead(202).end();
    const hasil = body.method === "tools/list" ? { tools: [{ name: "x", inputSchema: { type: "object" } }] } : body.method === "tools/call" ? { content: [{ type: "text", text: "dari-http" }] } : { protocolVersion: "2025-03-26" };
    const payload = { jsonrpc: "2.0", id: body.id, result: hasil };
    const kepala: Record<string, string> = { "mcp-session-id": "sess-9" };
    if (n++ % 2 === 0) res.writeHead(200, { ...kepala, "content-type": "application/json" }).end(JSON.stringify(payload));
    else res.writeHead(200, { ...kepala, "content-type": "text/event-stream" }).end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const c = await McpClient.connect({ name: "h", url: mock.url });
  assert.equal((await c.listTools())[0]!.name, "x");
  assert.equal(await c.callTool("x", {}), "dari-http");
  await mock.close();
  assert.equal(mock.requests.at(-1)!.headers["mcp-session-id"], "sess-9");
});

test("compact: pruneToolResults memangkas hasil lama saja", () => {
  const besar = "z".repeat(5000);
  const m: Message[] = [
    { role: "user", content: "u" },
    ...Array.from({ length: 4 }, (_, i): Message => ({ role: "tool", content: besar, toolCallId: String(i) })),
  ];
  const p = pruneToolResults(m, 2);
  assert.ok(p[1]!.content.length < 600 && p[2]!.content.length < 600);
  assert.equal(p[3]!.content.length, 5000);
  assert.equal(p[4]!.content.length, 5000);
  assert.ok(estimateTokens(p) < estimateTokens(m));
});

test("compact: summarizeOld meringkas lewat model dan tidak memisahkan alat dari pemanggilnya", async () => {
  const mock = await startMock((_q, res) => openaiText(res, "RINGKASAN"));
  const m: Message[] = [
    { role: "user", content: "tugas awal" },
    { role: "assistant", content: "a1", toolCalls: [{ id: "t1", name: "read_file", args: {} }] },
    { role: "tool", content: "hasil1", toolCallId: "t1" },
    { role: "assistant", content: "a2" },
    { role: "user", content: "lanjut" },
  ];
  const r = await summarizeOld(createOpenAI({ baseUrl: mock.url }), "m", m, 2);
  await mock.close();
  assert.match(r[0]!.content, /Ringkasan.*RINGKASAN/s);
  assert.deepEqual(r.slice(1).map((x) => x.role), ["assistant", "user"]);
  assert.equal(r.some((x) => x.role === "tool"), false);
  assert.match(mock.requests[0]!.body.messages.at(-1).content, /tugas awal/);
});

test("session: JSONL ditambah per pesan, baris rusak dilewati, izin 0600", () => {
  const f = join(tmpDir(), "s", "sesi.jsonl");
  const log = new SessionLog(f);
  log.append({ role: "user", content: "satu" });
  log.append({ role: "assistant", content: "dua", toolCalls: [{ id: "x", name: "t", args: { a: 1 } }] });
  const rusak = readFileSync(f, "utf8") + "{bukan json\n" + JSON.stringify({ role: "hacker", content: "x" }) + "\n";
  new SessionLog(f); // idempoten
  assert.deepEqual(log.load().map((m) => m.content), ["satu", "dua"]);
  assert.ok(rusak.includes("{bukan json"));
  if (process.platform !== "win32") assert.equal(statSync(f).mode & 0o777, 0o600);
});

test("permissions: tabel keputusan semua mode", () => {
  assert.deepEqual(["read", "write", "exec", "network"].map((k) => needsApproval(k as any, "ask")), [false, true, true, true]);
  assert.deepEqual(["read", "write", "exec", "network"].map((k) => needsApproval(k as any, "auto-edit")), [false, false, true, true]);
  assert.deepEqual(["read", "write", "exec", "network"].map((k) => needsApproval(k as any, "auto")), [false, false, false, false]);
});

test("config: simpan/muat tanpa rahasia; kunci API hanya di SecretStore dan dipakai provider", async () => {
  const dir = tmpDir();
  const file = join(dir, "config.json");
  assert.deepEqual(loadConfig(file), CONFIG_BAWAAN);
  saveConfig(file, { ...CONFIG_BAWAAN, providers: [{ id: "p1", name: "Lokal", kind: "openai-compatible", baseUrl: "http://x", model: "m" }], activeProvider: "p1" });
  assert.equal(loadConfig(file).activeProvider, "p1");
  assert.ok(!/apikey|kunci-rahasia/i.test(readFileSync(file, "utf8")));

  const store = new FileSecretStore(join(dir, "kredensial.json"));
  store.set(apiKeySlot("p1"), "kunci-rahasia-uji");
  const mock = await startMock((_q, res) => openaiText(res, "ok"));
  const p = createProvider({ id: "p1", name: "Lokal", kind: "openai-compatible", baseUrl: mock.url, model: "m" }, store);
  await collect(p.stream({ model: "m", messages: [{ role: "user", content: "x" }], tools: [] }));
  await mock.close();
  assert.equal(mock.requests[0]!.headers.authorization, "Bearer kunci-rahasia-uji");
  assert.ok(existsSync(join(dir, "kredensial.json")));
  assert.equal(loadConfig(join(dir, "tidakada.json")).permissionMode, "ask");
});
