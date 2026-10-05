import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { INITIAL_TRANSACTIONS } from '../src/data/seed';
import { GoogleSheetsConfig, TelegramConfig, Transaction } from '../src/types';
import { getCurrentMonthKey } from '../src/utils/finance';

// Banco local em JSON. A pasta nunca e versionada: guarda o token do bot e a chave da conta
// de servico do Google em texto plano.
export const DATA_DIR = path.join(process.cwd(), 'data');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const TELEGRAM_FILE = path.join(DATA_DIR, 'telegram.json');
const SHEETS_FILE = path.join(DATA_DIR, 'sheets.json');
const LOGS_FILE = path.join(DATA_DIR, 'notif-logs.json');
export const SERVICE_ACCOUNT_FILE = path.join(DATA_DIR, 'google-service-account.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(file: string): T | null {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    }
  } catch (err) {
    console.error(`Error reading ${path.basename(file)}:`, err);
  }
  return null;
}

/**
 * Grava num arquivo temporario e renomeia: se o processo cair no meio da escrita, o JSON
 * anterior continua inteiro em vez de ficar truncado.
 */
export function writeJson(file: string, data: unknown, options: { secret?: boolean } = {}): boolean {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: options.secret ? 0o600 : 0o644 });
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error(`Error writing ${path.basename(file)}:`, err);
    return false;
  }
}

export function removeFile(file: string) {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    console.error(`Error removing ${path.basename(file)}:`, err);
  }
}

// Transacoes

let dataVersion: string | null = null;

function hashTransactions(list: Transaction[]): string {
  return crypto.createHash('sha1').update(JSON.stringify(list)).digest('hex').slice(0, 12);
}

/** Muda sempre que os lancamentos salvos mudam; o navegador compara para saber se recarrega. */
export function getDataVersion(): string {
  if (dataVersion === null) dataVersion = hashTransactions(loadTransactions());
  return dataVersion;
}

/**
 * Dados de exemplo trazidos para o mes corrente (mesmo dia), para a demonstracao mostrar
 * vencimentos proximos em vez de tudo "atrasado ha 150 dias".
 */
export function buildSampleTransactions(): Transaction[] {
  const [year, month] = getCurrentMonthKey().split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const shift = (iso: string | null | undefined) => {
    if (!iso) return iso ?? null;
    const day = Math.min(Number(iso.slice(8, 10)), lastDay);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  return INITIAL_TRANSACTIONS.map((t) => ({ ...t, dueDate: shift(t.dueDate) ?? '', paymentDate: shift(t.paymentDate) }));
}

export function loadTransactions(): Transaction[] {
  const stored = readJson<Transaction[]>(TRANSACTIONS_FILE);
  if (Array.isArray(stored)) return stored;

  // Primeira execucao (ou arquivo corrompido): parte dos dados de exemplo.
  const sample = buildSampleTransactions();
  saveTransactions(sample);
  return sample;
}

/** Salva e diz se o conteudo mudou de fato (sincronizacao sem mudanca nao reescreve o arquivo). */
export function saveTransactions(list: Transaction[]): boolean {
  const nextVersion = hashTransactions(list);
  if (nextVersion === dataVersion && fs.existsSync(TRANSACTIONS_FILE)) return false;
  if (writeJson(TRANSACTIONS_FILE, list)) dataVersion = nextVersion;
  return true;
}

// Telegram

export function loadTelegramConfig(): TelegramConfig {
  const loaded = readJson<Partial<TelegramConfig>>(TELEGRAM_FILE) ?? {};
  return {
    botToken: loaded.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: loaded.chatId || process.env.TELEGRAM_CHAT_ID || '',
    dailyTime: loaded.dailyTime || '09:00',
    enabled: typeof loaded.enabled === 'boolean' ? loaded.enabled : false,
  };
}

export function saveTelegramConfig(config: TelegramConfig) {
  writeJson(TELEGRAM_FILE, config, { secret: true });
}

// Log dos avisos diarios ja enviados, para nao repetir no mesmo dia

export function loadNotifLogs(): string[] {
  const logs = readJson<string[]>(LOGS_FILE);
  return Array.isArray(logs) ? logs : [];
}

export function addNotifLog(dateStr: string) {
  const logs = loadNotifLogs();
  if (logs.includes(dateStr)) return;
  logs.push(dateStr);
  // Os ultimos 30 dias bastam.
  writeJson(LOGS_FILE, logs.slice(-30));
}

// Google Sheets

export function loadSheetsConfig(): GoogleSheetsConfig | null {
  return readJson<GoogleSheetsConfig>(SHEETS_FILE);
}

export function saveSheetsConfig(config: GoogleSheetsConfig) {
  writeJson(SHEETS_FILE, config);
}

export function removeSheetsConfig() {
  removeFile(SHEETS_FILE);
}
