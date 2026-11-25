import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import {
  apiKeySlot, loadConfig, saveConfig, type AppConfig, type PermissionMode, type ProviderConfig,
} from "@rekanbot/core";
import type { ProviderInput, UiState } from "../shared/api.ts";
import { SafeStorageSecretStore } from "./secrets.ts";

const dataDir = (): string => app.getPath("userData");
const configFile = (): string => join(dataDir(), "config.json");
const uiFile = (): string => join(dataDir(), "ui.json");

export const secrets = new SafeStorageSecretStore(join(app.getPath("userData"), "credentials.enc.json"));

export function readConfig(): AppConfig {
  return loadConfig(configFile());
}

export function writeConfig(c: AppConfig): void {
  saveConfig(configFile(), c);
}

export function readCwd(): string {
  try {
    const j = JSON.parse(readFileSync(uiFile(), "utf8")) as { cwd?: string };
    if (j.cwd && existsSync(j.cwd)) return j.cwd;
  } catch {
    /* pertama kali dijalankan */
  }
  const bawaan = join(homedir(), "RekanBot");
  mkdirSync(bawaan, { recursive: true });
  return bawaan;
}

export function writeCwd(cwd: string): void {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(uiFile(), JSON.stringify({ cwd }), "utf8");
}

export function view(cwd: string, busy: boolean): UiState {
  const c = readConfig();
  return {
    cwd,
    busy,
    active: c.activeProvider,
    mode: c.permissionMode,
    providers: c.providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, model: p.model, baseUrl: p.baseUrl, hasKey: secrets.has(apiKeySlot(p.id)) })),
    oauth: { claude: secrets.has("oauth:claude"), codex: secrets.has("oauth:codex") },
  };
}

/** Tambah/ubah provider. Kunci kosong = pertahankan yang lama. */
export function upsertProvider(p: ProviderInput): void {
  const c = readConfig();
  const id = p.id ?? `p${Date.now().toString(36)}`;
  const baru: ProviderConfig = { id, name: p.name.trim() || id, kind: p.kind, model: p.model.trim(), baseUrl: p.baseUrl?.trim() || undefined };
  if (!baru.model) throw new Error("Nama model wajib diisi");
  c.providers = [...c.providers.filter((x) => x.id !== id), baru];
  c.activeProvider ??= id;
  if (p.apiKey) secrets.set(apiKeySlot(id), p.apiKey);
  writeConfig(c);
}

export function deleteProvider(id: string): void {
  const c = readConfig();
  c.providers = c.providers.filter((p) => p.id !== id);
  if (c.activeProvider === id) c.activeProvider = c.providers[0]?.id;
  secrets.delete(apiKeySlot(id));
  writeConfig(c);
}

export function setActive(id: string): void {
  const c = readConfig();
  if (!c.providers.some((p) => p.id === id)) throw new Error("Provider tidak ditemukan");
  c.activeProvider = id;
  writeConfig(c);
}

export function setMode(mode: PermissionMode): void {
  if (mode !== "ask" && mode !== "auto-edit" && mode !== "auto") throw new Error("Mode tidak valid");
  const c = readConfig();
  c.permissionMode = mode;
  writeConfig(c);
}
