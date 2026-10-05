import { DashboardStats, Transaction } from '../types';

const WORK_EXPENSE_PATTERN =
  /\b(despesas?\s+de\s+obras?|obras?|reformas?|construcao|construcoes|material\s+de\s+construcao|mao\s+de\s+obra)\b/i;

export const APP_TIME_ZONE = 'America/Sao_Paulo';

// Planilha guarda data como numero de dias desde 30/12/1899. 25569 e o dia de 01/01/1970.
const SHEETS_EPOCH_OFFSET_DAYS = 25569;
const DAY_MS = 86400000;

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const negative = /^-|\((.*)\)/.test(raw);
  const withoutCurrency = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/^\((.*)\)$/, '$1');

  const lastComma = withoutCurrency.lastIndexOf(',');
  const lastDot = withoutCurrency.lastIndexOf('.');
  // "1.234" e "12.345.678" sem virgula sao milhar no formato brasileiro, nao decimal.
  const dotIsThousands = lastComma === -1 && /^-?\d{1,3}(\.\d{3})+$/.test(withoutCurrency);
  const decimalSeparator = lastComma > lastDot || dotIsThousands ? ',' : '.';

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
  const normalized = normalizeText(value);
  return /receit|entrada|ganho|renda/.test(normalized) ? 'Receitas' : 'Despesas';
}

const PAID_TOKENS = new Set([
  'pago', 'paga', 'pagos', 'pagas', 'sim', 's', 'yes', 'y', 'true', 'verdadeiro', '1', 'ok', 'x',
  'liquidado', 'liquidada', 'quitado', 'quitada', 'recebido', 'recebida', '✓', '✔', '✅',
]);

export function parsePaidStatus(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return PAID_TOKENS.has(normalizeText(value));
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasilia, independente do fuso do servidor. */
export function getTodayISO(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Mes corrente (YYYY-MM) no fuso de Brasilia. */
export function getCurrentMonthKey(): string {
  return getTodayISO().slice(0, 7);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "10" ou "dia 10" numa coluna de vencimento: dia 10 do mes corrente (conta recorrente). */
function dayOfCurrentMonth(day: number): string {
  const [year, month] = getCurrentMonthKey().split('-').map(Number);
  const clamped = Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

function isValidISODate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Converte o que vier da planilha para YYYY-MM-DD. Aceita ISO, DD/MM/AAAA, numero serial do
 * Sheets (leitura pela API) e dia do mes solto ("10", "dia 10"). Sem data reconhecivel,
 * devolve `fallback` — vazio por padrao, que significa "sem vencimento".
 */
export function parseDateToISO(value: unknown, fallback = ''): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && value >= 1 && value <= 31) return dayOfCurrentMonth(value);
    if (value >= 1000) {
      const date = new Date((Math.floor(value) - SHEETS_EPOCH_OFFSET_DAYS) * DAY_MS);
      return date.toISOString().slice(0, 10);
    }
    return fallback;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [year, month, day] = [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])];
    if (!isValidISODate(year, month, day)) return fallback;
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const brMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = brMatch[3].length === 2 ? 2000 + Number(brMatch[3]) : Number(brMatch[3]);
    if (!isValidISODate(year, month, day)) return fallback;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // DD/MM sem ano: ano corrente.
  const shortMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (shortMatch) {
    const year = Number(getCurrentMonthKey().slice(0, 4));
    const day = Number(shortMatch[1]);
    const month = Number(shortMatch[2]);
    if (!isValidISODate(year, month, day)) return fallback;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const dayMatch = normalizeText(raw).match(/^(?:dia\s*)?(\d{1,2})$/);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    return day >= 1 && day <= 31 ? dayOfCurrentMonth(day) : fallback;
  }

  // Ultimo recurso para textos como "May 5, 2026". Sem ano explicito o Date do JS inventa
  // um (ex.: "10/5" vira 2001), entao so tenta quando ha quatro digitos seguidos.
  const parsed = /\d{4}/.test(raw) ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return formatISODate(parsed);

  return fallback;
}

