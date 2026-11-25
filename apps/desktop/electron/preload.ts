import { contextBridge, ipcRenderer } from "electron";
import { CH, type ApprovalRequestMsg, type DesktopApi, type UiEvent } from "../shared/api.ts";

/** Satu-satunya permukaan yang terbuka ke renderer: fungsi bernama, tanpa akses Node/Electron mentah. */
const api: DesktopApi = {
  getState: () => ipcRenderer.invoke(CH.state),
  send: (prompt) => ipcRenderer.invoke(CH.send, prompt),
  abort: () => ipcRenderer.send(CH.abort),
  newChat: () => ipcRenderer.invoke(CH.newChat),
  pickFolder: () => ipcRenderer.invoke(CH.pickFolder),
  saveProvider: (p) => ipcRenderer.invoke(CH.saveProvider, p),
  removeProvider: (id) => ipcRenderer.invoke(CH.removeProvider, id),
  setActive: (id) => ipcRenderer.invoke(CH.setActive, id),
  setMode: (m) => ipcRenderer.invoke(CH.setMode, m),
  login: (k) => ipcRenderer.invoke(CH.login, k),
  logout: (k) => ipcRenderer.invoke(CH.logout, k),
  respondApproval: (id, ok) => ipcRenderer.send(CH.approvalResponse, id, ok),
  onEvent: (cb) => {
    const h = (_e: unknown, ev: UiEvent): void => cb(ev);
    ipcRenderer.on(CH.event, h);
    return () => ipcRenderer.removeListener(CH.event, h);
  },
  onApproval: (cb) => {
    const h = (_e: unknown, r: ApprovalRequestMsg): void => cb(r);
    ipcRenderer.on(CH.approvalRequest, h);
    return () => ipcRenderer.removeListener(CH.approvalRequest, h);
  },
};

contextBridge.exposeInMainWorld("rekanbot", api);
