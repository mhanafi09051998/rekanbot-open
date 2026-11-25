// Server MCP stdio tiruan untuk pengujian: JSON-RPC per baris.
import { createInterface } from "node:readline";

const alat = [{ name: "gema", description: "Mengembalikan teks", inputSchema: { type: "object", properties: { teks: { type: "string" } } } }];
const kirim = (o) => process.stdout.write(JSON.stringify(o) + "\n");

createInterface({ input: process.stdin }).on("line", (baris) => {
  const m = JSON.parse(baris);
  if (m.method === "initialize") kirim({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "tiruan", version: "1" } } });
  else if (m.method === "tools/list") kirim({ jsonrpc: "2.0", id: m.id, result: { tools: alat } });
  else if (m.method === "tools/call") {
    if (m.params.name === "gagal") kirim({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: "sengaja gagal" }] } });
    else kirim({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: `gema: ${m.params.arguments.teks}` }] } });
  } else if (m.id !== undefined) kirim({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "metode tak dikenal" } });
});