/** Exibicao DD/MM/AAAA; vazio quando o lancamento nao tem data. */
export function formatDateBR(value: string | null | undefined): string {
  const iso = parseDateToISO(value, '');
  if (!iso) return '';
  const parts = iso.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function dateDiffInDaysFromToday(isoDate: string): number | null {
  const parsed = parseDateToISO(isoDate, '');
  const parts = parsed.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const today = getTodayISO().split('-').map(Number);
  const start = Date.UTC(today[0], today[1] - 1, today[2]);
  const end = Date.UTC(parts[0], parts[1] - 1, parts[2]);

  return Math.round((end - start) / DAY_MS);
}

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** "2026-05" -> "Maio de 2026". */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Periodo do dashboard: `'todos'` ou um mes `YYYY-MM`. */
export type Period = 'todos' | string;

/** Meses (YYYY-MM) com lancamento, do mais recente para o mais antigo. */
export function listMonths(transactions: Pick<Transaction, 'dueDate'>[]): string[] {
  const months = new Set<string>();
  transactions.forEach((t) => {
    if (/^\d{4}-\d{2}/.test(t.dueDate)) months.add(t.dueDate.slice(0, 7));
  });
  return Array.from(months).sort().reverse();
}

/**
 * Lancamento sem vencimento conta em todos os meses: costuma ser uma expectativa mensal
 * (aluguel, salario) que a planilha nao amarra a uma data.
 */
export function filterByPeriod<T extends Pick<Transaction, 'dueDate'>>(transactions: T[], period: Period): T[] {
  if (period === 'todos') return transactions;
  return transactions.filter((t) => !t.dueDate || t.dueDate.startsWith(period));
}

/** Mes corrente quando ha lancamento datado nele; senao, todos (a planilha pode ser de outro mes). */
export function defaultPeriod(transactions: Pick<Transaction, 'dueDate'>[]): Period {
  const current = getCurrentMonthKey();
  return listMonths(transactions).includes(current) ? current : 'todos';
}

export function computeStats(transactions: Transaction[]): DashboardStats {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalPaid = 0;
  let totalPending = 0;

  transactions.forEach((t) => {
    if (t.costCenter === 'Receitas') {
      totalIncome += t.amount;
    } else {
      totalExpense += t.amount;
      if (t.paid) totalPaid += t.amount;
      else totalPending += t.amount;
    }
  });

  return {
    totalIncome,
    totalExpense,
    totalPaid,
    totalPending,
    netBalance: totalIncome - totalExpense,
  };
}

export interface UpcomingDue<T> {
  item: T;
  daysUntilDue: number;
}

/** Despesas em aberto vencidas ou que vencem nos proximos `days` dias, da mais urgente a menos. */
export function getUpcomingDue<T extends Transaction>(transactions: T[], days = 7): UpcomingDue<T>[] {
  const result: UpcomingDue<T>[] = [];
  transactions.forEach((item) => {
    if (item.costCenter !== 'Despesas' || item.paid) return;
    const diff = dateDiffInDaysFromToday(item.dueDate);
    if (diff !== null && diff <= days) result.push({ item, daysUntilDue: diff });
  });
  return result.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function describeDueIn(daysUntilDue: number): string {
  if (daysUntilDue < -1) return `Atrasada há ${-daysUntilDue} dias`;
  if (daysUntilDue === -1) return 'Atrasada desde ontem';
  if (daysUntilDue === 0) return 'Vence hoje';
  if (daysUntilDue === 1) return 'Vence amanhã';
  return `Vence em ${daysUntilDue} dias`;
}

/** "agora", "há 5 min", "há 2 h" ou a data, para o status de sincronizacao. */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 'nunca';
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(time).toLocaleString('pt-BR', { timeZone: APP_TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
}
