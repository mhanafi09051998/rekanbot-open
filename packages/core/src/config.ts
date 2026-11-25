import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CODEX_OAUTH } from "./auth/codex.ts";
import { getAccessToken, type SecretStore } from "./auth/store.ts";
import type { McpServerConfig } from "./mcp/client.ts";
import type { PermissionMode } from "./permissions.ts";
import { createAnthropic } from "./providers/anthropic.ts";
import { createOpenAI } from "./providers/openai.ts";
import { createResponses } from "./providers/openai-responses.ts";
import type { Provider } from "./providers/types.ts";

export type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "openai-responses"
  | "claude-oauth"
  | "codex-oauth";

/** Konfigurasi provider TANPA rahasia. Kunci API disimpan di SecretStore dengan kunci `apikey:<id>`. */
export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
}

export interface AppConfig {
  providers: ProviderConfig[];
  activeProvider?: string;
  permissionMode: PermissionMode;
  mcpServers: McpServerConfig[];
}

export const CONFIG_BAWAAN: AppConfig = { providers: [], permissionMode: "ask", mcpServers: [] };

export function loadConfig(file: string): AppConfig {
  if (!existsSync(file)) return structuredClone(CONFIG_BAWAAN);
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as Partial<AppConfig>;
    return { ...structuredClone(CONFIG_BAWAAN), ...j };
  } catch {
    return structuredClone(CONFIG_BAWAAN);
  }
}

export function saveConfig(file: string, cfg: AppConfig): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2), "utf8");
}

export const apiKeySlot = (id: string): string => `apikey:${id}`;

/** Bangun Provider dari konfigurasi. Token OAuth diambil dan diperbarui otomatis tiap permintaan. */
export function createProvider(cfg: ProviderConfig, store: SecretStore): Provider {
  const apiKey = store.get(apiKeySlot(cfg.id));
  switch (cfg.kind) {
    case "anthropic":
      return createAnthropic({ baseUrl: cfg.baseUrl, apiKey });
    case "claude-oauth":
      return createAnthropic({ baseUrl: cfg.baseUrl, auth: async () => (await getAccessToken(store, "claude")).access });
    case "openai-responses":
      return createResponses({ baseUrl: cfg.baseUrl ?? "https://api.openai.com/v1", apiKey });
    case "codex-oauth":
      return createResponses({
        baseUrl: cfg.baseUrl ?? CODEX_OAUTH.apiBase,
        auth: async () => {
          const t = await getAccessToken(store, "codex");
          return {
            bearer: t.access,
            headers: { ...(t.accountId ? { "chatgpt-account-id": t.accountId } : {}), originator: "rekanbot_open" },
          };
        },
      });
    case "openai-compatible":
    default:
      return createOpenAI({ baseUrl: cfg.baseUrl ?? "https://api.openai.com/v1", apiKey });
  }
}
