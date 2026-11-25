import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { relPath, safeResolve, truncate } from "./sandbox.ts";
import { num, str, type Tool } from "./types.ts";

export const readFile: Tool = {
  kind: "read",
  spec: {
    name: "read_file",
    description: "Baca berkas teks di folder kerja. Keluaran bernomor baris. Pakai offset/limit untuk berkas besar.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Jalur berkas (relatif terhadap folder kerja)" },
        offset: { type: "number", description: "Baris awal (mulai 1)" },
        limit: { type: "number", description: "Jumlah baris (bawaan 2000)" },
      },
      required: ["path"],
    },
  },
  summary: (a) => `Baca ${String(a.path)}`,
  async run(a, ctx) {
    const abs = safeResolve(ctx.cwd, str(a, "path"));
    if (statSync(abs).isDirectory()) throw new Error("Itu folder; pakai list_dir");
    const baris = readFileSync(abs, "utf8").split("\n");
    const mulai = Math.max(1, num(a, "offset") ?? 1);
    const batas = Math.min(num(a, "limit") ?? 2000, 5000);
    const potong = baris.slice(mulai - 1, mulai - 1 + batas);
    const out = potong.map((t, i) => `${String(mulai + i).padStart(5)}\t${t}`).join("\n");
    const lanjut = mulai - 1 + batas < baris.length ? `\n... [${baris.length - (mulai - 1 + batas)} baris lagi]` : "";
    return truncate(out + lanjut);
  },
};

export const writeFile: Tool = {
  kind: "write",
  spec: {
    name: "write_file",
    description: "Tulis (timpa) berkas di folder kerja; folder induk dibuat otomatis. Untuk perubahan kecil pakai edit_file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  summary: (a) => `Tulis ${String(a.path)} (${String(a.content ?? "").length} karakter)`,
  async run(a, ctx) {
    const abs = safeResolve(ctx.cwd, str(a, "path"));
    const isi = str(a, "content");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, isi, "utf8");
    return `Tertulis ${relPath(ctx.cwd, abs)} (${isi.split("\n").length} baris)`;
  },
};

export const editFile: Tool = {
  kind: "write",
  spec: {
    name: "edit_file",
    description:
      "Ganti teks persis di berkas. old_string harus cocok unik (sertakan konteks sekitar) kecuali replace_all=true.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  summary: (a) => `Edit ${String(a.path)}`,
  async run(a, ctx) {
    const abs = safeResolve(ctx.cwd, str(a, "path"));
    const lama = str(a, "old_string");
    const baru = str(a, "new_string");
    if (!lama) throw new Error("old_string tidak boleh kosong");
    if (lama === baru) throw new Error("old_string dan new_string sama");
    const isi = readFileSync(abs, "utf8");
    const n = isi.split(lama).length - 1;
    if (n === 0) throw new Error("old_string tidak ditemukan di berkas");
    if (n > 1 && a.replace_all !== true) {
      throw new Error(`old_string cocok di ${n} tempat; tambahkan konteks agar unik atau set replace_all=true`);
    }
    const hasil = a.replace_all === true ? isi.split(lama).join(baru) : isi.replace(lama, () => baru);
    writeFileSync(abs, hasil, "utf8");
    return `Diedit ${relPath(ctx.cwd, abs)} (${a.replace_all === true ? n : 1} penggantian)`;
  },
};

export const listDir: Tool = {
  kind: "read",
  spec: {
    name: "list_dir",
    description: "Daftar isi folder (satu tingkat). Folder diberi akhiran /.",
    parameters: { type: "object", properties: { path: { type: "string" } } },
  },
  summary: (a) => `Daftar ${String(a.path ?? ".")}`,
  async run(a, ctx) {
    const abs = safeResolve(ctx.cwd, str(a, "path", false) || ".");
    const item = readdirSync(abs, { withFileTypes: true })
      .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
      .sort();
    return truncate(item.join("\n") || "(kosong)");
  },
};
