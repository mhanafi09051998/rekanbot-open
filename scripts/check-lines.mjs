// Gagal (exit 1) bila ada berkas kode > 300 baris. Aturan proyek: satu komponen satu berkas.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MAKS = 300;
const EKSTENSI = new Set([".ts", ".mjs", ".js", ".css", ".html", ".yml", ".json"]);
const ABAIKAN = new Set(["node_modules", "dist", "release", ".git", "package-lock.json"]);
const lebih = [];

function jelajah(dir) {
  for (const nama of readdirSync(dir)) {
    if (ABAIKAN.has(nama)) continue;
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) jelajah(p);
    else if (EKSTENSI.has(extname(nama))) {
      const baris = readFileSync(p, "utf8").split("\n").length;
      if (baris > MAKS) lebih.push(`${p}: ${baris} baris`);
    }
  }
}

jelajah(process.cwd());
if (lebih.length) {
  console.error(`GAGAL: berkas melebihi ${MAKS} baris, pecah menjadi beberapa berkas:`);
  for (const l of lebih) console.error("  " + l);
  process.exit(1);
}
console.log(`OK: semua berkas <= ${MAKS} baris`);
