# Login OAuth (eksperimental)

RekanBot dapat masuk memakai langganan **Claude (Pro/Max)** dan **ChatGPT (Codex)** lewat alur PKCE dengan callback
localhost. Ini **bukan** OAuth publik untuk pihak ketiga: RekanBot memakai `client_id` milik Claude Code dan Codex CLI.

> **Risiko.** Penyedia dapat mengubah atau memblokir jalur ini kapan saja, dan penggunaan token langganan di luar
> aplikasi resmi dapat bertentangan dengan syarat layanan mereka. Jalur yang stabil dan didukung adalah **API key**
> (OpenAI, Anthropic, atau endpoint compatible). Gunakan login OAuth atas tanggung jawab sendiri.

## Parameter dan sumbernya (diverifikasi 25 Nov 2026)

| | Claude | Codex (ChatGPT) |
|---|---|---|
| Authorize | `https://claude.com/cai/oauth/authorize` | `https://auth.openai.com/oauth/authorize` |
| Token | `https://platform.claude.com/v1/oauth/token` | `https://auth.openai.com/oauth/token` |
| client_id | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` | `app_EMoamEEZ73f0CkXaXp7hrann` |
| Scope | `user:profile user:inference` | `openid profile email offline_access` |
| Redirect | `http://localhost:<port acak>/callback` | `http://localhost:1455/auth/callback` |
| Tambahan | header `anthropic-beta: oauth-2025-04-20` | `id_token_add_organizations`, `codex_cli_simplified_flow`, header `chatgpt-account-id` |
| API | `https://api.anthropic.com/v1/messages` (Bearer) | `https://chatgpt.com/backend-api/codex/responses` |

Sumber: string yang dibaca dari paket npm resmi `@anthropic-ai/claude-code` 2.1.332 (biner Windows, hanya dibaca),
dan kode sumber `openai/codex` (`codex-rs/login/src/server.rs`, `auth/manager.rs`).

## Yang sudah dan belum teruji

- **Teruji (otomatis):** pembuatan URL, PKCE (`challenge = sha256(verifier)`), pemeriksaan `state`, pertukaran kode ke token,
  refresh otomatis dan penyimpanan token baru, ekstraksi `chatgpt_account_id`. Endpoint token disimulasikan.
- **BELUM teruji:** login sungguhan ke akun Claude/ChatGPT, panggilan model memakai token OAuth, dan apakah backend
  menerima permintaan (mis. awalan sistem `You are Claude Code...` untuk Claude). Uji pertama yang sebenarnya:
  `rekanbot login claude` lalu kirim satu pesan.

## Penyimpanan token

Desktop: dienkripsi dengan `safeStorage` OS (DPAPI/Keychain/libsecret); tanpa enkripsi OS, token tidak disimpan.
CLI: `~/.rekanbot/credentials.json` berizin 0600. Token tidak pernah ditulis ke repo atau log.
