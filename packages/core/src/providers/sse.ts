/** Pembaca Server-Sent Events dari Response.body (tanpa dependensi). */
export interface SseMessage {
  event: string;
  data: string;
}

export async function* readSse(res: Response): AsyncGenerator<SseMessage> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const blok = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const msg = parseBlock(blok);
        if (msg) yield msg;
      }
    }
    const sisa = parseBlock(buf);
    if (sisa) yield sisa;
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(blok: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const baris of blok.split("\n")) {
    if (baris.startsWith(":")) continue;
    if (baris.startsWith("event:")) event = baris.slice(6).trim();
    else if (baris.startsWith("data:")) data.push(baris.slice(5).replace(/^ /, ""));
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
