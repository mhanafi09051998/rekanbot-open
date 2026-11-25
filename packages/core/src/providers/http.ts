import { ProviderError } from "./types.ts";

/** POST JSON dan lempar ProviderError berisi pesan dari server bila bukan 2xx. */
export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const teks = (await res.text().catch(() => "")).slice(0, 600);
    throw new ProviderError(`HTTP ${res.status} dari ${new URL(url).host}: ${teks || res.statusText}`, res.status);
  }
  return res;
}

export function parseArgs(json: string): Record<string, unknown> {
  if (!json.trim()) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}
