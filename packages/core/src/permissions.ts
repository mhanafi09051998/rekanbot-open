import type { Tool } from "./tools/types.ts";

/**
 * ask       : tulis, shell, dan jaringan selalu minta izin.
 * auto-edit : tulis/edit berkas otomatis; shell dan jaringan minta izin.
 * auto      : semua otomatis (hanya bila dipilih eksplisit pengguna).
 */
export type PermissionMode = "ask" | "auto-edit" | "auto";

export interface ApprovalRequest {
  tool: string;
  kind: Tool["kind"];
  summary: string;
  args: Record<string, unknown>;
}

export type Approver = (req: ApprovalRequest) => Promise<boolean>;

export function needsApproval(kind: Tool["kind"], mode: PermissionMode): boolean {
  if (kind === "read") return false;
  if (mode === "auto") return false;
  if (mode === "auto-edit") return kind !== "write";
  return true;
}
