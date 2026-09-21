export interface Transaction {
  id: string;
  launch: string; // Lançamento
  costCenter: 'Despesas' | 'Receitas'; // Centro de custo
  category: string; // Segmento de operação
  amount: number; // Expectativa (R$)
  paid: boolean; // Pago vs Pendente
  dueDate: string; // Data de vencimento (YYYY-MM-DD or DD/MM/YYYY)
  paymentDate?: string | null; // Data do pagamento
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  dailyTime: string; // HH:MM
  enabled: boolean;
}

export interface GoogleSheetsConfig {
  sheetUrl: string;
  spreadsheetId: string;
  gid: string | null; // aba especifica, quando a URL aponta para uma
  lastSyncAt: string | null; // ISO 8601
  lastSyncCount: number;
}

export interface DashboardStats {
  totalIncome: number;
  totalExpense: number;
  totalPaid: number;
  totalPending: number;
  netBalance: number;
}
