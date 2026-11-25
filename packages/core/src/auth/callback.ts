import { createServer, type Server } from "node:http";

export interface CallbackResult {
  code: string;
  state: string;
}

const HALAMAN =
  "<!doctype html><meta charset=utf-8><title>RekanBot</title>" +
  "<body style='background:#000;color:#fff;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0'>" +
  "<p>Login selesai. Anda boleh menutup tab ini dan kembali ke RekanBot.</p>";

export interface CallbackHandle {
  port: number;
  result: Promise<CallbackResult>;
  close(): void;
}

/**
 * Server sementara di 127.0.0.1 untuk menerima redirect OAuth. Hanya menerima jalur `path`,
 * memeriksa `state`, dan menutup diri setelah satu hasil atau timeout.
 */
export function listenForCallback(opts: { port: number; path: string; state: string; timeoutMs?: number }): Promise<CallbackHandle> {
  return new Promise((siap, gagalMulai) => {
    let server: Server;
    let selesai!: (r: CallbackResult) => void;
    let tolak!: (e: Error) => void;
    const result = new Promise<CallbackResult>((ok, no) => {
      selesai = ok;
      tolak = no;
    });
    result.catch(() => undefined);
    const timer = setTimeout(() => {
      tolak(new Error("Login kedaluwarsa (tidak ada respons dari browser)"));
      server.close();
    }, opts.timeoutMs ?? 5 * 60_000);

    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${opts.port}`);
      if (url.pathname !== opts.path) {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const galat = url.searchParams.get("error");
      if (galat) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end(`Login ditolak: ${galat}`);
        tolak(new Error(`Login ditolak: ${galat}`));
      } else if (!code || state !== opts.state) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Permintaan tidak valid");
        return;
      } else {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(HALAMAN);
        selesai({ code, state });
      }
      clearTimeout(timer);
      server.close();
    });
    server.on("error", gagalMulai);
    server.listen(opts.port, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      siap({
        port,
        result,
        close: () => {
          clearTimeout(timer);
          server.close();
        },
      });
    });
  });
}
