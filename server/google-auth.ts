import crypto from 'crypto';
import fs from 'fs';
import { ServiceAccountStatus } from '../src/types';
import { SERVICE_ACCOUNT_FILE, readJson, removeFile, writeJson } from './storage';

// Endereco fixo: o `token_uri` do JSON da chave e ignorado de proposito, para o servidor nunca
// enviar uma assinatura para um host vindo de dado colado pelo usuario.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
}

interface LoadedServiceAccount {
  credentials: ServiceAccountCredentials;
  source: 'arquivo' | 'env';
}

/** Valida o JSON da chave da conta de servico (o arquivo baixado no Google Cloud). */
export function parseServiceAccount(raw: unknown): ServiceAccountCredentials {
  let data: any = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('O conteudo colado nao e um JSON valido. Cole o arquivo .json da chave inteiro.');
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Chave invalida. Cole o arquivo .json da chave da conta de servico.');
  }
  if (data.type !== 'service_account') {
    throw new Error('Esse JSON nao e de uma conta de servico ("type" deveria ser "service_account").');
  }
  if (typeof data.client_email !== 'string' || typeof data.private_key !== 'string') {
    throw new Error('O JSON nao tem "client_email" e "private_key". Gere uma nova chave do tipo JSON.');
  }

  try {
    crypto.createPrivateKey(data.private_key);
  } catch {
    throw new Error('A "private_key" do JSON nao e uma chave valida. Gere uma nova chave do tipo JSON.');
  }

  return {
    client_email: data.client_email,
    private_key: data.private_key,
    private_key_id: typeof data.private_key_id === 'string' ? data.private_key_id : undefined,
    project_id: typeof data.project_id === 'string' ? data.project_id : undefined,
  };
}

/** Chave salva pela interface tem prioridade; senao, o arquivo apontado por GOOGLE_APPLICATION_CREDENTIALS. */
export function loadServiceAccount(): LoadedServiceAccount | null {
  const stored = readJson<ServiceAccountCredentials>(SERVICE_ACCOUNT_FILE);
  if (stored?.client_email && stored.private_key) {
    return { credentials: stored, source: 'arquivo' };
  }

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    try {
      const parsed = parseServiceAccount(fs.readFileSync(envPath, 'utf-8'));
      return { credentials: parsed, source: 'env' };
    } catch (err) {
      console.error('GOOGLE_APPLICATION_CREDENTIALS ignorado:', err instanceof Error ? err.message : err);
    }
  }

  return null;
}

export function saveServiceAccount(credentials: ServiceAccountCredentials) {
  writeJson(SERVICE_ACCOUNT_FILE, { type: 'service_account', ...credentials }, { secret: true });
  cachedToken = null;
}

export function removeServiceAccount() {
  removeFile(SERVICE_ACCOUNT_FILE);
  cachedToken = null;
}

/** O que a interface pode ver: nunca a chave privada. */
export function getServiceAccountStatus(): ServiceAccountStatus {
  const loaded = loadServiceAccount();
  return {
    configured: !!loaded,
    clientEmail: loaded?.credentials.client_email ?? null,
    projectId: loaded?.credentials.project_id ?? null,
    source: loaded?.source ?? null,
  };
}

let cachedToken: { email: string; token: string; expiresAt: number } | null = null;

/**
 * Token OAuth da conta de servico pelo fluxo JWT bearer (RFC 7523), assinado com a chave
 * privada via `crypto` do Node — sem dependencia do googleapis. O token vale 1h e fica em
 * memoria ate faltar 1 minuto para expirar.
 */
export async function getAccessToken(credentials?: ServiceAccountCredentials): Promise<string> {
  const creds = credentials ?? loadServiceAccount()?.credentials;
  if (!creds) throw new Error('Conta de servico do Google nao configurada.');

  const nowMs = Date.now();
  if (!credentials && cachedToken && cachedToken.email === creds.client_email && cachedToken.expiresAt - 60000 > nowMs) {
    return cachedToken.token;
  }

  const now = Math.floor(nowMs / 1000);
  const header = { alg: 'RS256', typ: 'JWT', ...(creds.private_key_id ? { kid: creds.private_key_id } : {}) };
  const claims = { iss: creds.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(creds.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Nao foi possivel falar com o Google para autenticar. Verifique a conexao.');
  }

  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    throw new Error(
      `O Google recusou a chave da conta de servico (${detail}). Se a chave foi apagada ou desativada no Google Cloud, gere outra.`,
    );
  }

  const token = String(body.access_token);
  if (!credentials) {
    cachedToken = { email: creds.client_email, token, expiresAt: nowMs + Number(body.expires_in || 3600) * 1000 };
  }
  return token;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}
