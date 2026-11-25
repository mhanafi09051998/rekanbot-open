import { spawn } from "node:child_process";
import {
  apiKeySlot, loadConfig, loginClaude, loginCodex, saveConfig, saveTokens, type ProviderConfig,
} from "@rekanbot/core";
import type { Parsed } from "./args.ts";
import { CONFIG_FILE, isKind, store } from "./setup.ts";

export function openUrl(url: string): void {
  console.log(`\nBuka alamat ini di browser bila tidak terbuka otomatis:\n${url}\n`);
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
  } catch {
    /* pengguna membuka manual */
  }
}

const PERINGATAN =
  "PERINGATAN (eksperimental): login ini memakai client OAuth milik Claude Code/Codex CLI. Penyedia dapat memblokirnya\n" +
  "kapan saja dan penggunaannya dapat bertentangan dengan syarat layanan mereka. Untuk pemakaian stabil, gunakan API key.\n";

export async function cmdLogin(p: Parsed): Promise<void> {
  const target = p.positional[0];
  if (target !== "claude" && target !== "codex") throw new Error("Pakai: rekanbot login claude|codex");
  console.log(PERINGATAN);
  const t = target === "claude" ? await loginClaude(openUrl) : await loginCodex(openUrl);
  saveTokens(store, target, t);
  const config = loadConfig(CONFIG_FILE);
  const id = `${target}-oauth`;
  if (!config.providers.some((x) => x.id === id)) {
    config.providers.push({
      id, name: target === "claude" ? "Claude (langganan)" : "Codex (ChatGPT)", kind: id as ProviderConfig["kind"],
      model: target === "claude" ? "claude-sonnet-5-5" : "gpt-5-codex",
    });
  }
  config.activeProvider ??= id;
  saveConfig(CONFIG_FILE, config);
  console.log(`Login ${target} berhasil. Provider '${id}' tersedia (rekanbot --provider ${id}).`);
}

export function cmdLogout(p: Parsed): void {
  const target = p.positional[0];
  if (target !== "claude" && target !== "codex") throw new Error("Pakai: rekanbot logout claude|codex");
  store.delete(`oauth:${target}`);
  console.log(`Token ${target} dihapus dari penyimpanan lokal.`);
}

export function cmdConfig(p: Parsed): void {
  const aksi = p.positional[0];
  const config = loadConfig(CONFIG_FILE);
  if (aksi === "list") {
    if (!config.providers.length) return console.log("(belum ada provider tersimpan)");
    for (const x of config.providers) {
      const aktif = x.id === config.activeProvider ? "*" : " ";
      const kunci = store.get(apiKeySlot(x.id)) ? "kunci tersimpan" : "tanpa kunci";
      console.log(`${aktif} ${x.id}\t${x.kind}\t${x.model}\t${x.baseUrl ?? "-"}\t(${kunci})`);
    }
    return;
  }
  if (aksi === "add-provider") {
    const f = p.flags;
    if (!f.id || !f.kind || !f.model) throw new Error("Wajib: --id --kind --model");
    if (!isKind(f.kind)) throw new Error("--kind tidak dikenal");
    const baru: ProviderConfig = { id: f.id, name: f.name ?? f.id, kind: f.kind, baseUrl: f.baseUrl, model: f.model };
    config.providers = [...config.providers.filter((x) => x.id !== f.id), baru];
    config.activeProvider ??= f.id;
    if (f.apiKey) store.set(apiKeySlot(f.id), f.apiKey);
    saveConfig(CONFIG_FILE, config);
    return console.log(`Provider '${f.id}' disimpan${f.apiKey ? ' (kunci di credentials.json, bukan di config.json)' : ''}.`);
  }
  throw new Error("Pakai: rekanbot config list | add-provider ...");
}
