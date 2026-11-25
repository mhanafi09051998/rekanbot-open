import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { refreshClaude } from "./claude.ts";
import { refreshCodex } from "./codex.ts";
import { needsRefresh, type OAuthTokens } from "./pkce.ts";

/** Penyimpanan rahasia yang bisa diganti: Electron memakai safeStorage, CLI memakai berkas 0600. */
export interface SecretStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/** Berkas JSON berizin 0600 di folder data pengguna (BUKAN di repo). */
export class FileSecretStore implements SecretStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  private read(): Record<string, string> {
    if (!existsSync(this.file)) return {};
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private write(d: Record<string, string>): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(d), { encoding: "utf8", mode: 0o600 });
    try {
      chmodSync(this.file, 0o600);
    } catch {
      /* Windows: izin POSIX tidak berlaku */
    }
  }

  get = (k: string): string | undefined => this.read()[k];
  set = (k: string, v: string): void => this.write({ ...this.read(), [k]: v });
  delete = (k: string): void => {
    const d = this.read();
    delete d[k];
    this.write(d);
  };
}

export type OAuthKind = "claude" | "codex";
const kunci = (k: OAuthKind): string => `oauth:${k}`;

export function saveTokens(store: SecretStore, kind: OAuthKind, t: OAuthTokens): void {
  store.set(kunci(kind), JSON.stringify(t));
}

export function loadTokens(store: SecretStore, kind: OAuthKind): OAuthTokens | undefined {
  const s = store.get(kunci(kind));
  if (!s) return undefined;
  try {
    return JSON.parse(s) as OAuthTokens;
  } catch {
    return undefined;
  }
}

/** Token akses yang masih berlaku; diperbarui otomatis lewat refresh token bila hampir habis. */
export async function getAccessToken(store: SecretStore, kind: OAuthKind): Promise<OAuthTokens> {
  const t = loadTokens(store, kind);
  if (!t) throw new Error(`Belum login ${kind}. Jalankan login terlebih dahulu.`);
  if (!needsRefresh(t)) return t;
  const baru = kind === "claude" ? await refreshClaude(t) : await refreshCodex(t);
  saveTokens(store, kind, baru);
  return baru;
}
