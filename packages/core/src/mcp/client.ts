import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { Tool } from "../tools/types.ts";

export interface McpServerConfig {
  name: string;
  /** stdio: perintah + argumen. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Streamable HTTP: alamat endpoint MCP. */
  url?: string;
  headers?: Record<string, string>;
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

type Pending = { ok: (v: any) => void; no: (e: Error) => void };

/** Klien MCP minimal (JSON-RPC 2.0): initialize, tools/list, tools/call. Mendukung stdio dan Streamable HTTP. */
export class McpClient {
  readonly name: string;
  private proc?: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private sessionId?: string;
  private readonly cfg: McpServerConfig;

  private constructor(cfg: McpServerConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
  }

  static async connect(cfg: McpServerConfig): Promise<McpClient> {
    const c = new McpClient(cfg);
    if (cfg.command) c.startStdio(cfg);
    else if (!cfg.url) throw new Error(`Server MCP '${cfg.name}' butuh command atau url`);
    await c.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "rekanbot-open", version: "0.1.0" },
    });
    await c.notify("notifications/initialized", {});
    return c;
  }

  private startStdio(cfg: McpServerConfig): void {
    // Windows: .cmd/.bat (mis. npx) butuh shell; .exe dijalankan langsung supaya jalur berspasi tidak pecah.
    const pakaiShell = process.platform === "win32" && !/\.exe$/i.test(cfg.command!);
    const kutip = (s: string): string => (pakaiShell && /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
    const p = spawn(kutip(cfg.command!), (cfg.args ?? []).map(kutip), {
      env: { ...process.env, ...(cfg.env ?? {}) },
      windowsHide: true,
      shell: pakaiShell,
    });
    this.proc = p;
    createInterface({ input: p.stdout }).on("line", (baris) => {
      try {
        this.onMessage(JSON.parse(baris));
      } catch {
        /* baris non-JSON (log) diabaikan */
      }
    });
    p.on("close", () => {
      for (const [, w] of this.pending) w.no(new Error(`Server MCP '${this.name}' berhenti`));
      this.pending.clear();
    });
  }

  private onMessage(m: any): void {
    if (typeof m?.id === "number" && this.pending.has(m.id)) {
      const w = this.pending.get(m.id)!;
      this.pending.delete(m.id);
      if (m.error) w.no(new Error(`MCP ${this.name}: ${m.error.message ?? "galat"}`));
      else w.ok(m.result);
    }
  }

  private async notify(method: string, params: unknown): Promise<void> {
    const msg = { jsonrpc: "2.0", method, params };
    if (this.proc) this.proc.stdin.write(JSON.stringify(msg) + "\n");
    else await this.http(msg, false);
  }

  private request(method: string, params: unknown, waktuMs = 60_000): Promise<any> {
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    if (!this.proc) return this.http(msg, true, id);
    return new Promise((ok, no) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        no(new Error(`MCP ${this.name}: ${method} melewati batas waktu`));
      }, waktuMs);
      this.pending.set(id, { ok: (v) => (clearTimeout(t), ok(v)), no: (e) => (clearTimeout(t), no(e)) });
      this.proc!.stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  private async http(msg: unknown, tungguBalasan: boolean, id?: number): Promise<any> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(this.cfg.headers ?? {}),
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const res = await fetch(this.cfg.url!, { method: "POST", headers, body: JSON.stringify(msg) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!res.ok) throw new Error(`MCP ${this.name}: HTTP ${res.status}`);
    if (!tungguBalasan) return undefined;
    const tipe = res.headers.get("content-type") ?? "";
    const teks = await res.text();
    const kandidat: any[] = tipe.includes("text/event-stream")
      ? teks.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)))
      : [JSON.parse(teks)];
    const m = kandidat.find((x) => x?.id === id);
    if (!m) throw new Error(`MCP ${this.name}: tidak ada balasan untuk permintaan ${id}`);
    if (m.error) throw new Error(`MCP ${this.name}: ${m.error.message ?? "galat"}`);
    return m.result;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const r = await this.request("tools/list", {});
    return Array.isArray(r?.tools) ? r.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const r = await this.request("tools/call", { name, arguments: args }, 300_000);
    const teks = (Array.isArray(r?.content) ? r.content : [])
      .map((c: any) => (c?.type === "text" ? String(c.text) : `[${c?.type ?? "konten"}]`))
      .join("\n");
    if (r?.isError) throw new Error(teks || "alat MCP gagal");
    return teks || "(kosong)";
  }

  close(): void {
    this.proc?.kill();
  }
}

/** Bungkus alat server MCP sebagai Tool. Efek tak diketahui, jadi diperlakukan "exec" (minta izin). */
export async function mcpTools(client: McpClient): Promise<Tool[]> {
  const info = await client.listTools();
  const aman = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
  return info.map((t) => ({
    kind: "exec" as const,
    spec: {
      name: `mcp__${aman(client.name)}__${aman(t.name)}`.slice(0, 64),
      description: `[MCP ${client.name}] ${t.description ?? t.name}`,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
    summary: (a: Record<string, unknown>) => `MCP ${client.name}/${t.name} ${JSON.stringify(a).slice(0, 120)}`,
    run: (a: Record<string, unknown>) => client.callTool(t.name, a),
  }));
}
