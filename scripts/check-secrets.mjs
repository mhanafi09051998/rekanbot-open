// Gagal (exit 1) bila ada pola kredensial di repo. Kunci hanya boleh ada di folder data pengguna.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const POLA = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "kunci Anthropic"],
  [/sk-(?:proj-)?[A-Za-z0-9_-]{32,}/, "kunci OpenAI"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, "token GitHub"],
  [/AKIA[0-9A-Z]{16}/, "kunci AWS"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "kunci privat"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT"],
];
const ABAIKAN = new Set(["node_modules", "dist", "release", ".git", "package-lock.json", "check-secrets.mjs"]);
const temuan = [];

function jelajah(dir) {
  for (const nama of readdirSync(dir)) {
    if (ABAIKAN.has(nama)) continue;
    const p = join(dir, nama);
    const st = statSync(p);
    if (st.isDirectory()) jelajah(p);
    else if (st.size < 2_000_000) {
      const isi = readFileSync(p, "utf8");
      for (const [re, jenis] of POLA) if (re.test(isi)) temuan.push(`${p}: ${jenis}`);
    }
  }
}

jelajah(process.cwd());
if (temuan.length) {
  console.error("GAGAL: kemungkinan kredensial di repo:");
  for (const t of temuan) console.error("  " + t);
  process.exit(1);
}
console.log("OK: tidak ada pola kredensial");
