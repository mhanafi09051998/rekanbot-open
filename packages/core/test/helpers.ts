import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Mock {
  url: string;
  requests: { path: string; headers: IncomingMessage["headers"]; body: any }[];
  close(): Promise<void>;
}

/** Server HTTP tiruan. `handler` menerima body JSON yang sudah di-parse dan menulis respons. */
export async function startMock(
  handler: (req: IncomingMessage, res: ServerResponse, body: any, n: number) => void,
): Promise<Mock> {
  const requests: Mock["requests"] = [];
  const server: Server = createServer((req, res) => {
    const potong: Buffer[] = [];
    req.on("data", (c) => potong.push(c));
    req.on("end", () => {
      const teks = Buffer.concat(potong).toString("utf8");
      let body: any = teks;
      try {
        body = teks ? JSON.parse(teks) : undefined;
      } catch {
        /* biarkan teks mentah */
      }
      requests.push({ path: req.url ?? "", headers: req.headers, body });
      handler(req, res, body, requests.length - 1);
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((ok) => (server.closeAllConnections?.(), server.close(() => ok()))),
  };
}

export function sse(res: ServerResponse, events: { event?: string; data: unknown }[]): void {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of events) {
    if (e.event) res.write(`event: ${e.event}\n`);
    res.write(`data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}\n\n`);
  }
  res.end();
}

export function tmpDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "rekanbot-test-")));
}

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/** Potongan SSE gaya OpenAI untuk satu teks lalu selesai. */
export function openaiText(res: ServerResponse, teks: string): void {
  sse(res, [
    { data: { choices: [{ delta: { content: teks } }] } },
    { data: { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 3 } } },
    { data: "[DONE]" },
  ]);
}

/** Potongan SSE gaya OpenAI untuk satu atau lebih panggilan alat (argumen dipecah agar menguji penggabungan). */
export function openaiCalls(res: ServerResponse, calls: { id: string; name: string; args: object }[]): void {
  const events: { data: unknown }[] = [];
  calls.forEach((c, index) => {
    const json = JSON.stringify(c.args);
    const tengah = Math.floor(json.length / 2);
    events.push({ data: { choices: [{ delta: { tool_calls: [{ index, id: c.id, function: { name: c.name, arguments: json.slice(0, tengah) } }] } }] } });
    events.push({ data: { choices: [{ delta: { tool_calls: [{ index, function: { arguments: json.slice(tengah) } }] } }] } });
  });
  events.push({ data: { choices: [{ delta: {}, finish_reason: "tool_calls" }] } });
  events.push({ data: "[DONE]" });
  sse(res, events);
}
