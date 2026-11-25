#!/usr/bin/env node
import { BANTUAN, parseArgs } from "./args.ts";
import { cmdConfig, cmdLogin, cmdLogout } from "./commands.ts";
import { runCli } from "./run.ts";

async function main(): Promise<number> {
  const p = parseArgs(process.argv.slice(2));
  if (p.flags.help) {
    console.log(BANTUAN);
    return 0;
  }
  if (p.command === "login") await cmdLogin(p);
  else if (p.command === "logout") cmdLogout(p);
  else if (p.command === "config") cmdConfig(p);
  else return runCli(p.flags);
  return 0;
}

main().then(
  (kode) => process.exit(kode),
  (e: Error) => {
    console.error(`Galat: ${e.message}`);
    process.exit(1);
  },
);
