export interface Transaction {
  id: string;
  launch: string; // Lançamento
  costCenter: 'Despesas' | 'Receitas'; // Centro de custo
  category: string; // Segmento de operação
  amount: number; // Expectativa (R$)
  paid: boolean; // Pago vs Pendente
  dueDate: string; // Data de vencimento (YYYY-MM-DD); vazio = sem vencimento
  paymentDate?: string | null; // Data do pagamento
  source?: TransactionSource | null; // linha de origem, quando veio da planilha conectada
}

/** De onde o lancamento veio na planilha; e o que permite escrever de volta nela. */
export interface TransactionSource {
  sheetId: number | null; // gid da aba
  tab: string | null; // nome da aba (so conhecido no modo API)
  row: number; // linha na planilha, comecando em 1
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  dailyTime: string; // HH:MM
  enabled: boolean;
}

/** Colunas que o app sabe ler da planilha. */
export type SheetField = 'launch' | 'costCenter' | 'category' | 'amount' | 'paid' | 'dueDate' | 'paymentDate';

/** Indice (0-based) de cada coluna na aba; -1 quando a coluna nao existe. */
export type ColumnMap = Record<SheetField, number>;

/**
 * `csv`: export publico do Google, sem credencial, somente leitura.
 * `api`: Google Sheets API v4 com conta de servico, leitura e escrita.
 */
export type SheetsMode = 'csv' | 'api';

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
  hidden: boolean;
}

/** O que a ultima leitura descobriu sobre cada aba lida. */
export interface SheetTabStatus {
  sheetId: number | null;
  title: string | null;
  headerRow: number | null; // linha do cabecalho, comecando em 1; null = sem cabecalho
  columns: ColumnMap;
  rowCount: number;
}

export interface GoogleSheetsConfig {
  sheetUrl: string;
  spreadsheetId: string;
  gid: string | null; // aba especifica, quando a URL aponta para uma
  // Abas lidas no modo API (por sheetId). Vazio = a aba da URL, ou a primeira.
  tabs?: number[];
  autoSyncMinutes?: number; // 0 desliga a sincronizacao automatica
  lastSyncAt: string | null; // ISO 8601
  lastSyncCount: number;
}

export interface SheetsStatus {
  connected: boolean;
  mode: SheetsMode | null;
  spreadsheetId: string | null;
  title: string | null; // nome da planilha (modo API)
  sheetUrl: string | null;
  editUrl: string | null;
  writable: boolean; // o app consegue gravar na planilha
  autoSyncMinutes: number;
  lastSyncAt: string | null;
  lastSyncCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  warning: string | null; // leu, mas com ressalva (ex.: caiu para o link publico)
  syncing: boolean;
  filteredOut: number; // linhas de obra deixadas de fora na ultima leitura
  tabs: SheetTabStatus[];
  availableTabs: SheetTab[]; // todas as abas da planilha (modo API)
  selectedTabs: number[];
}

export interface ServiceAccountStatus {
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  source: 'arquivo' | 'env' | null;
}

export interface AppStatus {
  dataVersion: string;
  sheets: SheetsStatus;
  serviceAccount: ServiceAccountStatus;
}

export interface DashboardStats {
  totalIncome: number;
  totalExpense: number;
  totalPaid: number;
  totalPending: number;
  netBalance: number;
}
