// Membangun installer Windows (MSI) dari folder staging mandiri.
// Alasan staging: di npm workspace, electron-builder gagal ("spawn app-builder ENOENT") karena apps/desktop
// tidak punya node_modules sendiri, dan langkah "dependensi produksi"-nya memangkas node_modules akar.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "apps/desktop");
const jalan = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`GAGAL: ${cmd} ${args.join(" ")} (kode ${r.status})`);
    process.exit(1);
  }
};

jalan(process.execPath, [join(app, "build.mjs")], app);

const stage = mkdtempSync(join(tmpdir(), "rekanbot-stage-"));
mkdirSync(join(stage, "node_modules")); // folder kosong cukup agar electron-builder tidak gagal
for (const f of ["package.json", "dist", "build"]) cpSync(join(app, f), join(stage, f), { recursive: true });

const builder = join(root, "node_modules/electron-builder/cli.js");
jalan(process.execPath, [builder, "--win", "msi", "--publish", "never"], stage);

const keluar = join(app, "release");
rmSync(keluar, { recursive: true, force: true });
mkdirSync(keluar, { recursive: true });
const versi = JSON.parse(readFileSync(join(app, "package.json"), "utf8")).version;
const msi = readdirSync(join(stage, "release")).find((f) => f.endsWith(".msi"));
if (!msi) {
  console.error("GAGAL: berkas .msi tidak ditemukan di keluaran electron-builder");
  process.exit(1);
}
const tujuan = join(keluar, `RekanBot-${versi}.msi`);
cpSync(join(stage, "release", msi), tujuan);
const sha = createHash("sha256").update(readFileSync(tujuan)).digest("hex");
writeFileSync(`${tujuan}.sha256`, `${sha}  RekanBot-${versi}.msi\n`);
rmSync(stage, { recursive: true, force: true });
console.log(`Installer: ${tujuan}\nSHA-256: ${sha}`);
