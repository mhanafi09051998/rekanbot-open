import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openaiCalls, openaiText, startMock, tmpDir } from "../../core/test/helpers.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

function jalankan(args: string[], env: Record<string, string>): Promise<{ kode: number | null; out: string; err: string }> {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [MAIN, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (kode) => ok({ kode, out, err }));
  });
}

const skripTulis = (giliran: number) => (_q: any, res: any) =>
  giliran === 0 ? openaiCalls(res, [{ id: "w", name: "write_file", args: { path: "halo.txt", content: "dari cli" } }]) : openaiText(res, "Selesai.");

test("cli -p --yes: agen menulis berkas lewat server tiruan, keluar 0, kunci tersimpan di HOME bukan di folder kerja", async () => {
  const mock = await startMock((q, res, b, n) => skripTulis(n)(q, res));
  const home = tmpDir();
  const cwd = tmpDir();
  const r = await jalankan(["-p", "buat halo.txt", "--kind", "openai-compatible", "--base-url", mock.url, "--model", "m", "--api-key", "kunci-cli-uji", "--yes", "--cwd", cwd], { REKANBOT_HOME: home });
  await mock.close();
  assert.equal(r.kode, 0, r.err);
  assert.equal(readFileSync(join(cwd, "halo.txt"), "utf8"), "dari cli");
  assert.match(r.out, /Selesai\./);
  assert.equal(mock.requests[0]!.headers.authorization, "Bearer kunci-cli-uji");
  assert.match(readFileSync(join(home, "credentials.json"), "utf8"), /kunci-cli-uji/);
  assert.deepEqual(readdirSync(cwd), ["halo.txt"], "tidak boleh ada berkas lain (mis. kredensial) di folder kerja");
  assert.ok(readdirSync(join(home, "sessions")).length === 1, "sesi dicatat");
});

test("cli -p tanpa --yes dan tanpa terminal: tulis berkas DITOLAK (aman secara bawaan)", async () => {
  const mock = await startMock((q, res, b, n) => skripTulis(n)(q, res));
  const home = tmpDir();
  const cwd = tmpDir();
  const r = await jalankan(["-p", "buat halo.txt", "--kind", "openai-compatible", "--base-url", mock.url, "--model", "m", "--api-key", "k", "--cwd", cwd], { REKANBOT_HOME: home });
  await mock.close();
  assert.equal(r.kode, 0, r.err);
  assert.equal(existsSync(join(cwd, "halo.txt")), false);
  const hasilAlat = mock.requests[1]!.body.messages.at(-1);
  assert.equal(hasilAlat.role, "tool");
  assert.match(hasilAlat.content, /menolak/);
});

test("cli: kegagalan provider (HTTP 500) menghasilkan kode keluar 1 dan pesan galat", async () => {
  const mock = await startMock((_q, res) => res.writeHead(500).end("boom"));
  const r = await jalankan(["-p", "x", "--kind", "openai-compatible", "--base-url", mock.url, "--model", "m", "--api-key", "k"], { REKANBOT_HOME: tmpDir() });
  await mock.close();
  assert.equal(r.kode, 1);
  assert.match(r.err, /HTTP 500/);
});

test("cli: config add-provider menyimpan kunci terpisah dari config.json; list menampilkan", async () => {
  const home = tmpDir();
  const a = await jalankan(["config", "add-provider", "--id", "lokal", "--kind", "openai-compatible", "--model", "llama", "--base-url", "http://localhost:11434/v1", "--api-key", "rahasia-config"], { REKANBOT_HOME: home });
  assert.equal(a.kode, 0, a.err);
  assert.ok(!readFileSync(join(home, "config.json"), "utf8").includes("rahasia-config"));
  assert.match(readFileSync(join(home, "credentials.json"), "utf8"), /rahasia-config/);
  const l = await jalankan(["config", "list"], { REKANBOT_HOME: home });
  assert.match(l.out, /\* lokal\topenai-compatible\tllama/);
  assert.match(l.out, /kunci tersimpan/);
  assert.doesNotMatch(l.out, /rahasia-config/, "list tidak boleh mencetak kunci");
});

test("cli: --help, flag tak dikenal, dan tanpa provider memberi pesan yang berguna", async () => {
  const h = await jalankan(["--help"], { REKANBOT_HOME: tmpDir() });
  assert.equal(h.kode, 0);
  assert.match(h.out, /rekanbot login claude\|codex/);
  const f = await jalankan(["--ngawur"], { REKANBOT_HOME: tmpDir() });
  assert.equal(f.kode, 1);
  assert.match(f.err, /Flag tidak dikenal/);
  const n = await jalankan(["-p", "x"], { REKANBOT_HOME: tmpDir(), ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" });
  assert.equal(n.kode, 1);
  assert.match(n.err, /Belum ada provider/);
  const s = await jalankan(["login", "bukan-claude"], { REKANBOT_HOME: tmpDir() });
  assert.equal(s.kode, 1);
});
