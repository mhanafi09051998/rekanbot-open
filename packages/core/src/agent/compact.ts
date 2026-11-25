import type { Message, Provider } from "../providers/types.ts";

/** Perkiraan kasar token: 1 token ≈ 4 karakter. */
export function estimateTokens(messages: Message[], system = ""): number {
  let n = system.length;
  for (const m of messages) {
    n += m.content.length;
    for (const c of m.toolCalls ?? []) n += JSON.stringify(c.args).length + c.name.length;
  }
  return Math.ceil(n / 4);
}

const SISA_HASIL = 400;

/** Tahap 1 (tanpa model): pangkas isi hasil alat lama, simpan hanya yang terbaru utuh. */
export function pruneToolResults(messages: Message[], simpanTerakhir = 6): Message[] {
  const idx = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const ubah = new Set(idx.slice(0, Math.max(0, idx.length - simpanTerakhir)));
  return messages.map((m, i) =>
    ubah.has(i) && m.content.length > SISA_HASIL
      ? { ...m, content: `${m.content.slice(0, SISA_HASIL)}\n... [hasil lama dipangkas untuk menghemat konteks]` }
      : m,
  );
}

/**
 * Tahap 2 (pakai model): ringkas pesan lama menjadi satu pesan, simpan `simpan` pesan terakhir.
 * Pemotongan tidak boleh memisahkan assistant(toolCalls) dari hasil alatnya.
 */
export async function summarizeOld(
  provider: Provider,
  model: string,
  messages: Message[],
  simpan = 8,
  signal?: AbortSignal,
): Promise<Message[]> {
  if (messages.length <= simpan + 1) return messages;
  let potong = messages.length - simpan;
  while (potong < messages.length && messages[potong]!.role === "tool") potong++;
  if (potong >= messages.length) return messages;
  const lama = messages.slice(0, potong);
  const transkrip = lama
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}${m.toolCalls ? ` [alat: ${m.toolCalls.map((c) => c.name).join(", ")}]` : ""}`)
    .join("\n");
  let ringkas = "";
  for await (const ev of provider.stream({
    model,
    system: "Ringkas percakapan agen coding ini: tujuan pengguna, keputusan, berkas yang diubah, dan sisa pekerjaan. Padat, maks 400 kata.",
    messages: [{ role: "user", content: transkrip }],
    tools: [],
    signal,
  })) {
    if (ev.type === "text") ringkas += ev.delta;
  }
  return [{ role: "user", content: `[Ringkasan percakapan sebelumnya]\n${ringkas.trim()}` }, ...messages.slice(potong)];
}
