import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildClaudeAuthUrl, loginClaude, CLAUDE_OAUTH } from "../src/auth/claude.ts";
import { listenForCallback } from "../src/auth/callback.ts";
import { accountIdFromIdToken, buildCodexAuthUrl, loginCodex, CODEX_OAUTH } from "../src/auth/codex.ts";
import { createPkce, fromTokenResponse, needsRefresh } from "../src/auth/pkce.ts";
import { FileSecretStore, getAccessToken, loadTokens, saveTokens } from "../src/auth/store.ts";
import { tmpDir } from "./helpers.ts";

const fetchAsli = globalThis.fetch;
after(() => {
  globalThis.fetch = fetchAsli;
});

/** Ganti fetch global: permintaan ke host OAuth dicegat dan direkam; permintaan lokal diteruskan. */
function stubTokenEndpoint(balas: (url: string, body: string) => object) {
  const panggilan: { url: string; body: string; tipe: string | null }[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input instanceof URL ? input.href : input?.url ?? input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) return fetchAsli(input, init);
    const body = String(init?.body ?? "");
    panggilan.push({ url, body, tipe: new Headers(init?.headers).get("content-type") });
    return new Response(JSON.stringify(balas(url, body)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return panggilan;
}

test("pkce: challenge = base64url(sha256(verifier)); state unik", () => {
  const a = createPkce();
  const b = createPkce();
  assert.equal(a.challenge, createHash("sha256").update(a.verifier).digest("base64url"));
  assert.notEqual(a.state, b.state);
  assert.ok(a.verifier.length >= 43);
});

test("callback: state salah ditolak (hasil tetap menunggu), state benar menyelesaikan", async () => {
  const cb = await listenForCallback({ port: 0, path: "/cb", state: "S1" });
  const salah = await fetchAsli(`http://127.0.0.1:${cb.port}/cb?code=abc&state=SALAH`);
  assert.equal(salah.status, 400);
  const lain = await fetchAsli(`http://127.0.0.1:${cb.port}/lain?code=abc&state=S1`);
  assert.equal(lain.status, 404);
  const ok = await fetchAsli(`http://127.0.0.1:${cb.port}/cb?code=KODE&state=S1`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await cb.result, { code: "KODE", state: "S1" });
});

test("callback: error dari penyedia menolak hasil", async () => {
  const cb = await listenForCallback({ port: 0, path: "/cb", state: "S" });
  await fetchAsli(`http://127.0.0.1:${cb.port}/cb?error=access_denied&state=S`);
  await assert.rejects(cb.result, /access_denied/);
});

test("URL otorisasi Claude memuat parameter terverifikasi", () => {
  const u = new URL(buildClaudeAuthUrl(createPkce(), "http://localhost:9/callback"));
  assert.equal(u.origin + u.pathname, CLAUDE_OAUTH.authorizeUrl);
  assert.equal(u.searchParams.get("client_id"), CLAUDE_OAUTH.clientId);
  assert.equal(u.searchParams.get("scope"), "user:profile user:inference");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("response_type"), "code");
});

test("URL otorisasi Codex memuat parameter terverifikasi", () => {
  const u = new URL(buildCodexAuthUrl(createPkce(), "http://localhost:1455/auth/callback"));
  assert.equal(u.origin + u.pathname, CODEX_OAUTH.authorizeUrl);
  assert.equal(u.searchParams.get("client_id"), "app_EMoamEEZ73f0CkXaXp7hrann");
  assert.equal(u.searchParams.get("codex_cli_simplified_flow"), "true");
  assert.equal(u.searchParams.get("id_token_add_organizations"), "true");
  assert.match(u.searchParams.get("scope")!, /offline_access/);
});

test("login Claude penuh: PKCE konsisten, kode ditukar, token tersimpan bentuknya benar", async () => {
  const rekam = stubTokenEndpoint(() => ({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 }));
  let authUrl = "";
  const t = await loginClaude(async (url) => {
    authUrl = url;
    const a = new URL(url);
    const redirect = a.searchParams.get("redirect_uri")!;
    const port = new URL(redirect).port;
    await fetchAsli(`http://127.0.0.1:${port}/callback?code=KODE-X&state=${a.searchParams.get("state")}`);
  });
  assert.equal(t.access, "acc-1");
  assert.equal(t.refresh, "ref-1");
  assert.ok(t.expiresAt > Date.now() + 3_000_000);
  assert.equal(rekam.length, 1);
  assert.equal(rekam[0]!.url, CLAUDE_OAUTH.tokenUrl);
  const kirim = JSON.parse(rekam[0]!.body);
  assert.equal(kirim.grant_type, "authorization_code");
  assert.equal(kirim.code, "KODE-X");
  assert.equal(kirim.client_id, CLAUDE_OAUTH.clientId);
  assert.equal(kirim.redirect_uri, new URL(authUrl).searchParams.get("redirect_uri"));
  const tantangan = new URL(authUrl).searchParams.get("code_challenge");
  assert.equal(createHash("sha256").update(kirim.code_verifier).digest("base64url"), tantangan);
});

function buatIdToken(accountId: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return [enc({ alg: "none" }), enc({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }), "sig"].join(".");
}

test("login Codex penuh: form-encoded, verifier cocok, accountId diambil dari id_token", async (t) => {
  const rekam = stubTokenEndpoint(() => ({ access_token: "cx-acc", refresh_token: "cx-ref", expires_in: 600, id_token: buatIdToken("acct-42") }));
  let tok;
  try {
    tok = await loginCodex(async (url) => {
      const a = new URL(url);
      await fetchAsli(`http://127.0.0.1:${CODEX_OAUTH.port}${CODEX_OAUTH.callbackPath}?code=CX&state=${a.searchParams.get("state")}`);
      (rekam as any).auth = a;
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") return t.skip("port 1455 sedang dipakai di mesin ini");
    throw e;
  }
  assert.equal(tok.accountId, "acct-42");
  assert.equal(rekam[0]!.tipe, "application/x-www-form-urlencoded");
  const f = new URLSearchParams(rekam[0]!.body);
  assert.equal(f.get("grant_type"), "authorization_code");
  assert.equal(f.get("client_id"), CODEX_OAUTH.clientId);
  assert.equal(createHash("sha256").update(f.get("code_verifier")!).digest("base64url"), (rekam as any).auth.searchParams.get("code_challenge"));
});

test("accountIdFromIdToken: token rusak/kosong menghasilkan undefined, bukan melempar", () => {
  assert.equal(accountIdFromIdToken("bukan-jwt"), undefined);
  assert.equal(accountIdFromIdToken(undefined), undefined);
  assert.equal(accountIdFromIdToken("a.@@@.c"), undefined);
  assert.equal(accountIdFromIdToken(buatIdToken("z")), "z");
});

test("fromTokenResponse/needsRefresh", () => {
  assert.throws(() => fromTokenResponse({}), /tidak valid/);
  const t = fromTokenResponse({ access_token: "a", expires_in: 100 }, { access: "x", refresh: "R", expiresAt: 0, accountId: "id" });
  assert.equal(t.refresh, "R");
  assert.equal(t.accountId, "id");
  assert.ok(needsRefresh({ access: "a", expiresAt: Date.now() + 30_000 }));
  assert.ok(!needsRefresh({ access: "a", expiresAt: Date.now() + 600_000 }));
});

test("getAccessToken: token valid dipakai apa adanya; kedaluwarsa diperbarui dan disimpan", async () => {
  const store = new FileSecretStore(join(tmpDir(), "kredensial.json"));
  assert.equal(loadTokens(store, "claude"), undefined);
  await assert.rejects(getAccessToken(store, "claude"), /Belum login/);

  saveTokens(store, "claude", { access: "masih-baik", refresh: "r", expiresAt: Date.now() + 3_600_000 });
  const rekam = stubTokenEndpoint(() => ({ access_token: "baru", refresh_token: "r2", expires_in: 3600 }));
  assert.equal((await getAccessToken(store, "claude")).access, "masih-baik");
  assert.equal(rekam.length, 0, "tidak boleh refresh bila belum kedaluwarsa");

  saveTokens(store, "claude", { access: "basi", refresh: "r", expiresAt: Date.now() - 1000 });
  assert.equal((await getAccessToken(store, "claude")).access, "baru");
  assert.equal(JSON.parse(rekam[0]!.body).grant_type, "refresh_token");
  assert.equal(JSON.parse(rekam[0]!.body).refresh_token, "r");
  assert.equal(loadTokens(store, "claude")!.refresh, "r2", "refresh token baru tersimpan");

  saveTokens(store, "codex", { access: "basi", expiresAt: Date.now() - 1000 });
  await assert.rejects(getAccessToken(store, "codex"), /refresh token/);
});
