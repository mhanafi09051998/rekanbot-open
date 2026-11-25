import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { relPath, safeResolve, truncate } from "./sandbox.ts";
import { str, type Tool } from "./types.ts";

const ABAIKAN = new Set(["node_modules", ".git", "dist", "release", ".next", "__pycache__", ".venv"]);
const MAKS_BERKAS = 20_000;

/** Ubah pola glob (*, **, ?) menjadi RegExp terhadap jalur relatif berpemisah "/". */
export function globToRegExp(pola: string): RegExp {
  let re = "";
  for (let i = 0; i < pola.length; i++) {
    const c = pola[i]!;
    if (c === "*") {
      if (pola[i + 1] === "*") {
        i++;
        if (pola[i + 1] === "/") i++;
        re += "(?:.*/)?";
        if (pola[i] !== "/" && pola.slice(i - 1, i + 1) === "**") re = re.replace(/\(\?:\.\*\/\)\?$/, ".*");
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function* walk(root: string, rel = ""): Generator<string> {
  let entri;
  try {
    entri = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entri) {
    if (ABAIKAN.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(root, r);
    else if (e.isFile()) yield r;
  }
}

export const glob: Tool = {
  kind: "read",
  spec: {
    name: "glob",
    description: "Cari berkas menurut pola glob, mis. 'src/**/*.ts'. Mengabaikan node_modules dan .git.",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" }, path: { type: "string", description: "Folder awal (opsional)" } },
      required: ["pattern"],
    },
  },
  summary: (a) => `Glob ${String(a.pattern)}`,
  async run(a, ctx) {
    const root = safeResolve(ctx.cwd, str(a, "path", false) || ".");
    const re = globToRegExp(str(a, "pattern"));
    const hasil: string[] = [];
    for (const f of walk(root)) {
      if (re.test(f)) hasil.push(relPath(ctx.cwd, join(root, f)));
      if (hasil.length >= 500) break;
    }
    return hasil.length ? truncate(hasil.sort().join("\n")) : "(tidak ada yang cocok)";
  },
};

export const grep: Tool = {
  kind: "read",
  spec: {
    name: "grep",
    description: "Cari teks (regex) di isi berkas. Keluaran: jalur:baris:teks. Maks 200 hasil.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Ekspresi reguler JavaScript" },
        path: { type: "string" },
        glob: { type: "string", description: "Batasi berkas, mis. '*.ts'" },
        ignore_case: { type: "boolean" },
      },
      required: ["pattern"],
    },
  },
  summary: (a) => `Grep ${String(a.pattern)}`,
  async run(a, ctx) {
    const root = safeResolve(ctx.cwd, str(a, "path", false) || ".");
    let re: RegExp;
    try {
      re = new RegExp(str(a, "pattern"), a.ignore_case === true ? "i" : "");
    } catch (e) {
      throw new Error(`Regex tidak valid: ${(e as Error).message}`);
    }
    const filter = typeof a.glob === "string" && a.glob ? globToRegExp(a.glob.includes("/") ? a.glob : `**/${a.glob}`) : null;
    const hasil: string[] = [];
    let diperiksa = 0;
    for (const f of walk(root)) {
      if (filter && !filter.test(f)) continue;
      if (++diperiksa > MAKS_BERKAS) break;
      const abs = join(root, f);
      try {
        if (statSync(abs).size > 1_000_000) continue;
        const isi = readFileSync(abs, "utf8");
        if (isi.includes("\u0000")) continue;
        const baris = isi.split("\n");
        for (let i = 0; i < baris.length; i++) {
          if (re.test(baris[i]!)) hasil.push(`${relPath(ctx.cwd, abs)}:${i + 1}:${baris[i]!.slice(0, 300)}`);
          if (hasil.length >= 200) return truncate(hasil.join("\n") + "\n... [dibatasi 200 hasil]");
        }
      } catch {
        /* abaikan berkas yang tak terbaca */
      }
    }
    return hasil.length ? truncate(hasil.join("\n")) : "(tidak ada yang cocok)";
  },
};
