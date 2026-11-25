/** Kontrak antara proses utama, preload, dan renderer. Hanya tipe dan nama kanal. */
import type { AgentEvent, PermissionMode, ProviderKind } from "@rekanbot/core";

export const CH = {
  state: "app:state",
  send: "chat:send",
  abort: "chat:abort",
  newChat: "chat:new",
  pickFolder: "app:pick-folder",
  saveProvider: "settings:save-provider",
  removeProvider: "settings:remove-provider",
  setActive: "settings:set-active",
  setMode: "settings:set-mode",
  login: "auth:login",
  logout: "auth:logout",
  event: "agent:event",
  approvalRequest: "approval:request",
  approvalResponse: "approval:response",
} as const;

export interface ProviderView {
  id: string;
  name: string;
  kind: ProviderKind;
  model: string;
  baseUrl?: string;
  hasKey: boolean;
}

export interface UiState {
  cwd: string;
  providers: ProviderView[];
  active?: string;
  mode: PermissionMode;
  oauth: { claude: boolean; codex: boolean };
  busy: boolean;
}

export interface ProviderInput {
  id?: string;
  name: string;
  kind: ProviderKind;
  model: string;
  baseUrl?: string;
  /** Kosong berarti pertahankan kunci yang ada. */
  apiKey?: string;
}

export type UiEvent = AgentEvent | { type: "error"; message: string } | { type: "user"; text: string };

export interface ApprovalRequestMsg {
  id: number;
  tool: string;
  kind: string;
  summary: string;
  args: Record<string, unknown>;
}

export interface DesktopApi {
  getState(): Promise<UiState>;
  send(prompt: string): Promise<void>;
  abort(): void;
  newChat(): Promise<void>;
  pickFolder(): Promise<UiState>;
  saveProvider(p: ProviderInput): Promise<UiState>;
  removeProvider(id: string): Promise<UiState>;
  setActive(id: string): Promise<UiState>;
  setMode(mode: PermissionMode): Promise<UiState>;
  login(kind: "claude" | "codex"): Promise<UiState>;
  logout(kind: "claude" | "codex"): Promise<UiState>;
  respondApproval(id: number, ok: boolean): void;
  onEvent(cb: (e: UiEvent) => void): () => void;
  onApproval(cb: (r: ApprovalRequestMsg) => void): () => void;
}
