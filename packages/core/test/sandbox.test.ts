import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { safeResolve, truncate } from "../src/tools/sandbox.ts";
import { tmpDir } from "./helpers.ts";

test("safeResolve: jalur di dalam folder kerja diterima (termasuk berkas baru)", () => {
  const cwd = tmpDir();
  mkdirSync(join(cwd, "src"));
  assert.equal(safeResolve(cwd, "src"), join(cwd, "src"));
  assert.equal(safeResolve(cwd, "src/baru/x.ts"), join(cwd, "src", "baru", "x.ts"));
  assert.equal(safeResolve(cwd, "."), cwd);
});

test("safeResolve: '..' dan jalur absolut di luar ditolak", () => {
  const cwd = tmpDir();
  assert.throws(() => safeResolve(cwd, "../luar.txt"), /di luar folder kerja/);
  assert.throws(() => safeResolve(cwd, "a/../../luar.txt"), /di luar folder kerja/);
  assert.throws(() => safeResolve(cwd, tmpDir()), /di luar folder kerja/);
  assert.throws(() => safeResolve(cwd, process.platform === "win32" ? "C:\\Windows\\win.ini" : "/etc/passwd"), /di luar folder kerja/);
});

test("safeResolve: symlink yang menunjuk ke luar ditolak", (t) => {
  const cwd = tmpDir();
  const luar = tmpDir();
  writeFileSync(join(luar, "rahasia.txt"), "x");
  try {
    symlinkSync(luar, join(cwd, "tautan"), "junction");
  } catch {
    return t.skip("tidak bisa membuat symlink di mesin ini");
  }
  assert.throws(() => safeResolve(cwd, "tautan/rahasia.txt"), /di luar folder kerja/);
  assert.throws(() => safeResolve(cwd, "tautan/baru.txt"), /di luar folder kerja/);
});

test("truncate: memotong dan memberi penanda", () => {
  assert.equal(truncate("abc", 10), "abc");
  const t = truncate("x".repeat(100), 10);
  assert.ok(t.startsWith("xxxxxxxxxx"));
  assert.match(t, /dipotong 90 karakter/);
});
