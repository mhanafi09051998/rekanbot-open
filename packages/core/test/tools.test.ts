import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bash } from "../src/tools/bash.ts";
import { editFile, listDir, readFile, writeFile } from "../src/tools/files.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import { glob, globToRegExp, grep } from "../src/tools/search.ts";
import { todoWrite } from "../src/tools/todo.ts";
import type { ToolContext } from "../src/tools/types.ts";
import { isPrivateIp, webFetch } from "../src/tools/web.ts";
import { tmpDir } from "./helpers.ts";

const ctx = (cwd: string): ToolContext => ({ cwd, todos: [] });

test("write_file lalu read_file bernomor baris, dan folder induk dibuat", async () => {
  const cwd = tmpDir();
  await writeFile.run({ path: "a/b/c.txt", content: "satu\ndua\ntiga" }, ctx(cwd));
  const out = await readFile.run({ path: "a/b/c.txt", offset: 2, limit: 1 }, ctx(cwd));
  assert.match(out, /^\s+2\tdua/);
  assert.match(out, /1 baris lagi/);
});

test("edit_file: unik berhasil, ambigu ditolak, replace_all berhasil, tak ketemu ditolak", async () => {
  const cwd = tmpDir();
  writeFileSync(join(cwd, "f.txt"), "foo bar foo");
  await assert.rejects(editFile.run({ path: "f.txt", old_string: "foo", new_string: "x" }, ctx(cwd)), /cocok di 2 tempat/);
  await editFile.run({ path: "f.txt", old_string: "bar", new_string: "BAZ" }, ctx(cwd));
  assert.equal(readFileSync(join(cwd, "f.txt"), "utf8"), "foo BAZ foo");
  await editFile.run({ path: "f.txt", old_string: "foo", new_string: "$&", replace_all: true }, ctx(cwd));
  assert.equal(readFileSync(join(cwd, "f.txt"), "utf8"), "$& BAZ $&");
  await assert.rejects(editFile.run({ path: "f.txt", old_string: "tidakada", new_string: "x" }, ctx(cwd)), /tidak ditemukan/);
});

test("alat berkas menolak keluar dari folder kerja", async () => {
  const cwd = tmpDir();
  await assert.rejects(readFile.run({ path: "../x" }, ctx(cwd)), /di luar folder kerja/);
  await assert.rejects(writeFile.run({ path: "../x", content: "y" }, ctx(cwd)), /di luar folder kerja/);
  await assert.rejects(listDir.run({ path: ".." }, ctx(cwd)), /di luar folder kerja/);
});

test("list_dir menandai folder", async () => {
  const cwd = tmpDir();
  mkdirSync(join(cwd, "d"));
  writeFileSync(join(cwd, "f.txt"), "");
  assert.equal(await listDir.run({}, ctx(cwd)), "d/\nf.txt");
});

test("glob: pola * dan ** dan mengabaikan node_modules", async () => {
  const cwd = tmpDir();
  for (const f of ["src/a.ts", "src/deep/b.ts", "src/c.js", "node_modules/x/d.ts", "top.ts"]) {
    mkdirSync(join(cwd, f, ".."), { recursive: true });
    writeFileSync(join(cwd, f), "");
  }
  const semua = await glob.run({ pattern: "**/*.ts" }, ctx(cwd));
  assert.deepEqual(semua.split("\n"), ["src/a.ts", "src/deep/b.ts", "top.ts"]);
  assert.equal(await glob.run({ pattern: "src/*.ts" }, ctx(cwd)), "src/a.ts");
  assert.ok(globToRegExp("*.ts").test("a.ts") && !globToRegExp("*.ts").test("d/a.ts"));
});

test("grep: nomor baris, filter glob, huruf besar-kecil, regex salah", async () => {
  const cwd = tmpDir();
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, "src/a.ts"), "const Halo = 1;\nlet x = 2;\n");
  writeFileSync(join(cwd, "src/b.md"), "halo dunia\n");
  const r = await grep.run({ pattern: "halo", ignore_case: true, glob: "*.ts" }, ctx(cwd));
  assert.equal(r, "src/a.ts:1:const Halo = 1;");
  assert.equal(await grep.run({ pattern: "tidakada" }, ctx(cwd)), "(tidak ada yang cocok)");
  await assert.rejects(grep.run({ pattern: "(" }, ctx(cwd)), /Regex tidak valid/);
});

test("bash: keluaran dan kode keluar, dan batas waktu menghentikan proses", async () => {
  const cwd = tmpDir();
  const ok = await bash.run({ command: "echo halo" }, ctx(cwd));
  assert.match(ok, /halo/);
  assert.match(ok, /kode keluar: 0/);
  const gagal = await bash.run({ command: process.platform === "win32" ? "exit 3" : "exit 3" }, ctx(cwd));
  assert.match(gagal, /kode keluar: 3/);
  const mulai = Date.now();
  const lama = await bash.run({ command: process.platform === "win32" ? "Start-Sleep 20" : "sleep 20", timeout_ms: 500 }, ctx(cwd));
  assert.match(lama, /melewati batas waktu/);
  assert.ok(Date.now() - mulai < 8000, "harus berhenti jauh sebelum 20 detik");
});

test("bash: sinyal abort membatalkan perintah", async () => {
  const cwd = tmpDir();
  const ac = new AbortController();
  const p = bash.run({ command: process.platform === "win32" ? "Start-Sleep 20" : "sleep 20" }, { cwd, todos: [], signal: ac.signal });
  setTimeout(() => ac.abort(), 300);
  await assert.rejects(p, /Dibatalkan/);
});

test("todo_write menyimpan dan memformat daftar", async () => {
  const c = ctx(tmpDir());
  const out = await todoWrite.run({ todos: [{ content: "a", status: "completed" }, { content: "b", status: "in_progress" }, { content: "c", status: "aneh" }] }, c);
  assert.equal(out, "[x] a\n[~] b\n[ ] c");
  assert.equal(c.todos.length, 3);
});

test("web_fetch menolak alamat privat dan skema selain http(s)", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1"]) {
    assert.ok(isPrivateIp(ip), ip);
  }
  assert.ok(!isPrivateIp("93.184.216.34") && !isPrivateIp("1.1.1.1"));
  await assert.rejects(webFetch.run({ url: "http://127.0.0.1:1/" }, ctx(tmpDir())), /privat/);
  await assert.rejects(webFetch.run({ url: "http://localhost/" }, ctx(tmpDir())), /privat/);
  await assert.rejects(webFetch.run({ url: "file:///etc/passwd" }, ctx(tmpDir())), /http/);
});

test("registry: alat tak dikenal dan galat alat kembali sebagai teks, bukan lempar", async () => {
  const reg = new ToolRegistry();
  const cwd = tmpDir();
  const a = await reg.execute({ id: "1", name: "nope", args: {} }, ctx(cwd));
  assert.ok(a.isError && /tidak dikenal/.test(a.output));
  const b = await reg.execute({ id: "2", name: "read_file", args: { path: "tidakada.txt" } }, ctx(cwd));
  assert.ok(b.isError && b.output.startsWith("Galat:"));
  assert.deepEqual(reg.only(["read"]).specs().map((s) => s.name).sort(), ["glob", "grep", "list_dir", "read_file", "todo_write"]);
});
