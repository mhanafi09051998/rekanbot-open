import type { TodoItem } from "@rekanbot/core";
import type { UiEvent } from "../shared/api.ts";
import { $, clear, el } from "./dom.ts";
import { renderMarkdown } from "./markdown.ts";

const TANDA: Record<TodoItem["status"], string> = { pending: "○", in_progress: "◐", completed: "●" };

/** Transkrip percakapan: teks asisten mengalir, alat tampil sebagai kartu yang bisa dibuka. */
export class ChatView {
  private readonly log = $("log");
  private readonly todoBox = $("todos");
  private textNode: HTMLElement | null = null;
  private textBuf = "";
  private readonly kartu = new Map<string, HTMLDetailsElement>();

  reset(): void {
    clear(this.log);
    clear(this.todoBox);
    this.todoBox.hidden = true;
    this.textNode = null;
    this.textBuf = "";
    this.kartu.clear();
    this.log.append(el("p", { class: "kosong" }, "Pilih folder kerja, lalu minta RekanBot mengerjakan sesuatu."));
  }

  private bersihkanKosong(): void {
    this.log.querySelector(".kosong")?.remove();
  }

  private scroll(): void {
    const dekatBawah = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 120;
    if (dekatBawah) this.log.scrollTop = this.log.scrollHeight;
  }

  handle(e: UiEvent): void {
    this.bersihkanKosong();
    switch (e.type) {
      case "user":
        this.textNode = null;
        this.log.append(el("div", { class: "msg user" }, el("div", { class: "isi" }, e.text)));
        this.log.scrollTop = this.log.scrollHeight;
        break;
      case "text":
        if (!this.textNode) {
          this.textBuf = "";
          this.textNode = el("div", { class: "isi md" });
          this.log.append(el("div", { class: "msg bot" }, this.textNode));
        }
        this.textBuf += e.delta;
        clear(this.textNode);
        this.textNode.append(renderMarkdown(this.textBuf));
        this.scroll();
        break;
      case "tool_start": {
        this.textNode = null;
        const d = el("details", { class: "tool" }, el("summary", {}, el("span", { class: "titik" }), e.summary));
        this.kartu.set(e.call.id, d);
        this.log.append(d);
        this.scroll();
        break;
      }
      case "tool_result": {
        let d = this.kartu.get(e.call.id);
        if (!d) {
          d = el("details", { class: "tool" }, el("summary", {}, el("span", { class: "titik" }), e.call.name));
          this.log.append(d);
        }
        d.classList.add(e.isError ? "gagal" : "ok");
        d.append(el("pre", {}, e.output.slice(0, 6000)));
        this.scroll();
        break;
      }
      case "todos":
        this.renderTodos(e.todos);
        break;
      case "compacted":
        this.log.append(el("p", { class: "catatan" }, `Konteks dipangkas (${e.before} → ${e.after} token)`));
        break;
      case "error":
        this.textNode = null;
        this.log.append(el("p", { class: "galat" }, e.message));
        this.scroll();
        break;
      case "done":
        this.textNode = null;
        if (e.reason === "aborted") this.log.append(el("p", { class: "catatan" }, "Dihentikan."));
        else if (e.reason === "max_steps") this.log.append(el("p", { class: "catatan" }, "Berhenti: batas langkah tercapai."));
        break;
      default:
        break;
    }
  }

  private renderTodos(todos: TodoItem[]): void {
    clear(this.todoBox);
    this.todoBox.hidden = todos.length === 0;
    for (const t of todos) {
      this.todoBox.append(el("div", { class: `todo ${t.status}` }, el("span", {}, TANDA[t.status]), el("span", {}, t.content)));
    }
  }
}
