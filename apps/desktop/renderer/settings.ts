import type { PermissionMode, ProviderKind } from "@rekanbot/core";
import type { UiState } from "../shared/api.ts";
import { $, clear, el } from "./dom.ts";

const JENIS: { v: ProviderKind; label: string; model: string; url: string }[] = [
  { v: "openai-compatible", label: "OpenAI / compatible (Chat Completions)", model: "gpt-4o", url: "https://api.openai.com/v1" },
  { v: "anthropic", label: "Anthropic (Messages API)", model: "claude-sonnet-5-5", url: "https://api.anthropic.com" },
  { v: "openai-responses", label: "OpenAI Responses API", model: "gpt-4o", url: "https://api.openai.com/v1" },
];

const MODE: { v: PermissionMode; label: string; ket: string }[] = [
  { v: "ask", label: "Tanya dulu (disarankan)", ket: "Tulis berkas, perintah shell, dan akses web selalu minta izin." },
  { v: "auto-edit", label: "Edit otomatis", ket: "Tulis/edit berkas otomatis; shell dan web tetap minta izin." },
  { v: "auto", label: "Otomatis penuh", ket: "Semua berjalan tanpa tanya. Hanya untuk folder yang aman dirusak." },
];

export class SettingsDialog {
  private readonly dlg = $<HTMLDialogElement>("settings");
  private readonly api = window.rekanbot;
  private readonly onState: (s: UiState) => void;
  private pesan = "";

  constructor(onState: (s: UiState) => void) {
    this.onState = onState;
  }

  async open(): Promise<void> {
    this.pesan = "";
    this.render(await this.api.getState());
    if (!this.dlg.open) this.dlg.showModal();
  }

  private async jalankan(fn: () => Promise<UiState>, sukses = ""): Promise<void> {
    try {
      const s = await fn();
      this.pesan = sukses;
      this.onState(s);
      this.render(s);
    } catch (e) {
      this.pesan = `Gagal: ${(e as Error).message}`;
      this.render(await this.api.getState());
    }
  }

  private render(s: UiState): void {
    clear(this.dlg);
    this.dlg.append(
      el("div", { class: "kepala-dlg" }, el("h2", {}, "Pengaturan"), el("button", { class: "btn ikon", onclick: () => this.dlg.close(), "aria-label": "Tutup" }, "✕")),
      el("p", { class: "pesan", hidden: !this.pesan }, this.pesan),
      this.bagianProvider(s),
      this.bagianTambah(),
      this.bagianLogin(s),
      this.bagianMode(s),
    );
  }

  private bagianProvider(s: UiState): HTMLElement {
    const daftar = s.providers.length
      ? s.providers.map((p) =>
          el("div", { class: "baris" },
            el("label", { class: "pilih" },
              el("input", { type: "radio", name: "aktif", checked: p.id === s.active, onchange: () => void this.jalankan(() => this.api.setActive(p.id)) }),
              el("span", {}, el("strong", {}, p.name), el("small", {}, ` ${p.kind} · ${p.model}${p.hasKey ? " · kunci tersimpan" : ""}`)),
            ),
            el("button", { class: "btn kecil", onclick: () => void this.jalankan(() => this.api.removeProvider(p.id)) }, "Hapus"),
          ),
        )
      : [el("p", { class: "redup" }, "Belum ada provider.")];
    return el("section", {}, el("h3", {}, "Provider"), ...daftar);
  }

  private bagianTambah(): HTMLElement {
    const nama = el("input", { type: "text", placeholder: "Nama (mis. OpenRouter)" });
    const jenis = el("select", {}, ...JENIS.map((j) => el("option", { value: j.v }, j.label)));
    const url = el("input", { type: "text", placeholder: JENIS[0]!.url });
    const model = el("input", { type: "text", placeholder: JENIS[0]!.model });
    const kunci = el("input", { type: "password", placeholder: "Kunci API (disimpan terenkripsi OS)", autocomplete: "off" });
    jenis.addEventListener("change", () => {
      const j = JENIS.find((x) => x.v === jenis.value)!;
      url.placeholder = j.url;
      model.placeholder = j.model;
    });
    const simpan = (): void =>
      void this.jalankan(
        () => this.api.saveProvider({ name: nama.value, kind: jenis.value as ProviderKind, model: model.value, baseUrl: url.value, apiKey: kunci.value }),
        "Provider disimpan.",
      );
    return el("section", {}, el("h3", {}, "Tambah provider (API key)"),
      el("div", { class: "form" }, nama, jenis, url, model, kunci, el("button", { class: "btn utama", onclick: simpan }, "Simpan")),
      el("p", { class: "redup" }, "Base URL kosong = alamat resmi. Isi untuk OpenRouter, Ollama (http://localhost:11434/v1), LM Studio, dll."),
    );
  }

  private bagianLogin(s: UiState): HTMLElement {
    const baris = (k: "claude" | "codex", judul: string): HTMLElement =>
      el("div", { class: "baris" },
        el("span", {}, el("strong", {}, judul), el("small", {}, s.oauth[k] ? " · sudah login" : " · belum login")),
        s.oauth[k]
          ? el("button", { class: "btn kecil", onclick: () => void this.jalankan(() => this.api.logout(k), "Token dihapus.") }, "Keluar")
          : el("button", { class: "btn kecil", onclick: () => void this.jalankan(() => this.api.login(k), "Login berhasil.") }, "Login via browser"),
      );
    return el("section", {}, el("h3", {}, "Login langganan (eksperimental)"),
      el("p", { class: "peringatan" }, "Memakai client OAuth milik Claude Code/Codex CLI. Penyedia dapat memblokirnya kapan saja dan penggunaannya dapat bertentangan dengan syarat layanan mereka. Jalur stabil adalah API key."),
      baris("claude", "Claude (Pro/Max)"),
      baris("codex", "Codex (ChatGPT)"),
    );
  }

  private bagianMode(s: UiState): HTMLElement {
    const pilih = el("select", { onchange: (e: Event) => void this.jalankan(() => this.api.setMode((e.target as HTMLSelectElement).value as PermissionMode)) },
      ...MODE.map((m) => el("option", { value: m.v, selected: m.v === s.mode }, m.label)),
    );
    return el("section", {}, el("h3", {}, "Izin alat"), pilih, el("p", { class: "redup" }, MODE.find((m) => m.v === s.mode)?.ket));
  }
}
