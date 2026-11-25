import { spawn } from "node:child_process";
import { truncate } from "./sandbox.ts";
import { num, str, type Tool } from "./types.ts";

const WAKTU_BAWAAN = 120_000;
const WAKTU_MAKS = 600_000;

function shell(): [string, string[]] {
  if (process.platform === "win32") return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command"]];
  return ["bash", ["-lc"]];
}

export const bash: Tool = {
  kind: "exec",
  spec: {
    name: "bash",
    description:
      "Jalankan perintah shell di folder kerja (PowerShell di Windows, bash di lainnya). Mengembalikan stdout+stderr dan kode keluar. Batas waktu bawaan 120 dtk.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout_ms: { type: "number", description: "Batas waktu, maks 600000" },
      },
      required: ["command"],
    },
  },
  summary: (a) => `Jalankan: ${String(a.command).slice(0, 200)}`,
  run(a, ctx) {
    const perintah = str(a, "command");
    const batas = Math.min(num(a, "timeout_ms") ?? WAKTU_BAWAAN, WAKTU_MAKS);
    const [exe, args] = shell();
    return new Promise((selesai, gagal) => {
      const anak = spawn(exe, [...args, perintah], { cwd: ctx.cwd, env: process.env, windowsHide: true });
      let keluar = "";
      let habis = false;
      const tambah = (b: Buffer) => {
        keluar += b.toString("utf8");
        if (keluar.length > 200_000) keluar = keluar.slice(-200_000);
      };
      anak.stdout.on("data", tambah);
      anak.stderr.on("data", tambah);
      const mati = () => {
        anak.kill("SIGKILL");
        if (process.platform === "win32" && anak.pid) spawn("taskkill", ["/pid", String(anak.pid), "/T", "/F"]);
      };
      const timer = setTimeout(() => {
        habis = true;
        mati();
      }, batas);
      const batal = () => mati();
      ctx.signal?.addEventListener("abort", batal, { once: true });
      anak.on("error", (e) => {
        clearTimeout(timer);
        gagal(e);
      });
      anak.on("close", (kode) => {
        clearTimeout(timer);
        ctx.signal?.removeEventListener("abort", batal);
        if (ctx.signal?.aborted) return gagal(new Error("Dibatalkan"));
        const catatan = habis ? `\n[dihentikan: melewati batas waktu ${batas} ms]` : "";
        selesai(truncate(`${keluar.trim()}${catatan}\n[kode keluar: ${habis ? "timeout" : kode}]`.trim()));
      });
    });
  },
};
