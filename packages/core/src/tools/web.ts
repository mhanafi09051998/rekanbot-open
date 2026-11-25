import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { truncate } from "./sandbox.ts";
import { str, type Tool } from "./types.ts";

/** True bila alamat IP privat/loopback/link-local (cegah SSRF ke jaringan internal). */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l === "::";
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function pastikanPublik(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Hanya http/https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivateIp)) throw new Error(`Alamat internal/privat ditolak: ${host}`);
}

function bersihkanHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export const webFetch: Tool = {
  kind: "network",
  spec: {
    name: "web_fetch",
    description: "Ambil halaman web publik (GET) dan kembalikan teksnya. Alamat privat/localhost ditolak. Maks 1 MB.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  summary: (a) => `Ambil ${String(a.url)}`,
  async run(a, ctx) {
    let url = new URL(str(a, "url"));
    for (let lompat = 0; lompat < 5; lompat++) {
      await pastikanPublik(url);
      const res = await fetch(url, { redirect: "manual", signal: ctx.signal, headers: { "user-agent": "RekanBot-Open/0.1" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1_000_000) throw new Error("Respons lebih dari 1 MB");
      const teks = buf.toString("utf8");
      const tipe = res.headers.get("content-type") ?? "";
      return truncate(tipe.includes("html") ? bersihkanHtml(teks) : teks);
    }
    throw new Error("Terlalu banyak pengalihan");
  },
};
