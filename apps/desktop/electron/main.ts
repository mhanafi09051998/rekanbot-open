import { join } from "node:path";
import { BrowserWindow, Menu, app, session } from "electron";
import { bukaTautanAman, registerIpc } from "./ipc.ts";

let win: BrowserWindow | null = null;

// CSP ketat: hanya berkas lokal; tanpa skrip/gaya luar; koneksi jaringan hanya dari proses utama.
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";

function createWindow(): void {
  win = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#000000",
    title: "RekanBot",
    show: false,
    icon: join(__dirname, "icon.png"),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => (bukaTautanAman(url), { action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) {
      e.preventDefault();
      bukaTautanAman(url);
    }
  });
  void win.loadFile(join(__dirname, "renderer", "index.html"));
  win.on("closed", () => (win = null));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.webRequest.onHeadersReceived((d, cb) =>
      cb({ responseHeaders: { ...d.responseHeaders, "Content-Security-Policy": [CSP] } }),
    );
    session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    registerIpc(() => win);
    createWindow();
    app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
}
