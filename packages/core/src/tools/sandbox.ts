import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Batas keluaran alat agar konteks model tidak jebol. */
export const MAKS_KELUARAN = 30_000;

export function truncate(teks: string, maks = MAKS_KELUARAN): string {
  if (teks.length <= maks) return teks;
  const sisa = teks.length - maks;
  return `${teks.slice(0, maks)}\n... [dipotong ${sisa} karakter]`;
}

function dalam(root: string, target: string): boolean {
  const r = relative(root, target);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** Jalur terdekat yang sudah ada (untuk berkas baru), di-realpath supaya symlink ikut dicek. */
function realAncestor(p: string): string {
  let cur = p;
  while (!existsSync(cur)) {
    const up = dirname(cur);
    if (up === cur) return cur;
    cur = up;
  }
  return realpathSync(cur);
}

/**
 * Selesaikan `p` terhadap folder kerja. Menolak jalur yang keluar dari folder kerja,
 * termasuk lewat `..` maupun symlink. Mengembalikan jalur absolut.
 */
export function safeResolve(cwd: string, p: string): string {
  const root = realpathSync(resolve(cwd));
  const abs = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const nyata = realAncestor(abs);
  if (!dalam(root, nyata) || !dalam(root, abs)) {
    throw new Error(`Jalur di luar folder kerja ditolak: ${p}`);
  }
  return abs;
}

export function relPath(cwd: string, abs: string): string {
  return relative(cwd, abs).split(sep).join("/") || ".";
}

export function joinPath(...bagian: string[]): string {
  return join(...bagian);
}
