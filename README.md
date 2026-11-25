# RekanBot Open

Agen AI coding **open source**, ringan, bebas provider. Aplikasi desktop dengan installer, plus CLI. Versi open source dari RekanBot.

- **Ringan:** proses utama 35 KB dan antarmuka 10 KB (tanpa React); inti agen tanpa dependensi runtime.
- **Bebas provider:** OpenAI, Anthropic, endpoint compatible (OpenRouter, Ollama, LM Studio, dll.), Responses API, serta login langganan Claude dan Codex (eksperimental).
- **Alat sungguhan:** baca, tulis, edit, cari (glob/grep), shell, web, daftar tugas, sub-agen baca-saja, dan klien MCP (stdio + HTTP).
- **Aman secara bawaan:** semua jalur dikurung di folder kerja (termasuk symlink), tulis/shell/web minta izin, kunci disimpan terenkripsi OS, web fetch menolak alamat privat.

## Pasang

Unduh `RekanBot-Setup-<versi>.exe` dari halaman Releases, cek `.sha256`-nya, lalu jalankan.
Pengembangan: Node 22+.

```
npm install
npm run verify          # baris ≤300, rahasia, tipe, 51+ tes
npm run build           # core + CLI + desktop
npm start -w @rekanbot/desktop
```

## Pakai

**Desktop:** pilih folder kerja, buka *Pengaturan*, tambah provider (API key) atau login, lalu minta sesuatu.
Mode izin: *tanya dulu* (disarankan), *edit otomatis*, *otomatis penuh*.

**CLI:**

```
rekanbot config add-provider --id lokal --kind openai-compatible --model llama3 --base-url http://localhost:11434/v1
rekanbot -p "tambahkan tes untuk src/util.ts" --provider lokal
rekanbot login claude          # EKSPERIMENTAL, baca docs/OAUTH.md
```

Tanpa konfigurasi, CLI memakai `ANTHROPIC_API_KEY` atau `OPENAI_API_KEY`. Mode non-interaktif (`-p`) menolak
alat berisiko kecuali `--yes`.

## Struktur

```
packages/core/   inti: provider, loop agen, alat, izin, OAuth, MCP, sesi, konfigurasi
packages/cli/    antarmuka terminal
apps/desktop/    Electron (main + preload + renderer vanilla TS)
scripts/         check-lines (≤300 baris/berkas), check-secrets, e2e-desktop
docs/OAUTH.md    parameter OAuth, sumber, dan risikonya
```

Aturan proyek: **maksimal 300 baris per berkas** dan **nol kredensial di repo**; keduanya dijaga skrip yang gagal
dengan kode keluar ≠ 0 dan dijalankan CI.

## Status pengujian (jujur)

| Bagian | Bukti |
|---|---|
| Alat, kurungan folder (termasuk symlink), loop agen, izin, kompaksi konteks | 51 tes otomatis lulus |
| Tiga provider (SSE, tool call, usage) | Teruji melawan server tiruan, **belum** melawan API asli |
| CLI | 5 tes proses nyata melawan server tiruan |
| Desktop | 19 pemeriksaan e2e dengan Electron nyata (kunci terenkripsi, dialog izin, tulis/tolak) |
| OAuth Claude/Codex | Alur dan pertukaran token teruji dengan token endpoint tiruan; **belum** dengan akun nyata |
| Installer NSIS | Dibangun oleh CI (`.github/workflows/build.yml`); belum pernah dijalankan |
| macOS/Linux | Kode lintas platform, **belum** diuji |

## Batasan yang diketahui

- `web_fetch` memeriksa alamat hasil DNS sebelum mengambil, tetapi serangan DNS rebinding (alamat berubah di antara dua pencarian) belum ditangani.
- Kurungan folder memeriksa symlink saat alat dipanggil; balapan symlink antara pemeriksaan dan pemakaian belum ditutup.
- Mode *otomatis penuh* menjalankan shell tanpa tanya: pakai hanya di folder yang aman dirusak.
- Alat MCP selalu diperlakukan berisiko (minta izin) karena efeknya tidak diketahui.
- `bash` memakai PowerShell di Windows dan bash di sistem lain; perintah tidak dijalankan di sandbox OS.

## Lisensi

MIT. Font Geist: SIL OFL 1.1 (lihat `apps/desktop/renderer/fonts/NOTICE.txt`).
