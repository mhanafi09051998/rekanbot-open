import { listenForCallback } from "./callback.ts";
import { createPkce, fromTokenResponse, type OAuthTokens, type Pkce } from "./pkce.ts";

/**
 * EKSPERIMENTAL. Parameter diverifikasi dari paket resmi Claude Code 2.1.332 (25 Nov 2026).
 * Memakai client_id milik Claude Code: bisa diblokir penyedia kapan saja dan dapat bertentangan
 * dengan syarat layanan Anthropic untuk produk pihak ketiga. API key tetap jalur yang stabil.
 */
export const CLAUDE_OAUTH = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizeUrl: "https://claude.com/cai/oauth/authorize",
  tokenUrl: "https://platform.claude.com/v1/oauth/token",
  scopes: "user:profile user:inference",
  callbackPath: "/callback",
} as const;

export function buildClaudeAuthUrl(pkce: Pkce, redirectUri: string): string {
  const u = new URL(CLAUDE_OAUTH.authorizeUrl);
  u.searchParams.set("code", "true");
  u.searchParams.set("client_id", CLAUDE_OAUTH.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", CLAUDE_OAUTH.scopes);
  u.searchParams.set("code_challenge", pkce.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", pkce.state);
  return u.toString();
}

async function postToken(body: Record<string, string>): Promise<any> {
  const res = await fetch(CLAUDE_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Token Claude ditolak (HTTP ${res.status})`);
  return res.json();
}

/** Alur login: buka `openUrl` (browser), tunggu callback localhost, tukar kode dengan token. */
export async function loginClaude(openUrl: (url: string) => void | Promise<void>): Promise<OAuthTokens> {
  const pkce = createPkce();
  const cb = await listenForCallback({ port: 0, path: CLAUDE_OAUTH.callbackPath, state: pkce.state });
  try {
    const redirect = `http://localhost:${cb.port}${CLAUDE_OAUTH.callbackPath}`;
    await openUrl(buildClaudeAuthUrl(pkce, redirect));
    const { code } = await cb.result;
    const j = await postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: CLAUDE_OAUTH.clientId,
      code_verifier: pkce.verifier,
      state: pkce.state,
    });
    return fromTokenResponse(j);
  } finally {
    cb.close();
  }
}

export async function refreshClaude(t: OAuthTokens): Promise<OAuthTokens> {
  if (!t.refresh) throw new Error("Tidak ada refresh token; login ulang");
  const j = await postToken({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: CLAUDE_OAUTH.clientId });
  return fromTokenResponse(j, t);
}
