import type { ApprovalRequestMsg } from "../shared/api.ts";
import { $, clear, el } from "./dom.ts";

const LABEL: Record<string, string> = { write: "Tulis berkas", exec: "Jalankan perintah", network: "Akses jaringan" };

/** Dialog persetujuan: antrean, satu per satu. Esc/tutup berarti menolak. */
export class ApprovalDialog {
  private readonly dlg = $<HTMLDialogElement>("approval");
  private readonly antre: ApprovalRequestMsg[] = [];
  private aktif: ApprovalRequestMsg | null = null;
  private readonly jawab: (id: number, ok: boolean) => void;

  constructor(jawab: (id: number, ok: boolean) => void) {
    this.jawab = jawab;
    this.dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.selesai(false);
    });
  }

  tambah(r: ApprovalRequestMsg): void {
    this.antre.push(r);
    if (!this.aktif) this.berikut();
  }

  /** Tolak semua yang menunggu (mis. saat dihentikan). */
  batalkanSemua(): void {
    for (const r of this.antre.splice(0)) this.jawab(r.id, false);
    if (this.aktif) this.selesai(false);
  }

  private berikut(): void {
    const r = this.antre.shift();
    if (!r) return;
    this.aktif = r;
    clear(this.dlg);
    const rinci = JSON.stringify(r.args, null, 2);
    this.dlg.append(
      el("h2", {}, LABEL[r.kind] ?? "Izin"),
      el("p", { class: "ringkas" }, r.summary),
      el("details", {}, el("summary", {}, "Rincian argumen"), el("pre", {}, rinci.length > 4000 ? `${rinci.slice(0, 4000)}\n...` : rinci)),
      el("div", { class: "aksi" },
        el("button", { class: "btn", onclick: () => this.selesai(false) }, "Tolak"),
        el("button", { class: "btn utama", onclick: () => this.selesai(true) }, "Izinkan"),
      ),
    );
    if (!this.dlg.open) this.dlg.showModal();
  }

  private selesai(ok: boolean): void {
    if (this.aktif) this.jawab(this.aktif.id, ok);
    this.aktif = null;
    if (this.antre.length) this.berikut();
    else this.dlg.close();
  }
}
