// Memotret pratinjau aplikasi desktop untuk README: percakapan, dialog izin, dan pengaturan.
// Menjalankan Electron sungguhan (atau REKANBOT_EXE) melawan server OpenAI tiruan dengan skenario tetap.
// Folder kerja contoh sengaja memakai jalur pendek agar nama pengguna OS tidak muncul di gambar.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keluar = join(root, "docs", "preview");
const proyek = process.platform === "win32" ? "C:\\proyek-contoh" : "/tmp/proyek-contoh";
const exeTerpasang = process.env.REKANBOT_EXE;
const electronExe = exeTerpasang ?? createRequire(import.meta.url)("electron");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- proyek contoh dengan bug nyata
rmSync(proyek, { recursive: true, force: true });
mkdirSync(proyek, { recursive: true });
writeFileSync(join(proyek, "util.mjs"), "export function rata(angka) {\n  return angka.reduce((a, b) => a + b, 0) / (angka.length + 1);\n}\n");
writeFileSync(join(proyek, "test.mjs"), "import assert from 'node:assert/strict';\nimport { rata } from './util.mjs';\n\nassert.equal(rata([2, 4, 6]), 4);\nconsole.log('ok: rata-rata benar');\n");

// ---- server OpenAI tiruan dengan skenario tetap
const alat = (id, name, args) => ({ id, name, args });
const SKENARIO = [
  [alat("a", "todo_write", { todos: [{ content: "Baca util.mjs", status: "in_progress" }, { content: "Perbaiki rumus rata-rata", status: "pending" }, { content: "Jalankan tes untuk bukti", status: "pending" }] }), alat("b", "read_file", { path: "util.mjs" })],
  [alat("c", "edit_file", { path: "util.mjs", old_string: "(angka.length + 1)", new_string: "angka.length" })],
  [alat("d", "bash", { command: "node test.mjs" })],
  [alat("e", "todo_write", { todos: [{ content: "Baca util.mjs", status: "completed" }, { content: "Perbaiki rumus rata-rata", status: "completed" }, { content: "Jalankan tes untuk bukti", status: "completed" }] })],
  "Sudah diperbaiki. Fungsi `rata` membagi dengan `angka.length + 1`, sehingga hasilnya selalu terlalu kecil.\n\n```js\nreturn angka.reduce((a, b) => a + b, 0) / angka.length;\n```\n\nBukti: `node test.mjs` mencetak `ok: rata-rata benar`.\n\n- Berkas diubah: `util.mjs`\n- Tes: lulus",
];
let n = 0;
const sse = (res, ev) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of ev) res.write(`data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`);
  res.end();
};
const mock = createServer((req, res) => {
  req.on("data", () => {});
  req.on("end", () => {
    const g = SKENARIO[Math.min(n++, SKENARIO.length - 1)];
    if (typeof g === "string") {
      const potong = g.match(/[\s\S]{1,18}/g);
      return sse(res, [...potong.map((t) => ({ choices: [{ delta: { content: t } }] })), { choices: [{ delta: {}, finish_reason: "stop" }] }, "[DONE]"]);
    }
    sse(res, [
      ...g.map((c, i) => ({ choices: [{ delta: { tool_calls: [{ index: i, id: c.id, function: { name: c.name, arguments: JSON.stringify(c.args) } }] } }] })),
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] }, "[DONE]",
    ]);
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

// ---- jalankan aplikasi
const userData = realpathSync(mkdtempSync(join(tmpdir(), "rb-prev-")));
writeFileSync(join(userData, "ui.json"), JSON.stringify({ cwd: proyek }));
const port = 9300 + Math.floor(Math.random() * 400);
const argsApp = [...(exeTerpasang ? [] : [join(root, "apps/desktop")]), `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`];
const app = spawn(electronExe, argsApp, { stdio: "ignore" });
const bersih = async (kode) => {
  app.kill();
  mock.close();
  await sleep(300);
  rmSync(proyek, { recursive: true, force: true });
  process.exit(kode);
};

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = t.find((x) => x.type === "page" && x.url.includes("index.html"))?.webSocketDebuggerUrl;
  } catch { /* belum siap */ }
  if (!ws) await sleep(500);
}
if (!ws) { console.error("Jendela Electron tidak muncul"); await bersih(1); }
const sock = new WebSocket(ws);
await new Promise((r) => (sock.onopen = r));
let id = 0;
const tunggu = new Map();
sock.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (j.id && tunggu.has(j.id)) (tunggu.get(j.id)(j), tunggu.delete(j.id));
};
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; tunggu.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sampai = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(150); } return false; };
const potret = async (nama) => {
  await sleep(400);
  const r = await cdp("Page.captureScreenshot", {});
  mkdirSync(keluar, { recursive: true });
  writeFileSync(join(keluar, nama), Buffer.from(r.result.data, "base64"));
  console.log("tersimpan:", `docs/preview/${nama}`);
};

try {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1080, height: 740, deviceScaleFactor: 1, mobile: false });
  await js(`window.rekanbot.saveProvider({name:'Ollama lokal',kind:'openai-compatible',model:'qwen2.5-coder:14b',baseUrl:${JSON.stringify(mockUrl)},apiKey:'k'})`);
  await js("window.rekanbot.saveProvider({name:'Anthropic',kind:'anthropic',model:'claude-sonnet-5-5'})");
  await js("window.rekanbot.saveProvider({name:'OpenRouter',kind:'openai-compatible',model:'deepseek/deepseek-chat',baseUrl:'https://openrouter.ai/api/v1'})");
  await js("window.rekanbot.setMode('auto-edit')");
  await cdp("Page.reload");
  await sleep(1200);
  await js(`(()=>{document.getElementById('prompt').value='Fungsi rata di util.mjs hasilnya selalu terlalu kecil. Perbaiki dan buktikan dengan tes.';document.getElementById('send').click();})()`);
  if (!(await sampai("document.getElementById('approval').open"))) throw new Error("dialog izin tidak muncul");
  await potret("izin.png");
  await js("[...document.querySelectorAll('#approval .btn')].find(b=>b.textContent==='Izinkan').click()");
  if (!(await sampai("document.getElementById('log').innerText.includes('Tes: lulus') && document.getElementById('send').textContent==='Kirim'"))) throw new Error("percakapan tidak selesai");
  await js("document.getElementById('log').scrollTop = 0");
  await potret("obrolan.png");
  await js("document.getElementById('settings-btn').click()");
  if (!(await sampai("document.getElementById('settings').open"))) throw new Error("dialog pengaturan tidak muncul");
  await potret("pengaturan.png");
  await bersih(0);
} catch (e) {
  console.error("GAGAL:", e.message);
  await bersih(1);
}
