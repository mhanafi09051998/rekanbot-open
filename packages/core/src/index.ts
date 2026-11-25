export * from "./providers/types.ts";
export { createOpenAI } from "./providers/openai.ts";
export { createAnthropic, OAUTH_SYSTEM_PREFIX } from "./providers/anthropic.ts";
export { createResponses } from "./providers/openai-responses.ts";
export { readSse } from "./providers/sse.ts";
export { ToolRegistry, TOOLS_BAWAAN } from "./tools/registry.ts";
export { makeTaskTool } from "./tools/task.ts";
export { safeResolve, truncate } from "./tools/sandbox.ts";
export type { Tool, ToolContext, TodoItem, ToolKind } from "./tools/types.ts";
export { needsApproval } from "./permissions.ts";
export type { Approver, ApprovalRequest, PermissionMode } from "./permissions.ts";
export { runAgent } from "./agent/loop.ts";
export type { AgentEvent, RunOptions } from "./agent/loop.ts";
export { estimateTokens, pruneToolResults, summarizeOld } from "./agent/compact.ts";
export { SessionLog } from "./session.ts";
export { createPkce, needsRefresh } from "./auth/pkce.ts";
export type { OAuthTokens } from "./auth/pkce.ts";
export { loginClaude, refreshClaude, CLAUDE_OAUTH, buildClaudeAuthUrl } from "./auth/claude.ts";
export { loginCodex, refreshCodex, CODEX_OAUTH, buildCodexAuthUrl, accountIdFromIdToken } from "./auth/codex.ts";
export { FileSecretStore, getAccessToken, loadTokens, saveTokens } from "./auth/store.ts";
export type { SecretStore, OAuthKind } from "./auth/store.ts";
export { McpClient, mcpTools } from "./mcp/client.ts";
export type { McpServerConfig } from "./mcp/client.ts";
export { createProvider, loadConfig, saveConfig, apiKeySlot, CONFIG_BAWAAN } from "./config.ts";
export type { AppConfig, ProviderConfig, ProviderKind } from "./config.ts";

/** Prompt sistem dasar untuk agen coding. */
export const SISTEM_BAWAAN = [
  "Anda RekanBot, agen coding yang bekerja di folder kerja pengguna lewat alat.",
  "Baca kode sebelum mengubahnya; ubah seminimal mungkin; jalankan tes/build untuk membuktikan hasil.",
  "Jangan mengaku selesai tanpa bukti (keluaran perintah). Bila gagal, katakan apa adanya.",
  "Untuk pekerjaan multi-langkah, pakai todo_write. Untuk penelusuran luas, pakai task.",
  "Jawab dalam bahasa yang dipakai pengguna, ringkas.",
].join("\n");
