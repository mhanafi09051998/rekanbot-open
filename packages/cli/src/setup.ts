import { homedir } from "node:os";
import { join } from "node:path";
import {
  FileSecretStore, apiKeySlot, createProvider, loadConfig,
  type AppConfig, type PermissionMode, type Provider, type ProviderConfig, type ProviderKind,
} from "@rekanbot/core";
import type { Flags } from "./args.ts";

export const HOME = process.env.REKANBOT_HOME ?? join(homedir(), ".rekanbot");
export const CONFIG_FILE = join(HOME, "config.json");
export const store = new FileSecretStore(join(HOME, "credentials.json"));

const KINDS: ProviderKind[] = ["openai-compatible", "anthropic", "openai-responses", "claude-oauth", "codex-oauth"];
export const isKind = (s: string): s is ProviderKind => (KINDS as string[]).includes(s);

const MODEL_BAWAAN: Record<ProviderKind, string> = {
  "openai-compatible": "gpt-4o",
  "openai-responses": "gpt-4o",
  anthropic: "claude-sonnet-5-5",
  "claude-oauth": "claude-sonnet-5-5",
  "codex-oauth": "gpt-5-codex",
};

export interface Resolved {
  provider: Provider;
  model: string;
  label: string;
  config: AppConfig;
}

/** Tentukan provider dari flag, konfigurasi tersimpan, lalu env (urutan itu). */
export function resolveProvider(f: Flags): Resolved {
  const config = loadConfig(CONFIG_FILE);
  const kunciEnv = (id: string, v?: string): void => {
    if (v) store.set(apiKeySlot(id), v);
  };
  let cfg: ProviderConfig | undefined;

  const id = f.provider ?? (f.kind ? undefined : config.activeProvider);
  if (id) {
    cfg = config.providers.find((p) => p.id === id);
    if (!cfg) throw new Error(`Provider '${id}' tidak ada. Lihat: rekanbot config list`);
  } else if (f.kind) {
    if (!isKind(f.kind)) throw new Error(`--kind harus salah satu: ${KINDS.join(", ")}`);
    cfg = { id: "cli", name: "CLI", kind: f.kind, baseUrl: f.baseUrl, model: f.model ?? MODEL_BAWAAN[f.kind] };
    kunciEnv("cli", f.apiKey ?? (f.kind === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY));
  } else if (process.env.ANTHROPIC_API_KEY) {
    cfg = { id: "env", name: "Anthropic (env)", kind: "anthropic", baseUrl: f.baseUrl, model: f.model ?? MODEL_BAWAAN.anthropic };
    kunciEnv("env", process.env.ANTHROPIC_API_KEY);
  } else if (process.env.OPENAI_API_KEY) {
    cfg = { id: "env", name: "OpenAI (env)", kind: "openai-compatible", baseUrl: f.baseUrl ?? process.env.OPENAI_BASE_URL, model: f.model ?? MODEL_BAWAAN["openai-compatible"] };
    kunciEnv("env", process.env.OPENAI_API_KEY);
  } else {
    throw new Error("Belum ada provider. Set ANTHROPIC_API_KEY/OPENAI_API_KEY, atau: rekanbot config add-provider ... atau rekanbot login claude|codex");
  }
  if (f.model) cfg = { ...cfg, model: f.model };
  return { provider: createProvider(cfg, store), model: cfg.model, label: `${cfg.name}, ${cfg.model}`, config };
}

export function resolveMode(f: Flags, config: AppConfig): PermissionMode {
  if (f.yes) return "auto";
  const m = f.mode ?? config.permissionMode;
  if (m === "ask" || m === "auto-edit" || m === "auto") return m;
  throw new Error("--mode harus ask, auto-edit, atau auto");
}
