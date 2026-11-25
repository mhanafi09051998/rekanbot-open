export interface Flags {
  print?: string;
  provider?: string;
  kind?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  id?: string;
  name?: string;
  mode?: string;
  cwd?: string;
  yes: boolean;
  resume: boolean;
  help: boolean;
}

export interface Parsed {
  /** Kata pertama bila bukan flag: login | config | logout | run. */
  command: string;
  positional: string[];
  flags: Flags;
}

const PERINTAH = new Set(["login", "logout", "config"]);

/** Parser argumen sederhana tanpa dependensi. Flag: --nama nilai atau --nama=nilai; -p, -y, -h. */
export function parseArgs(argv: string[]): Parsed {
  const flags: Flags = { yes: false, resume: false, help: false };
  const positional: string[] = [];
  const peta: Record<string, keyof Flags> = {
    "--provider": "provider", "--kind": "kind", "--model": "model", "--base-url": "baseUrl",
    "--api-key": "apiKey", "--id": "id", "--name": "name", "--mode": "mode", "--cwd": "cwd", "-p": "print", "--print": "print",
  };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]!;
    let nilai: string | undefined;
    const sama = a.indexOf("=");
    if (a.startsWith("--") && sama > 0) {
      nilai = a.slice(sama + 1);
      a = a.slice(0, sama);
    }
    if (a === "-y" || a === "--yes") flags.yes = true;
    else if (a === "-h" || a === "--help") flags.help = true;
    else if (a === "--resume" || a === "-r") flags.resume = true;
    else if (peta[a]) {
      const v = nilai ?? argv[++i];
      if (v === undefined) throw new Error(`Flag ${a} butuh nilai`);
      (flags as unknown as Record<string, string>)[peta[a]!] = v;
    } else if (a.startsWith("-") && a.length > 1) throw new Error(`Flag tidak dikenal: ${a}`);
    else positional.push(a);
  }
  const first = positional[0];
  const command = first && PERINTAH.has(first) ? first : "run";
  return { command, positional: command === "run" ? positional : positional.slice(1), flags };
}

export const BANTUAN = `RekanBot Open: agen coding di terminal

Pemakaian
  rekanbot                         sesi interaktif di folder saat ini
  rekanbot -p "perintah"           sekali jalan lalu keluar
  rekanbot login claude|codex      login OAuth (EKSPERIMENTAL)
  rekanbot config add-provider --id ID --kind KIND --model M [--base-url URL] [--api-key KUNCI]
  rekanbot config list

Opsi
  --provider ID    pakai provider tersimpan
  --kind KIND      openai-compatible | anthropic | openai-responses | claude-oauth | codex-oauth
  --model M        nama model          --base-url URL  alamat API
  --mode MODE      ask (bawaan) | auto-edit | auto
  -y, --yes        sama dengan --mode auto (HATI-HATI: shell dan tulis tanpa tanya)
  --cwd DIR        folder kerja         -r, --resume    lanjutkan sesi terakhir
  -h, --help       bantuan

Tanpa --provider/--kind, dipakai env: ANTHROPIC_API_KEY atau OPENAI_API_KEY (+ OPENAI_BASE_URL).
Data (konfigurasi, kunci, sesi) ada di ~/.rekanbot, tidak pernah di repo.
`;
