import {
  GoogleSheetsConfig,
  SheetField,
  SheetsMode,
  SheetsStatus,
  SheetTab,
  SheetTabStatus,
  Transaction,
  TransactionSource,
} from '../src/types';
import { filterPersonalTransactions, normalizeText } from '../src/utils/finance';
import {
  ParsedSheet,
  SHEET_FIELD_LABELS,
  SHEET_FIELDS,
  buildCsvExportUrl,
  buildEditUrl,
  columnLetter,
  extractSheetGid,
  extractSpreadsheetId,
  parseDelimitedText,
  parseSpreadsheetRows,
} from '../src/utils/spreadsheet';
import { loadServiceAccount } from './google-auth';
import {
  SheetsApiError,
  SpreadsheetMeta,
  batchGetValues,
  batchUpdate,
  getSpreadsheetMeta,
  parseRangeStart,
  quoteSheetTitle,
  updateValues,
} from './sheets-api';
import { loadSheetsConfig, loadTransactions, removeSheetsConfig, saveSheetsConfig, saveTransactions } from './storage';

export const DEFAULT_AUTO_SYNC_MINUTES = 5;
export const AUTO_SYNC_OPTIONS = [0, 1, 5, 15, 30, 60];

const READ_ONLY_MESSAGE =
  'A planilha esta conectada pelo link publico, que e somente leitura: edite direto na planilha e o app atualiza sozinho. Para editar pelo app, configure a conta de servico na aba Planilha.';

export class SheetsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** O que foi lido de uma aba, mais o necessario para escrever nela depois. */
interface TabState extends SheetTabStatus {
  columnOffset: number; // coluna (0-based) em que comeca o intervalo lido
  headerWidth: number; // colunas ocupadas no cabecalho, para achar a primeira livre
  lastDataRow: number; // ultima linha lida como lancamento (0 = nenhuma)
  filledRows: Set<number>; // linhas com qualquer conteudo, inclusive as que nao viram lancamento
  gridRows: number;
  gridColumns: number;
  paidValues: ParsedSheet['paidValues'];
}

interface TabRead {
  sheetId: number | null;
  title: string | null;
  rows: unknown[][];
  rowOffset: number;
  columnOffset: number;
  gridRows: number;
  gridColumns: number;
}

export interface SyncResult {
  skipped: boolean;
  changed: boolean;
  count: number;
  filteredOut: number;
}

const state = {
  syncing: false,
  lastAttemptAt: null as string | null,
  lastError: null as string | null,
  warning: null as string | null,
  // Modo efetivo da ultima leitura: com conta de servico configurada mas sem acesso a planilha,
  // a leitura cai para o link publico e o app fica somente leitura ate o compartilhamento.
  effectiveMode: null as SheetsMode | null,
  filteredOut: 0,
  title: null as string | null,
  tabs: [] as TabState[],
  availableTabs: [] as SheetTab[],
};

function resetState() {
  state.lastAttemptAt = null;
  state.lastError = null;
  state.warning = null;
  state.effectiveMode = null;
  state.filteredOut = 0;
  state.title = null;
  state.tabs = [];
  state.availableTabs = [];
}

// Leituras e escritas na planilha passam por uma fila: uma escrita nunca se cruza com uma
// sincronizacao que esteja reescrevendo os numeros de linha.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function configuredMode(): SheetsMode {
  return loadServiceAccount() ? 'api' : 'csv';
}

function currentMode(): SheetsMode {
  return state.effectiveMode ?? configuredMode();
}

