import { createHash, randomBytes } from "node:crypto";

const b64url = (b: Buffer): string => b.toString("base64url");

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

export function createPkce(): Pkce {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(randomBytes(24)) };
}

/** Token OAuth yang disimpan; expiresAt dalam ms epoch. */
export interface OAuthTokens {
  access: string;
  refresh?: string;
  expiresAt: number;
  /** ID akun (Codex: chatgpt_account_id dari id_token). */
  accountId?: string;
}

export function fromTokenResponse(j: any, lama?: OAuthTokens): OAuthTokens {
  if (!j || typeof j.access_token !== "string") throw new Error("Respons token tidak valid");
  const detik = typeof j.expires_in === "number" ? j.expires_in : 3600;
  return {
    access: j.access_token,
    refresh: typeof j.refresh_token === "string" ? j.refresh_token : lama?.refresh,
    expiresAt: Date.now() + detik * 1000,
    accountId: lama?.accountId,
  };
}

/** True bila token sudah/hampir kedaluwarsa (margin 60 dtk). */
export function needsRefresh(t: OAuthTokens, sekarang = Date.now()): boolean {
  return t.expiresAt - sekarang < 60_000;
}
