import { createInterface, type Interface } from "node:readline";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  SISTEM_BAWAAN, SessionLog, ToolRegistry, makeTaskTool, runAgent,
  type AgentEvent, type Approver, type Message,
} from "@rekanbot/core";
import type { Flags } from "./args.ts";
import { HOME, resolveMode, resolveProvider } from "./setup.ts";

const dim = (s: string): string => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

function tanya(rl: Interface, q: string): Promise<string> {
  return new Promise((ok) => rl.question(q, ok));
}

/** Gerbang izin: bertanya di terminal. Tanpa TTY dan tanpa --yes, semua yang berisiko ditolak. */
export function makeApprover(rl: Interface | null): Approver {
  return async (req) => {
    if (!rl) return false;
    const j = (await tanya(rl, `\n? Izinkan [${req.kind}] ${req.summary}  (y/N) `)).trim().toLowerCase();
    return j === "y" || j === "ya";
  };
}

export function printer(): (e: AgentEvent) => void {
  return (e) => {
    if (e.type === "text") process.stdout.write(e.delta);
    else if (e.type === "tool_start") process.stdout.write(dim(`\n› ${e.summary}\n`));
    else if (e.type === "tool_result") {
      const baris = e.output.split("\n")[0]!.slice(0, 160);
      process.stdout.write(dim(`  ${e.isError ? "✗" : "✓"} ${baris}\n`));
    } else if (e.type === "todos") process.stdout.write(dim(`\n☰ ${e.todos.filter((t) => t.status === "completed").length}/${e.todos.length} tugas\n`));
    else if (e.type === "compacted") process.stdout.write(dim(`\n(konteks dipangkas ${e.before} → ${e.after} token)\n`));
    else if (e.type === "done") process.stdout.write("\n");
  };
}

function sesiFile(cwd: string): string {
  return join(HOME, "sessions", `${createHash("sha1").update(cwd).digest("hex").slice(0, 12)}.jsonl`);
}

export async function runCli(f: Flags): Promise<number> {
  const { provider, model, label, config } = resolveProvider(f);
  const mode = resolveMode(f, config);
  const cwd = resolve(f.cwd ?? process.cwd());
  const tools = new ToolRegistry();
  tools.add(makeTaskTool(provider, model, tools));
  const log = new SessionLog(sesiFile(cwd));
  const messages: Message[] = f.resume ? log.load() : [];
  const interaktif = f.print === undefined && process.stdin.isTTY;
  const rl = process.stdin.isTTY || f.print === undefined ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const approve = makeApprover(mode === "auto" ? null : rl && process.stdin.isTTY ? rl : null);
  let ac = new AbortController();
  process.on("SIGINT", () => (ac.signal.aborted ? process.exit(130) : ac.abort()));
  let gagal = false;

  const giliran = async (teks: string): Promise<void> => {
    const awal = messages.length;
    messages.push({ role: "user", content: teks });
    try {
      await runAgent({ provider, model, system: SISTEM_BAWAAN, messages, tools, cwd, mode, approve, onEvent: printer(), signal: ac.signal });
    } catch (e) {
      gagal = true;
      console.error(`\nGalat: ${(e as Error).message}`);
    }
    for (const m of messages.slice(awal)) log.append(m);
  };

  if (f.print !== undefined) {
    await giliran(f.print);
    rl?.close();
    return gagal ? 1 : 0;
  }
  console.log(dim(`RekanBot Open · ${label} · mode ${mode} · ${cwd}\nKetik pesan, /keluar untuk selesai, Ctrl+C membatalkan giliran.`));
  if (!interaktif) console.log(dim("(stdin bukan terminal: alat berisiko akan ditolak kecuali --yes)"));
  for (;;) {
    const baris = (await tanya(rl!, "\n> ")).trim();
    if (!baris) continue;
    if (baris === "/keluar" || baris === "/exit") break;
    if (ac.signal.aborted) ac = new AbortController();
    await giliran(baris);
  }
  rl!.close();
  return 0;
}
