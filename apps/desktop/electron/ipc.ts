import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { loginClaude, loginCodex, saveTokens, type ProviderConfig } from "@rekanbot/core";
import { CH, type ProviderInput } from "../shared/api.ts";
import { ChatSession } from "./chat.ts";
import {
  deleteProvider, readConfig, readCwd, secrets, setActive, setMode, upsertProvider, view, writeConfig, writeCwd,
} from "./state.ts";

/** Hanya http(s) yang boleh dibuka di browser luar. */
export function bukaTautanAman(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  let cwd = readCwd();
  const kirim = (ch: string, data: unknown): void => {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(ch, data);
  };
  const chat = new ChatSession((e) => kirim(CH.event, e), (r) => kirim(CH.approvalRequest, r));
  const state = () => view(cwd, chat.busy);

  ipcMain.handle(CH.state, () => state());
  ipcMain.handle(CH.send, async (_e, prompt: unknown) => {
    if (typeof prompt !== "string" || !prompt.trim()) return;
    await chat.send(prompt.trim(), readConfig(), secrets, cwd);
  });
  ipcMain.on(CH.abort, () => chat.abort());
  ipcMain.handle(CH.newChat, () => chat.reset());
  ipcMain.on(CH.approvalResponse, (_e, id: unknown, ok: unknown) => {
    if (typeof id === "number") chat.respond(id, ok === true);
  });

  ipcMain.handle(CH.pickFolder, async () => {
    const w = getWindow();
    const opsi = { properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
    const r = w ? await dialog.showOpenDialog(w, opsi) : await dialog.showOpenDialog(opsi);
    if (!r.canceled && r.filePaths[0]) {
      cwd = r.filePaths[0];
      writeCwd(cwd);
      chat.reset();
    }
    return state();
  });

  ipcMain.handle(CH.saveProvider, (_e, p: ProviderInput) => (upsertProvider(p), state()));
  ipcMain.handle(CH.removeProvider, (_e, id: string) => (deleteProvider(id), state()));
  ipcMain.handle(CH.setActive, (_e, id: string) => (setActive(id), state()));
  ipcMain.handle(CH.setMode, (_e, m) => (setMode(m), state()));

  ipcMain.handle(CH.login, async (_e, kind: "claude" | "codex") => {
    if (kind !== "claude" && kind !== "codex") throw new Error("Jenis login tidak dikenal");
    const t = kind === "claude" ? await loginClaude(bukaTautanAman) : await loginCodex(bukaTautanAman);
    saveTokens(secrets, kind, t);
    const c = readConfig();
    const id = `${kind}-oauth`;
    if (!c.providers.some((p) => p.id === id)) {
      const baru: ProviderConfig = {
        id, kind: id as ProviderConfig["kind"],
        name: kind === "claude" ? "Claude (langganan)" : "Codex (ChatGPT)",
        model: kind === "claude" ? "claude-sonnet-5-5" : "gpt-5-codex",
      };
      c.providers.push(baru);
    }
    c.activeProvider = id;
    writeConfig(c);
    return state();
  });

  ipcMain.handle(CH.logout, (_e, kind: "claude" | "codex") => {
    if (kind === "claude" || kind === "codex") secrets.delete(`oauth:${kind}`);
    return state();
  });
}
