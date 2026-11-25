// Membangun aplikasi desktop menjadi dist/: main + preload (CJS, core ikut dibundel), renderer (IIFE), aset statis.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "renderer"), { recursive: true });

const umum = { bundle: true, minify: true, sourcemap: false, logLevel: "info", legalComments: "none" };

await build({ ...umum, entryPoints: [join(root, "electron/main.ts")], outfile: join(dist, "main.cjs"), platform: "node", format: "cjs", target: "node20", external: ["electron"] });
await build({ ...umum, entryPoints: [join(root, "electron/preload.ts")], outfile: join(dist, "preload.cjs"), platform: "node", format: "cjs", target: "node20", external: ["electron"] });
await build({ ...umum, entryPoints: [join(root, "renderer/app.ts")], outfile: join(dist, "renderer/app.js"), platform: "browser", format: "iife", target: "chrome120" });

for (const f of ["index.html", "style.css"]) cpSync(join(root, "renderer", f), join(dist, "renderer", f));
cpSync(join(root, "renderer/fonts"), join(dist, "renderer/fonts"), { recursive: true });
for (const f of ["icon.png"]) {
  const src = join(root, "build", f);
  if (existsSync(src)) {
    cpSync(src, join(dist, f));
    cpSync(src, join(dist, "renderer", f));
  }
}
console.log("Build desktop selesai:", dist);
