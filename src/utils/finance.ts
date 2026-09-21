import { Transaction } from '../types';

const WORK_EXPENSE_PATTERN =
  /\b(despesas?\s+de\s+obras?|obras?|reformas?|construcao|construcoes|material\s+de\s+construcao|mao\s+de\s+obra)\b/i;

export function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isWorkExpense(input: Pick<Transaction, 'launch' | 'category' | 'costCenter'>): boolean {
  const haystack = [
    normalizeText(input.launch),
    normalizeText(input.category),
    normalizeText(input.costCenter),
  ].join(' ');

  return WORK_EXPENSE_PATTERN.test(haystack);
}

export function filterPersonalTransactions<T extends Pick<Transaction, 'launch' | 'category' | 'costCenter'>>(
  transactions: T[],
): T[] {
  return transactions.filter((transaction) => !isWorkExpense(transaction));
}

export function parseCurrencyBR(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value || '').trim();
  if (!raw) return 0;

  const negative = /^-|\((.*)\)/.test(raw);
  const withoutCurrency = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/^\((.*)\)$/, '$1');

  const lastComma = withoutCurrency.lastIndexOf(',');
  const lastDot = withoutCurrency.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : '.';

  let normalized = withoutCurrency;
  if (decimalSeparator === ',') {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

export function normalizeCostCenter(value: unknown): 'Despesas' | 'Receitas' {
  return normalizeText(value).includes('receit') ? 'Receitas' : 'Despesas';
}

export function parsePaidStatus(value: unknown): boolean {
  const normalized = normalizeText(value);
  return ['pago', 'paga', 'sim', 's', 'true', '1', 'ok', 'liquidado', 'liquidada'].includes(normalized);
}

export function getTodayISO(): string {
  const now = new Date();
  const saoPauloDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return formatISODate(saoPauloDate);
}

export function parseDateToISO(value: unknown, fallback = getTodayISO()): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;

  const brMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatISODate(parsed);

  return fallback;
}

export function formatDateBR(value: string): string {
  const iso = parseDateToISO(value, value);
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

export function dateDiffInDaysFromToday(isoDate: string): number | null {
  const parsed = parseDateToISO(isoDate, '');
  const parts = parsed.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const today = parseDateToISO(getTodayISO()).split('-').map(Number);
  const start = Date.UTC(today[0], today[1] - 1, today[2]);
  const end = Date.UTC(parts[0], parts[1] - 1, parts[2]);

  return Math.round((end - start) / 86400000);
}

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
