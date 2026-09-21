import { Transaction } from '../types';
import {
  normalizeCostCenter,
  normalizeText,
  parseCurrencyBR,
  parseDateToISO,
  parsePaidStatus,
} from './finance';

export type ParsedRow = Omit<Transaction, 'id'>;

/**
 * Uma linha pode vir de tres origens: colagem do Google Sheets (TSV), export CSV
 * da propria planilha (virgula, com aspas) ou CSV pt-BR (ponto e virgula).
 */
export function splitSpreadsheetRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));

  const delimiter = line.includes(';') ? ';' : ',';
  const columns: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      columns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  columns.push(current.trim());
  return columns.map((c) => c.replace(/^["']|["']$/g, ''));
}

export function parseSpreadsheetText(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/);
  const parsedItems: ParsedRow[] = [];

  const headerIndices = {
    launch: -1,
    costCenter: -1,
    category: -1,
    amount: -1,
    paid: -1,
    dueDate: -1,
    paymentDate: -1,
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const columns = splitSpreadsheetRow(line);
    const normalizedColumns = columns.map(normalizeText);

    const isHeader = normalizedColumns.some(
      (col) =>
        col.includes('lanc') ||
        col.includes('centro') ||
        col.includes('segmento') ||
        col.includes('expectativa') ||
        col.includes('valor') ||
        col.includes('venc'),
    );

    if (isHeader && parsedItems.length === 0 && index <= 1) {
      columns.forEach((col, idx) => {
        const lower = normalizeText(col);
        if (lower.includes('pagamento') || lower.includes('liquidacao')) headerIndices.paymentDate = idx;
        else if (lower.includes('venc')) headerIndices.dueDate = idx;
        else if (lower === 'pago' || lower === 'paga' || lower.includes('status')) headerIndices.paid = idx;
        else if (lower.includes('lanç') || lower.includes('lanc') || lower.includes('desc') || lower.includes('item')) headerIndices.launch = idx;
        else if (lower.includes('centro') || lower.includes('custo') || lower.includes('tipo')) headerIndices.costCenter = idx;
        else if (lower.includes('seg') || lower.includes('oper') || lower.includes('cat')) headerIndices.category = idx;
        else if (lower.includes('expe') || lower.includes('val') || lower.includes('quant')) headerIndices.amount = idx;
      });
      return;
    }

    // Sem cabecalho reconhecido, cai para a ordem sugerida das colunas.
    const colLaunch = headerIndices.launch !== -1 ? headerIndices.launch : 0;
    const colCostCenter = headerIndices.costCenter !== -1 ? headerIndices.costCenter : 1;
    const colCategory = headerIndices.category !== -1 ? headerIndices.category : 2;
    const colAmount = headerIndices.amount !== -1 ? headerIndices.amount : 3;
    const colPaid = headerIndices.paid !== -1 ? headerIndices.paid : 4;
    const colDueDate = headerIndices.dueDate !== -1 ? headerIndices.dueDate : 5;
    const colPaymentDate = headerIndices.paymentDate !== -1 ? headerIndices.paymentDate : 6;

    const launch = columns[colLaunch] || '';
    if (!launch) return;

    const paid = parsePaidStatus(columns[colPaid] !== undefined ? columns[colPaid] : 'não');
    const dueDate = parseDateToISO(columns[colDueDate]);

    parsedItems.push({
      launch,
      costCenter: normalizeCostCenter(columns[colCostCenter] || 'Despesas'),
      category: columns[colCategory] || 'Geral',
      amount: parseCurrencyBR(columns[colAmount] || '0'),
      paid,
      dueDate,
      paymentDate: paid ? parseDateToISO(columns[colPaymentDate], dueDate) : null,
    });
  });

  return parsedItems;
}

/**
 * O id fica entre /d/ e a proxima barra na URL da planilha. O formato aceito e
 * restrito de proposito: o servidor monta a URL de export a partir desse id em
 * vez de buscar a URL que o cliente mandou, para nao virar um proxy aberto.
 */
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/** Aba especifica da planilha, quando a URL aponta para uma (`#gid=123`). */
export function extractSheetGid(url: string): string | null {
  const match = url.match(/[#&?]gid=([0-9]+)/);
  return match ? match[1] : null;
}

export function buildCsvExportUrl(spreadsheetId: string, gid?: string | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  return gid ? `${base}&gid=${gid}` : base;
}
