import { listenForCallback } from "./callback.ts";
import { createPkce, fromTokenResponse, type OAuthTokens, type Pkce } from "./pkce.ts";

/**
 * EKSPERIMENTAL. Parameter diverifikasi dari sumber resmi openai/codex (codex-rs/login, 25 Nov 2026).
 * Memakai client_id milik Codex CLI; bisa berubah atau diblokir kapan saja.
 */
export const CODEX_OAUTH = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  scopes: "openid profile email offline_access",
  port: 1455,
  callbackPath: "/auth/callback",
  /** Backend ChatGPT yang dipakai Codex CLI (Responses API). */
  apiBase: "https://chatgpt.com/backend-api/codex",
} as const;

export function buildCodexAuthUrl(pkce: Pkce, redirectUri: string): string {
  const u = new URL(CODEX_OAUTH.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", CODEX_OAUTH.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", CODEX_OAUTH.scopes);
  u.searchParams.set("code_challenge", pkce.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("id_token_add_organizations", "true");
  u.searchParams.set("codex_cli_simplified_flow", "true");
  u.searchParams.set("originator", "rekanbot_open");
  u.searchParams.set("state", pkce.state);
  return u.toString();
}

/** Ambil chatgpt_account_id dari klaim id_token (tanpa verifikasi tanda tangan; hanya untuk header). */
export function accountIdFromIdToken(idToken: unknown): string | undefined {
  if (typeof idToken !== "string") return undefined;
  const bagian = idToken.split(".");
  if (bagian.length < 2) return undefined;
  try {
    const klaim = JSON.parse(Buffer.from(bagian[1]!, "base64url").toString("utf8"));
    const id = klaim?.["https://api.openai.com/auth"]?.chatgpt_account_id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

async function postToken(form: Record<string, string>): Promise<any> {
  const res = await fetch(CODEX_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) throw new Error(`Token Codex ditolak (HTTP ${res.status})`);
  return res.json();
}

export async function loginCodex(openUrl: (url: string) => void | Promise<void>): Promise<OAuthTokens> {
  const pkce = createPkce();
  const cb = await listenForCallback({ port: CODEX_OAUTH.port, path: CODEX_OAUTH.callbackPath, state: pkce.state });
  try {
    const redirect = `http://localhost:${cb.port}${CODEX_OAUTH.callbackPath}`;
    await openUrl(buildCodexAuthUrl(pkce, redirect));
    const { code } = await cb.result;
    const j = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: CODEX_OAUTH.clientId,
      code_verifier: pkce.verifier,
    });
    const t = fromTokenResponse(j);
    t.accountId = accountIdFromIdToken(j.id_token);
    return t;
  } finally {
    cb.close();
  }
}

export async function refreshCodex(t: OAuthTokens): Promise<OAuthTokens> {
  if (!t.refresh) throw new Error("Tidak ada refresh token; login ulang");
  const j = await postToken({
    grant_type: "refresh_token",
    refresh_token: t.refresh,
    client_id: CODEX_OAUTH.clientId,
    scope: CODEX_OAUTH.scopes,
  });
  const baru = fromTokenResponse(j, t);
  baru.accountId = accountIdFromIdToken(j.id_token) ?? t.accountId;
  return baru;
}
