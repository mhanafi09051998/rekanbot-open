import {
  SISTEM_BAWAAN, ToolRegistry, createProvider, makeTaskTool, runAgent,
  type AppConfig, type Message, type SecretStore, type TodoItem,
} from "@rekanbot/core";
import type { ApprovalRequestMsg, UiEvent } from "../shared/api.ts";

/** Satu percakapan: riwayat pesan, status sibuk, dan gerbang persetujuan ke renderer. */
export class ChatSession {
  messages: Message[] = [];
  busy = false;
  private ac?: AbortController;
  private nextApproval = 1;
  private readonly pending = new Map<number, (ok: boolean) => void>();
  private todos: TodoItem[] = [];

  private readonly emit: (e: UiEvent) => void;
  private readonly askRenderer: (r: ApprovalRequestMsg) => void;

  constructor(emit: (e: UiEvent) => void, askRenderer: (r: ApprovalRequestMsg) => void) {
    this.emit = emit;
    this.askRenderer = askRenderer;
  }

  reset(): void {
    this.abort();
    this.messages = [];
    this.todos = [];
  }

  abort(): void {
    this.ac?.abort();
    for (const [, r] of this.pending) r(false);
    this.pending.clear();
  }

  respond(id: number, ok: boolean): void {
    const r = this.pending.get(id);
    if (!r) return;
    this.pending.delete(id);
    r(ok);
  }

  async send(prompt: string, config: AppConfig, store: SecretStore, cwd: string): Promise<void> {
    if (this.busy) throw new Error("Masih memproses pesan sebelumnya");
    const cfg = config.providers.find((p) => p.id === config.activeProvider);
    if (!cfg) {
      this.emit({ type: "error", message: "Belum ada provider aktif. Buka Pengaturan, tambah provider atau login." });
      return;
    }
    this.busy = true;
    this.ac = new AbortController();
    this.messages.push({ role: "user", content: prompt });
    this.emit({ type: "user", text: prompt });
    try {
      const provider = createProvider(cfg, store);
      const tools = new ToolRegistry();
      tools.add(makeTaskTool(provider, cfg.model, tools));
      await runAgent({
        provider,
        model: cfg.model,
        system: SISTEM_BAWAAN,
        messages: this.messages,
        tools,
        cwd,
        mode: config.permissionMode,
        todos: this.todos,
        signal: this.ac.signal,
        onEvent: (e) => this.emit(e),
        approve: (req) =>
          new Promise<boolean>((ok) => {
            const id = this.nextApproval++;
            this.pending.set(id, ok);
            this.askRenderer({ id, tool: req.tool, kind: req.kind, summary: req.summary, args: req.args });
          }),
      });
    } catch (e) {
      this.emit({ type: "error", message: (e as Error).message });
    } finally {
      this.busy = false;
      this.ac = undefined;
    }
  }
}
