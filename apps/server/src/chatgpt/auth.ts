/**
 * Sign in with ChatGPT, open-source / local flavour:
 * https://developers.openai.com/siwc/token-sharing-open-source/sign-in
 *
 * Public OAuth client (PKCE, no secret) with dynamic registration: the first
 * sign-in uses client_id=dynamic_agent_client and the callback hands back an
 * issued client_id (oaiapp_...) that is reused for every later sign-in.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, redirectUri } from "../config.ts";

const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE_URL = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";

const HOST_FILE = path.join(config.dataDir, "chatgpt-host.json");
const CREDENTIALS_FILE = path.join(config.dataDir, "chatgpt-credentials.json");

interface HostState {
  /** Stable per-installation id sent as ext_agent_host_id. */
  hostId: string;
  /** Issued client of the last signed-in account, kept after sign-out for re-auth. */
  clientId: string | null;
  email: string | null;
}

export interface Credentials {
  clientId: string;
  email: string | null;
  name: string | null;
  subject: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scopes: string[];
}

export class NotConnectedError extends Error {
  constructor(message = "Not connected to ChatGPT. Sign in first.") {
    super(message);
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Atomic write with owner-only permissions, as the SIWC docs ask for. */
function writeJsonPrivate(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function hostState(): HostState {
  const existing = readJson<HostState>(HOST_FILE);
  if (existing?.hostId) return existing;
  const created: HostState = { hostId: `urn:uuid:${crypto.randomUUID()}`, clientId: null, email: null };
  writeJsonPrivate(HOST_FILE, created);
  return created;
}

export function loadCredentials(): Credentials | null {
  return readJson<Credentials>(CREDENTIALS_FILE);
}

function saveCredentials(creds: Credentials): void {
  writeJsonPrivate(CREDENTIALS_FILE, creds);
  writeJsonPrivate(HOST_FILE, { ...hostState(), clientId: creds.clientId, email: creds.email });
}

function clearCredentials(): void {
  fs.rmSync(CREDENTIALS_FILE, { force: true });
}

export function previousEmail(): string | null {
  return hostState().email;
}

// --- Authorization -----------------------------------------------------------

interface PendingAuth {
  verifier: string;
  nonce: string;
  /** Client id sent in the authorize request. */
  clientId: string;
  createdAt: number;
}

const pending = new Map<string, PendingAuth>();
const PENDING_TTL_MS = 10 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Builds the authorize URL. `fresh` registers a new client (e.g. another ChatGPT account). */
export function createAuthorizeUrl({ fresh = false }: { fresh?: boolean } = {}): string {
  const now = Date.now();
  for (const [key, p] of pending) if (now - p.createdAt > PENDING_TTL_MS) pending.delete(key);

  const host = hostState();
  const reuse = !fresh && host.clientId;
  const clientId = reuse ? host.clientId! : "dynamic_agent_client";
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  pending.set(state, { verifier, nonce, clientId, createdAt: now });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: challenge,
    ext_agent_host_id: host.hostId,
  });
  if (reuse) {
    if (host.email) params.set("login_hint", host.email);
  } else {
    params.set("agent_name_hint", config.appName);
  }
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
    const desc = typeof json.error_description === "string" ? json.error_description : "";
    throw new OAuthError(code, `Token request failed: ${code}${desc ? ` (${desc})` : ""}`);
  }
  return json as unknown as TokenResponse;
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function handleCallback(query: Record<string, string | undefined>): Promise<Credentials> {
  if (query.error) throw new OAuthError(query.error, `Sign-in was not completed: ${query.error_description ?? query.error}`);
  const state = query.state;
  const p = state ? pending.get(state) : undefined;
  if (!state || !p) throw new OAuthError("invalid_state", "Sign-in session expired or unknown. Please try again.");
  pending.delete(state);
  if (!query.code) throw new OAuthError("missing_code", "No authorization code returned.");

  // New registrations return the issued client id; re-auth keeps the one we sent.
  const clientId = query.client_id && query.client_id !== "dynamic_agent_client" ? query.client_id : p.clientId;
  if (clientId === "dynamic_agent_client") throw new OAuthError("missing_client_id", "No issued client id returned.");

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    code: query.code,
    code_verifier: p.verifier,
    redirect_uri: redirectUri,
    resource: RESOURCE,
  });
  if (!tokens.id_token || !tokens.refresh_token) {
    throw new OAuthError("incomplete_tokens", "Token response is missing id_token or refresh_token.");
  }

  const { payload } = await jwtVerify(tokens.id_token, JWKS, { issuer: ISSUER, audience: clientId });
  if (payload.nonce !== p.nonce) throw new OAuthError("invalid_nonce", "ID token nonce mismatch.");

  const creds: Credentials = {
    clientId,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : null,
    subject: String(payload.sub),
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scopes: (tokens.scope ?? query.scope ?? "").split(/[\s+]+/).filter(Boolean),
  };
  saveCredentials(creds);
  return creds;
}

// --- Tokens ------------------------------------------------------------------

const REFRESH_FAILURES = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

let refreshing: Promise<Credentials> | null = null;

/** Returns a valid access token, refreshing it first when close to expiry. */
export async function getAccessToken(): Promise<string> {
  const creds = loadCredentials();
  if (!creds) throw new NotConnectedError();
  if (creds.expiresAt - Date.now() > 60_000) return creds.accessToken;
  return (await refresh()).accessToken;
}

/** Refresh tokens rotate, so concurrent refreshes must be serialized. */
export function refresh(): Promise<Credentials> {
  refreshing ??= (async () => {
    const creds = loadCredentials();
    if (!creds) throw new NotConnectedError();
    try {
      const tokens = await tokenRequest({
        grant_type: "refresh_token",
        client_id: creds.clientId,
        refresh_token: creds.refreshToken,
      });
      const next: Credentials = {
        ...creds,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? creds.refreshToken,
        idToken: tokens.id_token ?? creds.idToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scopes: tokens.scope ? tokens.scope.split(/\s+/) : creds.scopes,
      };
      saveCredentials(next);
      return next;
    } catch (err) {
      if (err instanceof OAuthError && REFRESH_FAILURES.has(err.code)) {
        clearCredentials();
        throw new NotConnectedError("Your ChatGPT session expired. Please sign in again.");
      }
      throw err;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function signOut(): Promise<void> {
  const creds = loadCredentials();
  if (!creds) return;
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: creds.refreshToken, token_type_hint: "refresh_token", client_id: creds.clientId }),
    });
  } catch (err) {
    console.warn("Token revocation failed; removing local credentials anyway.", err);
  }
  clearCredentials();
}
