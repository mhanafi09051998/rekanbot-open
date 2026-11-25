/** Tipe seragam untuk semua provider: pesan, alat, dan peristiwa aliran. */
export type Role = "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string;
  /** Hanya untuk role assistant: panggilan alat yang diminta model. */
  toolCalls?: ToolCall[];
  /** Hanya untuk role tool: id panggilan yang dijawab. */
  toolCallId?: string;
  /** Hanya untuk role tool: true bila alat gagal. */
  isError?: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; input: number; output: number }
  | { type: "done"; stop: string };

export interface StreamRequest {
  model: string;
  system?: string;
  messages: Message[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface Provider {
  readonly id: string;
  stream(req: StreamRequest): AsyncIterable<StreamEvent>;
}

export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
