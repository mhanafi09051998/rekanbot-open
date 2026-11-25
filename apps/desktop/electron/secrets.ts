import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { safeStorage } from "electron";
import type { SecretStore } from "@rekanbot/core";

/**
 * Rahasia (kunci API, token OAuth) dienkripsi dengan penyimpanan OS (DPAPI/Keychain/libsecret)
 * lewat safeStorage. Tanpa enkripsi OS, menyimpan DITOLAK; tidak ada fallback teks polos.
 */
export class SafeStorageSecretStore implements SecretStore {
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
  }

  get(key: string): string | undefined {
    const v = this.read()[key];
    if (!v || !safeStorage.isEncryptionAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(v, "base64"));
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Penyimpanan terenkripsi OS tidak tersedia; rahasia tidak disimpan.");
    }
    this.write({ ...this.read(), [key]: safeStorage.encryptString(value).toString("base64") });
  }

  delete(key: string): void {
    const d = this.read();
    delete d[key];
    this.write(d);
  }

  has(key: string): boolean {
    return key in this.read();
  }
}
