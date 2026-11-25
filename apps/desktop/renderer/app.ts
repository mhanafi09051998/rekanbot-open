import type { UiState } from "../shared/api.ts";
import { ApprovalDialog } from "./approval.ts";
import { ChatView } from "./chat-view.ts";
import { $, clear, el } from "./dom.ts";
import { SettingsDialog } from "./settings.ts";

const api = window.rekanbot;
const chat = new ChatView();
const approval = new ApprovalDialog((id, ok) => api.respondApproval(id, ok));
let busy = false;

const input = $<HTMLTextAreaElement>("prompt");
const kirim = $<HTMLButtonElement>("send");

function setBusy(b: boolean): void {
  busy = b;
  kirim.textContent = b ? "Berhenti" : "Kirim";
  kirim.classList.toggle("stop", b);
  input.disabled = false;
}

function render(s: UiState): void {
  const aktif = s.providers.find((p) => p.id === s.active);
  $("folder").textContent = s.cwd;
  $("folder").title = s.cwd;
  const label = $("provider-label");
  label.textContent = aktif ? `${aktif.name} · ${aktif.model}` : "Belum ada provider";
  label.classList.toggle("peringatan-teks", !aktif);
  const mode = $("mode-label");
  mode.textContent = { ask: "tanya dulu", "auto-edit": "edit otomatis", auto: "otomatis penuh" }[s.mode];
  mode.classList.toggle("bahaya", s.mode === "auto");
  setBusy(s.busy);
}

const settings = new SettingsDialog(render);

async function aksiKirim(): Promise<void> {
  if (busy) {
    approval.batalkanSemua();
    api.abort();
    return;
  }
  const teks = input.value.trim();
  if (!teks) return;
  input.value = "";
  resize();
  setBusy(true);
  try {
    await api.send(teks);
  } finally {
    render(await api.getState());
  }
}

function resize(): void {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
}

async function start(): Promise<void> {
  chat.reset();
  api.onEvent((e) => chat.handle(e));
  api.onApproval((r) => approval.tambah(r));
  render(await api.getState());

  kirim.addEventListener("click", () => void aksiKirim());
  input.addEventListener("input", resize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void aksiKirim();
    }
  });
  $("folder-btn").addEventListener("click", async () => {
    render(await api.pickFolder());
    chat.reset();
  });
  $("new-btn").addEventListener("click", async () => {
    approval.batalkanSemua();
    await api.newChat();
    chat.reset();
    render(await api.getState());
  });
  $("settings-btn").addEventListener("click", () => void settings.open());
  $("provider-label").addEventListener("click", () => void settings.open());
  $("mode-label").addEventListener("click", () => void settings.open());
  input.focus();
}

void start().catch((e: Error) => {
  const log = $("log");
  clear(log);
  log.append(el("p", { class: "galat" }, `Gagal memulai: ${e.message}`));
});
