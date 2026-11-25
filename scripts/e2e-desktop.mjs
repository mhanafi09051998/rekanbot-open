// Uji ujung-ke-ujung aplikasi desktop: jalankan Electron sungguhan, kendalikan lewat CDP,
// lawan server OpenAI tiruan. Membuktikan: provider tersimpan terenkripsi, gerbang izin, tulis berkas, penolakan.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronExe = createRequire(import.meta.url)("electron");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gagal = [];
const cek = (ok, nama, rinci = "") => {
  console.log(`${ok ? "✔" : "✖"} ${nama}${ok || !rinci ? "" : `\n    ${rinci}`}`);
  if (!ok) gagal.push(nama);
};

// ---- server OpenAI tiruan: giliran 0,2 = tool call write_file; giliran 1,3 = teks akhir
const permintaan = [];
const sse = (res, ev) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of ev) res.write(`data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`);
  res.end();
};
const mock = createServer((req, res) => {
  const potong = [];
  req.on("data", (c) => potong.push(c));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(potong).toString("utf8") || "{}");
    permintaan.push({ auth: req.headers.authorization, body });
    const n = permintaan.length - 1;
    if (n === 0 || n === 2) {
      const file = n === 0 ? "halo.txt" : "ditolak.txt";
      const j = JSON.stringify({ path: file, content: "dari-desktop" });
      sse(res, [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: `c${n}`, function: { name: "write_file", arguments: j.slice(0, 10) } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: j.slice(10) } }] } }] },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] }, "[DONE]",
      ]);
    } else sse(res, [{ choices: [{ delta: { content: n === 1 ? "SELESAI-SATU" : "SELESAI-DUA" } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }, "[DONE]"]);
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

// ---- data uji terisolasi
const userData = realpathSync(mkdtempSync(join(tmpdir(), "rb-ud-")));
const kerja = realpathSync(mkdtempSync(join(tmpdir(), "rb-kerja-")));
writeFileSync(join(userData, "ui.json"), JSON.stringify({ cwd: kerja }));
const port = 9300 + Math.floor(Math.random() * 400);
const app = spawn(electronExe, [join(root, "apps/desktop"), `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: ["ignore", "pipe", "pipe"] });
let logApp = "";
app.stdout.on("data", (d) => (logApp += d));
app.stderr.on("data", (d) => (logApp += d));

async function selesai(kode) {
  app.kill();
  mock.close();
  await sleep(300);
  if (gagal.length) console.log(`\nGAGAL (${gagal.length}): ${gagal.join("; ")}\n--- log aplikasi ---\n${logApp.slice(-1500)}`);
  process.exit(kode);
}

// ---- klien CDP minimal
async function sambung() {
  for (let i = 0; i < 60; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const p = t.find((x) => x.type === "page" && x.url.includes("index.html"));
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* belum siap */ }
    await sleep(500);
  }
  throw new Error("Jendela Electron tidak muncul");
}
const ws = new WebSocket(await sambung());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const tunggu = new Map();
ws.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (j.id && tunggu.has(j.id)) (tunggu.get(j.id)(j), tunggu.delete(j.id));
};
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
  return r.result?.result?.value;
};
async function sampai(expr, ms = 15000) {
  const mulai = Date.now();
  while (Date.now() - mulai < ms) {
    if (await js(expr)) return true;
    await sleep(150);
  }
  return false;
}

try {
  // 1) UI hidup dan jembatan aman
  cek(await js("typeof window.rekanbot.send === 'function'"), "preload mengekspos API rekanbot");
  cek((await js("typeof require + '|' + typeof process")) === "undefined|undefined", "renderer tidak punya akses Node (require/process)");
  const awal = await js("window.rekanbot.getState()");
  cek(awal.cwd === kerja && awal.providers.length === 0 && awal.mode === "ask", "state awal: folder kerja benar, tanpa provider, mode ask", JSON.stringify(awal));

  // 2) simpan provider (kunci terenkripsi OS)
  const s = await js(`window.rekanbot.saveProvider({name:'Mock',kind:'openai-compatible',model:'m',baseUrl:${JSON.stringify(mockUrl)},apiKey:'kunci-e2e-rahasia'})`);
  cek(s.providers.length === 1 && s.providers[0].hasKey && s.active === s.providers[0].id, "provider tersimpan dan aktif", JSON.stringify(s));
  const enc = readFileSync(join(userData, "credentials.enc.json"), "utf8");
  cek(!enc.includes("kunci-e2e-rahasia"), "kunci API TIDAK tersimpan sebagai teks polos di disk");
  cek(!readFileSync(join(userData, "config.json"), "utf8").includes("kunci-e2e-rahasia"), "kunci API tidak ada di config.json");

  // 3) kirim pesan → dialog izin → izinkan → berkas tertulis
  await js(`(()=>{const t=document.getElementById('prompt');t.value='buat halo.txt';document.getElementById('send').click();})()`);
  cek(await sampai("document.getElementById('approval').open"), "dialog izin muncul untuk write_file (mode ask)");
  const teksDlg = await js("document.getElementById('approval').innerText");
  cek(/halo\.txt/.test(teksDlg), "dialog menyebut berkas yang akan ditulis", teksDlg);
  cek(!existsSync(join(kerja, "halo.txt")), "berkas BELUM ditulis sebelum diizinkan");
  await cdp("Page.captureScreenshot", {}).then((r) => writeFileSync(join(tmpdir(), "rb-e2e-izin.png"), Buffer.from(r.result.data, "base64")));
  await js("[...document.querySelectorAll('#approval .btn')].find(b=>b.textContent==='Izinkan').click()");
  cek(await sampai("document.getElementById('log').innerText.includes('SELESAI-SATU')"), "respons akhir model tampil di transkrip");
  cek(existsSync(join(kerja, "halo.txt")) && readFileSync(join(kerja, "halo.txt"), "utf8") === "dari-desktop", "berkas halo.txt tertulis setelah diizinkan");
  cek(permintaan[0].auth === "Bearer kunci-e2e-rahasia", "kunci terdekripsi dan dikirim sebagai Authorization ke provider");
  cek((await js("document.querySelectorAll('.tool.ok').length")) >= 1, "kartu alat tampil dengan status ok");
  await cdp("Page.captureScreenshot", {}).then((r) => writeFileSync(join(tmpdir(), "rb-e2e-hasil.png"), Buffer.from(r.result.data, "base64")));

  // 4) tolak izin → berkas tidak dibuat
  await js(`(()=>{const t=document.getElementById('prompt');t.value='buat ditolak.txt';document.getElementById('send').click();})()`);
  cek(await sampai("document.getElementById('approval').open"), "dialog izin muncul lagi untuk permintaan kedua");
  await js("[...document.querySelectorAll('#approval .btn')].find(b=>b.textContent==='Tolak').click()");
  cek(await sampai("document.getElementById('log').innerText.includes('SELESAI-DUA')"), "model menerima penolakan dan menyelesaikan giliran");
  cek(!existsSync(join(kerja, "ditolak.txt")), "berkas TIDAK dibuat setelah ditolak");
  const tool2 = permintaan[3].body.messages.at(-1);
  cek(tool2.role === "tool" && /menolak/.test(tool2.content), "model diberi tahu bahwa pengguna menolak");

  // 5) mode dan folder tidak bocor
  cek((await js("window.rekanbot.setMode('auto-edit')")).mode === "auto-edit", "mode izin bisa diubah");
  cek(readdirSync(kerja).sort().join() === "halo.txt", "folder kerja hanya berisi berkas yang diizinkan", readdirSync(kerja).join());
} catch (e) {
  cek(false, "skenario e2e berjalan tanpa galat", String(e.stack ?? e));
}
await selesai(gagal.length ? 1 : 0);