export function isSheetConnected(): boolean {
  return loadSheetsConfig() !== null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Leitura

async function readViaCsv(config: GoogleSheetsConfig): Promise<TabRead[]> {
  // A URL buscada e sempre montada a partir do id ja validado, e nunca a string
  // que veio do cliente: isso impede que a rota vire um proxy para qualquer host.
  const csvUrl = buildCsvExportUrl(config.spreadsheetId, config.gid);

  let response: Response;
  try {
    response = await fetch(csvUrl, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    console.error('Error fetching spreadsheet:', err);
    throw new SheetsError('Nao foi possivel baixar a planilha. Verifique a conexao e a URL.', 502);
  }

  if (!response.ok) {
    throw new SheetsError(
      `O Google respondeu ${response.status}. Confirme que a planilha esta compartilhada como "Qualquer pessoa com o link" (Leitor).`,
      502,
    );
  }

  const csv = await response.text();
  // Planilha sem acesso publico devolve a pagina de login (HTML), com status 200.
  if (csv.trimStart().startsWith('<')) {
    throw new SheetsError(
      'A planilha nao esta publica. No Google Sheets, use Compartilhar > "Qualquer pessoa com o link" como Leitor — ou configure a conta de servico para ler uma planilha privada.',
      502,
    );
  }

  return [
    {
      sheetId: config.gid !== null ? Number(config.gid) : null,
      title: null,
      rows: parseDelimitedText(csv),
      rowOffset: 0,
      columnOffset: 0,
      gridRows: 0,
      gridColumns: 0,
    },
  ];
}

function selectTabs(config: GoogleSheetsConfig, tabs: SpreadsheetMeta['tabs']): SpreadsheetMeta['tabs'] {
  if (config.tabs?.length) {
    const chosen = tabs.filter((tab) => config.tabs!.includes(tab.sheetId));
    if (chosen.length) return chosen;
  }
  if (config.gid !== null) {
    const fromUrl = tabs.find((tab) => String(tab.sheetId) === config.gid);
    if (fromUrl) return [fromUrl];
  }
  const first = tabs.find((tab) => !tab.hidden) ?? tabs[0];
  if (!first) throw new SheetsError('A planilha nao tem nenhuma aba com celulas.', 422);
  return [first];
}

async function readViaApi(config: GoogleSheetsConfig): Promise<TabRead[]> {
  const meta = await getSpreadsheetMeta(config.spreadsheetId);
  state.title = meta.title;
  state.availableTabs = meta.tabs.map(({ sheetId, title, index, hidden }) => ({ sheetId, title, index, hidden }));

  const selected = selectTabs(config, meta.tabs);
  // Uma chamada so para todas as abas escolhidas (ex.: uma aba por mes).
  const values = await batchGetValues(
    config.spreadsheetId,
    selected.map((tab) => quoteSheetTitle(tab.title)),
  );

  return selected.map((tab, i) => {
    const range = values[i] ?? { range: '', values: [] };
    const start = parseRangeStart(range.range);
    return {
      sheetId: tab.sheetId,
      title: tab.title,
      rows: range.values,
      rowOffset: start.row,
      columnOffset: start.column,
      gridRows: tab.rowCount,
      gridColumns: tab.columnCount,
    };
  });
}

/** Le a planilha conforme o modo; se a conta de servico nao tiver acesso, tenta o link publico. */
async function readSheet(config: GoogleSheetsConfig): Promise<TabRead[]> {
  if (configuredMode() === 'csv') {
    state.effectiveMode = 'csv';
    state.warning = null;
    return readViaCsv(config);
  }

  try {
    const reads = await readViaApi(config);
    state.effectiveMode = 'api';
    state.warning = null;
    return reads;
  } catch (err) {
    // Chave revogada, API desativada, planilha nao compartilhada com a conta de servico: se a
    // planilha for publica, o dashboard continua atualizado pelo link, so que sem escrita.
    let apiMessage = errorMessage(err);
    if (err instanceof SheetsApiError && err.status === 403 && !/desativada/.test(err.message)) {
      const email = loadServiceAccount()?.credentials.client_email ?? 'a conta de servico';
      apiMessage = `A conta de servico nao tem acesso a esta planilha. No Google Sheets, use Compartilhar e adicione ${email} como Editor.`;
    }
    try {
      const reads = await readViaCsv(config);
      state.effectiveMode = 'csv';
      state.warning = `Lendo pelo link publico (somente leitura). ${apiMessage}`;
      return reads;
    } catch {
      throw new SheetsError(apiMessage, err instanceof SheetsApiError && err.status ? err.status : 502);
    }
  }
}

function buildTabState(read: TabRead, parsed: ParsedSheet, personalCount: number): TabState {
  const filledRows = new Set<number>();
  read.rows.forEach((row, i) => {
    if (row?.some((cell) => cell !== '' && cell !== null && cell !== undefined)) filledRows.add(read.rowOffset + i + 1);
  });
  const headerCells = parsed.headerRow !== null ? read.rows[parsed.headerRow - 1] ?? [] : [];

  return {
    sheetId: read.sheetId,
    title: read.title,
    headerRow: parsed.headerRow !== null ? parsed.headerRow + read.rowOffset : null,
    columns: parsed.columns,
    rowCount: personalCount,
    columnOffset: read.columnOffset,
    headerWidth: headerCells.length,
    lastDataRow: parsed.rows.length ? Math.max(...parsed.rows.map((r) => r.sourceRow)) + read.rowOffset : 0,
    filledRows,
    gridRows: read.gridRows,
    gridColumns: read.gridColumns,
    paidValues: parsed.paidValues,
  };
}

async function doSync(): Promise<SyncResult> {
  const config = loadSheetsConfig();
  if (!config) throw new SheetsError('Nenhuma planilha conectada. Informe a URL da planilha primeiro.', 400);

  state.syncing = true;
  state.lastAttemptAt = new Date().toISOString();

  try {
    const reads = await readSheet(config);
    const transactions: Transaction[] = [];
    const tabs: TabState[] = [];
    let total = 0;
    let hasHeader = false;

    reads.forEach((read) => {
      const parsed = parseSpreadsheetRows(read.rows);
      const personal = filterPersonalTransactions(parsed.rows);
      total += parsed.rows.length;
      hasHeader = hasHeader || parsed.headerRow !== null;

      personal.forEach(({ sourceRow, ...row }) => {
        const sheetRow = sourceRow + read.rowOffset;
        const source: TransactionSource = { sheetId: read.sheetId, tab: read.title, row: sheetRow };
        // Id deterministico: a mesma linha mantem o mesmo id entre sincronizacoes.
        transactions.push({ ...row, id: `sheet-${read.sheetId ?? 'p'}-${sheetRow}`, source });
      });
      tabs.push(buildTabState(read, parsed, personal.length));
    });

    // Sem cabecalho e sem linhas, a leitura provavelmente esta errada (aba trocada, export
    // vazio): melhor manter os dados atuais. Com cabecalho, planilha vazia e legitima.
    if (transactions.length === 0 && !hasHeader) {
      throw new SheetsError(
        'Nenhuma linha valida encontrada na planilha. Confira se as colunas seguem a ordem sugerida (Lançamento, Centro de custo, Segmento, Expectativa, Pago, Vencimento, Pagamento).',
        422,
      );
    }

    // A planilha pode ter sido desconectada (ou trocada) enquanto a leitura acontecia.
    const latest = loadSheetsConfig();
    if (!latest || latest.spreadsheetId !== config.spreadsheetId) {
      throw new SheetsError('A planilha conectada mudou durante a sincronizacao.', 409);
    }

    const changed = saveTransactions(transactions);
    saveSheetsConfig({ ...latest, lastSyncAt: new Date().toISOString(), lastSyncCount: transactions.length });

    state.tabs = tabs;
    state.filteredOut = total - transactions.length;
    state.lastError = null;

    return { skipped: false, changed, count: transactions.length, filteredOut: state.filteredOut };
  } catch (err) {
    state.lastError = errorMessage(err);
    throw err;
  } finally {
    state.syncing = false;
  }
}

let inflight: Promise<SyncResult> | null = null;

/**
 * Le a planilha e substitui os lancamentos salvos: a planilha e a fonte da verdade.
 * `maxAgeSeconds` evita reler se a ultima leitura bem-sucedida for recente (abrir o app varias
 * vezes seguidas nao gasta cota).
 */
export function syncNow(options: { maxAgeSeconds?: number } = {}): Promise<SyncResult> {
  const config = loadSheetsConfig();
  if (!config) return Promise.reject(new SheetsError('Nenhuma planilha conectada. Informe a URL da planilha primeiro.', 400));

  const lastSync = config.lastSyncAt ? Date.parse(config.lastSyncAt) : 0;
  if (
    options.maxAgeSeconds &&
    !state.lastError &&
    state.tabs.length > 0 &&
    Date.now() - lastSync < options.maxAgeSeconds * 1000
  ) {
    return Promise.resolve({ skipped: true, changed: false, count: config.lastSyncCount, filteredOut: state.filteredOut });
  }

  if (!inflight) {
    inflight = withLock(doSync).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Para o agendador: hora de sincronizar de novo? Conta a partir da ultima tentativa, nao do ultimo sucesso. */
export function isAutoSyncDue(now = Date.now()): boolean {
  const config = loadSheetsConfig();
  if (!config) return false;
  const minutes = config.autoSyncMinutes ?? DEFAULT_AUTO_SYNC_MINUTES;
  if (minutes <= 0 || state.syncing) return false;
  const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  return now - last >= minutes * 60000;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Releitura logo depois de uma escrita, para confirmar o que o Sheets gravou (formulas, formatos). */
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    syncNow().catch((err) => console.error('Sheets refresh after write failed:', errorMessage(err)));
  }, 3000);
}

// Configuracao

export function getSheetsStatus(): SheetsStatus {
  const config = loadSheetsConfig();
  if (!config) {
    return {
      connected: false,
      mode: null,
      spreadsheetId: null,
      title: null,
      sheetUrl: null,
      editUrl: null,
      writable: false,
      autoSyncMinutes: DEFAULT_AUTO_SYNC_MINUTES,
      lastSyncAt: null,
      lastSyncCount: 0,
      lastAttemptAt: null,
      lastError: null,
      warning: null,
      syncing: false,
      filteredOut: 0,
      tabs: [],
      availableTabs: [],
      selectedTabs: [],
    };
  }

  const mode = currentMode();
  return {
    connected: true,
    mode,
    spreadsheetId: config.spreadsheetId,
    title: state.title,
    sheetUrl: config.sheetUrl,
    editUrl: buildEditUrl(config.spreadsheetId, state.tabs[0]?.sheetId ?? config.gid),
    writable: mode === 'api',
    autoSyncMinutes: config.autoSyncMinutes ?? DEFAULT_AUTO_SYNC_MINUTES,
    lastSyncAt: config.lastSyncAt,
    lastSyncCount: config.lastSyncCount,
    lastAttemptAt: state.lastAttemptAt,
    lastError: state.lastError,
    warning: state.warning,
    syncing: state.syncing,
    filteredOut: state.filteredOut,
    tabs: state.tabs.map(({ sheetId, title, headerRow, columns, rowCount }) => ({ sheetId, title, headerRow, columns, rowCount })),
    availableTabs: state.availableTabs,
    selectedTabs: config.tabs ?? [],
  };
}

/** Conecta (ou troca) a planilha e ja faz a primeira leitura. Erro de leitura nao desfaz a conexao. */
export async function connectSheet(sheetUrl: string): Promise<{ error: string | null }> {
  const url = sheetUrl.trim();
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    throw new SheetsError(
      'URL invalida. Cole o endereco completo da planilha, no formato https://docs.google.com/spreadsheets/d/...',
    );
  }

  const gid = extractSheetGid(url);
  const existing = loadSheetsConfig();
  const sameSheet = existing?.spreadsheetId === spreadsheetId;

  if (!sameSheet) resetState();
  saveSheetsConfig({
    sheetUrl: url,
    spreadsheetId,
    gid,
    // Trocar a aba pela URL volta a ler so a aba da URL.
    tabs: sameSheet && existing?.gid === gid ? existing?.tabs ?? [] : [],
    autoSyncMinutes: existing?.autoSyncMinutes ?? DEFAULT_AUTO_SYNC_MINUTES,
    // Trocar de planilha invalida o historico de sincronizacao anterior.
    lastSyncAt: sameSheet ? existing!.lastSyncAt : null,
    lastSyncCount: sameSheet ? existing!.lastSyncCount : 0,
  });

  try {
    await syncNow();
    return { error: null };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function updateSheetSettings(input: { tabs?: unknown; autoSyncMinutes?: unknown }): Promise<{ error: string | null }> {
  const config = loadSheetsConfig();
  if (!config) throw new SheetsError('Nenhuma planilha conectada.', 400);

  const next: GoogleSheetsConfig = { ...config };
  let tabsChanged = false;

  if (input.autoSyncMinutes !== undefined) {
    const minutes = Number(input.autoSyncMinutes);
    if (!AUTO_SYNC_OPTIONS.includes(minutes)) throw new SheetsError('Intervalo de sincronizacao invalido.');
    next.autoSyncMinutes = minutes;
  }

  if (input.tabs !== undefined) {
    if (!Array.isArray(input.tabs) || input.tabs.some((id) => !Number.isInteger(id))) {
      throw new SheetsError('Lista de abas invalida.');
    }
    next.tabs = Array.from(new Set(input.tabs as number[]));
    tabsChanged = JSON.stringify(next.tabs) !== JSON.stringify(config.tabs ?? []);
  }

  saveSheetsConfig(next);
  if (!tabsChanged) return { error: null };

  try {
    await syncNow();
    return { error: null };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export function disconnectSheet() {
  removeSheetsConfig();
  resetState();
}

/** Conta de servico adicionada ou removida: o modo e decidido de novo na proxima leitura. */
export function onCredentialsChanged() {
  state.effectiveMode = null;
  state.warning = null;
}

// Escrita na planilha (modo API)

/**
 * Antes de qualquer escrita: com planilha conectada so o modo API pode alterar lancamentos;
 * no link publico, a proxima sincronizacao apagaria a alteracao local.
 */
function assertWritable(): GoogleSheetsConfig {
  const config = loadSheetsConfig();
  if (!config) throw new SheetsError('Nenhuma planilha conectada.', 400);
  if (currentMode() !== 'api') throw new SheetsError(state.warning ?? READ_ONLY_MESSAGE, 409);
  return config;
}

async function ensureTabs() {
  if (state.tabs.length === 0 || state.effectiveMode !== 'api') await doSync();
  if (state.effectiveMode !== 'api') throw new SheetsError(state.warning ?? READ_ONLY_MESSAGE, 409);
}

function tabFor(source: TransactionSource | null | undefined): TabState & { title: string; sheetId: number } {
  const tab = source ? state.tabs.find((t) => t.sheetId === source.sheetId) : undefined;
  if (!tab || tab.title === null || tab.sheetId === null) {
    throw new SheetsError('Esse lancamento nao pertence as abas lidas agora. Sincronize e tente de novo.', 409);
  }
  return tab as TabState & { title: string; sheetId: number };
}

function cellRef(tab: TabState & { title: string }, column: number, row: number): string {
  return `${quoteSheetTitle(tab.title)}!${columnLetter(tab.columnOffset + column)}${row}`;
}

/** Texto comecando com "=", "+", "-" ou "@" viraria formula no USER_ENTERED; o apostrofo o mantem texto. */
function textCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function cellValue(field: SheetField, item: Partial<Transaction>, tab: TabState): unknown {
  switch (field) {
    case 'launch':
    case 'category':
      return textCell(String(item[field] ?? ''));
    case 'costCenter':
      return item.costCenter === 'Receitas' ? 'Receitas' : 'Despesas';
    case 'amount':
      return Number(item.amount) || 0;
    case 'paid':
      return item.paid ? tab.paidValues.paid : tab.paidValues.unpaid;
    case 'dueDate':
      // ISO e entendido como data pelo Sheets em qualquer locale; o formato da coluna decide a exibicao.
      return item.dueDate || '';
    case 'paymentDate':
      return item.paymentDate || '';
  }
}

function sameValue(field: SheetField, a: Partial<Transaction>, b: Partial<Transaction>): boolean {
  if (field === 'amount') return Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)) < 0.005;
  return (a[field] ?? '') === (b[field] ?? '');
}

/** Confere que a linha ainda e a mesma: se alguem inseriu ou apagou linhas, nao escreve na errada. */
async function verifyRow(config: GoogleSheetsConfig, tab: TabState & { title: string }, item: Transaction) {
  const row = item.source!.row;
  if (tab.columns.launch < 0) throw new SheetsError('A aba nao tem coluna de lancamento.', 422);
  const [range] = await batchGetValues(config.spreadsheetId, [cellRef(tab, tab.columns.launch, row)]);
  const current = String(range?.values?.[0]?.[0] ?? '').trim();
  if (normalizeText(current) !== normalizeText(item.launch)) {
    await doSync().catch(() => undefined);
    throw new SheetsError(
      `A planilha mudou desde a ultima leitura (a linha ${row} agora e "${current || 'vazia'}"). Os dados foram recarregados; confira e tente de novo.`,
      409,
    );
  }
}

function missingColumnsError(tab: TabState & { title: string }, fields: SheetField[]): SheetsError {
  const labels = fields.map((f) => `"${SHEET_FIELD_LABELS[f]}"`).join(', ');
  return new SheetsError(
    `A aba "${tab.title}" nao tem a(s) coluna(s) ${labels}. Use "Adicionar colunas que faltam" na aba Planilha.`,
    422,
  );
}

/** Grava na planilha so as celulas que mudaram. Devolve o lancamento como ficou. */
export function updateTransactionInSheet(current: Transaction, next: Transaction): Promise<Transaction> {
  return withLock(async () => {
    const config = assertWritable();
    await ensureTabs();
    const tab = tabFor(current.source);
    await verifyRow(config, tab, current);

    const changed = SHEET_FIELDS.filter((field) => !sameValue(field, current, next));
    if (changed.length === 0) return current;

    // Sem coluna de data de pagamento, marcar como pago ainda funciona; o resto precisa da coluna.
    const missing = changed.filter((field) => tab.columns[field] < 0 && field !== 'paymentDate');
    if (missing.length) throw missingColumnsError(tab, missing);

    const row = current.source!.row;
    await updateValues(
      config.spreadsheetId,
      changed
        .filter((field) => tab.columns[field] >= 0)
        .map((field) => ({ range: cellRef(tab, tab.columns[field], row), values: [[cellValue(field, next, tab)]] })),
    );

    const updated: Transaction = { ...next, id: current.id, source: current.source };
    saveTransactions(loadTransactions().map((t) => (t.id === current.id ? updated : t)));
    scheduleRefresh();
    return updated;
  });
}

/**
 * Inclui o lancamento logo abaixo do ultimo lido na primeira aba escolhida. Se ali ja houver
 * algo (uma linha de total, por exemplo), insere uma linha nova em vez de sobrescrever.
 */
export function appendTransactionToSheet(item: Omit<Transaction, 'id'>): Promise<Transaction | null> {
  return withLock(async () => {
    const config = assertWritable();
    await doSync();
    if (state.effectiveMode !== 'api') throw new SheetsError(state.warning ?? READ_ONLY_MESSAGE, 409);
    const tab = tabFor({ sheetId: state.tabs[0]?.sheetId ?? null, tab: null, row: 0 });

    const required = (['launch', 'amount'] as SheetField[]).filter((field) => tab.columns[field] < 0);
    if (required.length) throw missingColumnsError(tab, required);

    const width = Math.max(...SHEET_FIELDS.map((field) => tab.columns[field])) + 1;
    // null deixa a celula como esta (colunas que o app nao conhece, formulas da pessoa).
    const values: unknown[] = new Array(width).fill(null);
    SHEET_FIELDS.forEach((field) => {
      if (tab.columns[field] >= 0) values[tab.columns[field]] = cellValue(field, item, tab);
    });

    const targetRow = tab.lastDataRow > 0 ? tab.lastDataRow + 1 : (tab.headerRow ?? 0) + 1;
    if (tab.filledRows.has(targetRow)) {
      await batchUpdate(config.spreadsheetId, [
        {
          insertDimension: {
            range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: targetRow - 1, endIndex: targetRow },
            inheritFromBefore: targetRow > 1,
          },
        },
      ]);
    } else if (targetRow > tab.gridRows) {
      await batchUpdate(config.spreadsheetId, [
        { appendDimension: { sheetId: tab.sheetId, dimension: 'ROWS', length: targetRow - tab.gridRows } },
      ]);
    }

    await updateValues(config.spreadsheetId, [{ range: cellRef(tab, 0, targetRow), values: [values] }]);
    await doSync();
    return loadTransactions().find((t) => t.source?.sheetId === tab.sheetId && t.source.row === targetRow) ?? null;
  });
}

export function deleteTransactionInSheet(item: Transaction): Promise<void> {
  return withLock(async () => {
    const config = assertWritable();
    await ensureTabs();
    const tab = tabFor(item.source);
    await verifyRow(config, tab, item);
    const row = item.source!.row;
    await batchUpdate(config.spreadsheetId, [
      { deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } },
    ]);
    // Apagar desloca as linhas de baixo: os ids mudam, entao tudo e relido.
    await doSync();
  });
}

const CURRENCY_FORMAT = { type: 'CURRENCY', pattern: '"R$" #,##0.00' };
const DATE_FORMAT = { type: 'DATE', pattern: 'dd/mm/yyyy' };

/**
 * Prepara a planilha: cria as colunas que faltam no cabecalho (ou o cabecalho inteiro, numa aba
 * sem um) e formata as colunas novas — checkbox em "Pago", data e moeda nas demais.
 */
export function addMissingColumns(): Promise<string[]> {
  return withLock(async () => {
    const config = assertWritable();
    await doSync();
    if (state.effectiveMode !== 'api') throw new SheetsError(state.warning ?? READ_ONLY_MESSAGE, 409);

    const structural: unknown[] = [];
    const headers: { range: string; values: unknown[][] }[] = [];
    const formatting: unknown[] = [];
    const added: string[] = [];

    state.tabs.forEach((raw) => {
      if (raw.title === null || raw.sheetId === null) return;
      const tab = raw as TabState & { title: string; sheetId: number };

      if (tab.headerRow === null) {
        // Sem cabecalho o app ja le na ordem padrao; a linha nova so torna isso explicito.
        structural.push({
          insertDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, inheritFromBefore: false },
        });
        headers.push({ range: cellRef(tab, 0, 1), values: [SHEET_FIELDS.map((f) => SHEET_FIELD_LABELS[f])] });
        added.push(`${tab.title}: cabeçalho completo`);
        return;
      }

      const missing = SHEET_FIELDS.filter((field) => tab.columns[field] < 0);
      if (!missing.length) return;

      const firstFree = tab.headerWidth;
      const needed = tab.columnOffset + firstFree + missing.length;
      if (tab.gridColumns > 0 && needed > tab.gridColumns) {
        structural.push({ appendDimension: { sheetId: tab.sheetId, dimension: 'COLUMNS', length: needed - tab.gridColumns } });
      }

      missing.forEach((field, i) => {
        const column = tab.columnOffset + firstFree + i;
        headers.push({ range: cellRef(tab, firstFree + i, tab.headerRow!), values: [[SHEET_FIELD_LABELS[field]]] });

        const range = {
          sheetId: tab.sheetId,
          startRowIndex: tab.headerRow!,
          startColumnIndex: column,
          endColumnIndex: column + 1,
        };
        if (field === 'paid') {
          formatting.push({ setDataValidation: { range, rule: { condition: { type: 'BOOLEAN' } } } });
          // Checkbox vazio e lido como celula vazia; com FALSE gravado, a proxima leitura reconhece
          // a coluna como checkbox e o app passa a gravar TRUE/FALSE nela, e nao texto.
          if (tab.lastDataRow > tab.headerRow!) {
            const rows = tab.lastDataRow - tab.headerRow!;
            headers.push({
              range: `${cellRef(tab, firstFree + i, tab.headerRow! + 1)}:${columnLetter(column)}${tab.lastDataRow}`,
              values: Array.from({ length: rows }, () => [false]),
            });
          }
        } else if (field === 'dueDate' || field === 'paymentDate' || field === 'amount') {
          formatting.push({
            repeatCell: {
              range,
              cell: { userEnteredFormat: { numberFormat: field === 'amount' ? CURRENCY_FORMAT : DATE_FORMAT } },
              fields: 'userEnteredFormat.numberFormat',
            },
          });
        }
      });
      added.push(`${tab.title}: ${missing.map((f) => SHEET_FIELD_LABELS[f]).join(', ')}`);
    });

    if (structural.length) await batchUpdate(config.spreadsheetId, structural);
    if (headers.length) await updateValues(config.spreadsheetId, headers);
    if (formatting.length) await batchUpdate(config.spreadsheetId, formatting);
    if (added.length) await doSync();
    return added;
  });
}

export function getSheetsErrorStatus(err: unknown): number {
  if (err instanceof SheetsError) return err.status;
  if (err instanceof SheetsApiError) return err.status >= 400 && err.status < 500 ? err.status : 502;
  // Falha ao autenticar ou falar com o Google.
  return 502;
}

export { errorMessage as sheetsErrorMessage };
