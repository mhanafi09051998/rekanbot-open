import type { DesktopApi } from "../shared/api.ts";

declare global {
  interface Window {
    rekanbot: DesktopApi;
  }
}

export {};
