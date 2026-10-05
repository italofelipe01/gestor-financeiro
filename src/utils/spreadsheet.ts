import { ColumnMap, SheetField, Transaction } from '../types';
import {
  normalizeCostCenter,
  normalizeText,
  parseCurrencyBR,
  parseDateToISO,
  parsePaidStatus,
} from './finance';

export type ParsedRow = Omit<Transaction, 'id'>;

/** Linha lida, com o numero da linha de origem na planilha (comecando em 1). */
export interface ParsedSheetRow extends ParsedRow {
  sourceRow: number;
}

export interface ParsedSheet {
  headerRow: number | null; // linha do cabecalho, comecando em 1; null = sem cabecalho
  columns: ColumnMap;
  rows: ParsedSheetRow[];
  // Valores que a coluna "Pago" ja usa, para gravar no mesmo formato (checkbox ou texto).
  paidValues: { paid: string | boolean; unpaid: string | boolean };
}

/** Ordem sugerida das colunas: e a usada quando a planilha nao tem cabecalho reconhecivel. */
export const SHEET_FIELDS: SheetField[] = ['launch', 'costCenter', 'category', 'amount', 'paid', 'dueDate', 'paymentDate'];

export const SHEET_FIELD_LABELS: Record<SheetField, string> = {
  launch: 'Lançamento',
  costCenter: 'Centro de custo',
  category: 'Segmento',
  amount: 'Expectativa',
  paid: 'Pago',
  dueDate: 'Vencimento',
  paymentDate: 'Pagamento',
};

const DEFAULT_COLUMNS: ColumnMap = {
  launch: 0,
  costCenter: 1,
  category: 2,
  amount: 3,
  paid: 4,
  dueDate: 5,
  paymentDate: 6,
};

// Cabecalho e procurado nas primeiras linhas: planilhas costumam ter titulo acima dele.
const HEADER_SEARCH_ROWS = 10;

/**
 * Le texto delimitado: colagem do Google Sheets (TSV), export CSV da planilha (virgula) ou CSV
 * pt-BR (ponto e virgula). Respeita aspas, aspas escapadas ("") e quebra de linha dentro de
 * celula, que o export do Google produz em celulas com mais de uma linha.
 */
export function parseDelimitedText(content: string): string[][] {
  const text = content.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.trim() || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  if (firstLine.includes('\t')) return '\t';
  const unquoted = firstLine.replace(/"[^"]*"/g, '');
  const semicolons = (unquoted.match(/;/g) ?? []).length;
  const commas = (unquoted.match(/,/g) ?? []).length;
  return semicolons > 0 && semicolons >= commas ? ';' : ',';
}

/** Qual campo um titulo de coluna representa. A ordem dos testes desfaz as ambiguidades. */
export function matchHeaderField(label: unknown): SheetField | null {
  if (typeof label !== 'string') return null;
  const text = normalizeText(label);
  if (!text) return null;

  if (text.includes('status') || text.includes('situac')) return 'paid';
  if (/pagamento|pago em|data pag|liquidac|quitac/.test(text)) return 'paymentDate';
  if (/^(pago|paga|pagos|quitad|pg\b|ok\b)/.test(text)) return 'paid';
  if (text.includes('venc') || /^(data|dia)\b/.test(text)) return 'dueDate';
  if (/lanc|descri|historico|^item|^nome|^conta$/.test(text)) return 'launch';
  if (/centro|custo|^tipo|natureza|entrada.*saida/.test(text)) return 'costCenter';
  if (/segmento|^seg\b|oper|categ|grupo|classif/.test(text)) return 'category';
  if (/expect|valor|quant|montante|r\$|previsto|orcado/.test(text)) return 'amount';
  return null;
}

function headerFields(row: unknown[]): Map<SheetField, number> {
  const found = new Map<SheetField, number>();
  row.forEach((cell, idx) => {
    const field = matchHeaderField(cell);
    if (field && !found.has(field)) found.set(field, idx);
  });
  return found;
}

/**
 * Cabecalho: nenhum numero ou digito (valor, data), duas ou mais colunas reconhecidas e pelo
 * menos metade das celulas preenchidas reconhecidas. Sem a proporcao, um lancamento como
 * "Itens de limpeza | ... | Pago" passaria por cabecalho.
 */
function isHeaderRow(row: unknown[]): boolean {
  const filled = row.filter((cell) => cellText(cell) !== '');
  if (filled.some((cell) => typeof cell !== 'string' || /\d/.test(cell))) return false;
  const matches = headerFields(row).size;
  return matches >= 2 && matches * 2 >= filled.length;
}

function isTotalRow(launch: string): boolean {
  return /^(sub)?tota(l|is)\b/.test(normalizeText(launch));
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Converte as linhas de uma aba (texto do CSV ou valores tipados da API) em lancamentos.
 * Com cabecalho, so as colunas reconhecidas sao lidas; coluna ausente vira valor padrao, em
 * vez de ler a coluna vizinha por engano. Sem cabecalho, vale a ordem de `SHEET_FIELDS`.
 */
export function parseSpreadsheetRows(rows: unknown[][]): ParsedSheet {
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    if (isHeaderRow(rows[i] ?? [])) {
      headerIndex = i;
      break;
    }
  }

  let columns: ColumnMap = { ...DEFAULT_COLUMNS };
  if (headerIndex >= 0) {
    const found = headerFields(rows[headerIndex]);
    columns = SHEET_FIELDS.reduce((acc, field) => {
      acc[field] = found.get(field) ?? -1;
      return acc;
    }, {} as ColumnMap);
  }

  const cell = (row: unknown[], field: SheetField): unknown => (columns[field] >= 0 ? row[columns[field]] : undefined);

  const parsed: ParsedSheetRow[] = [];
  let paidStyleBoolean = false;
  let paidToken: string | null = null;
  let unpaidToken: string | null = null;

  rows.forEach((row, index) => {
    if (index <= headerIndex || !row || row.length === 0) return;

    const launch = cellText(cell(row, 'launch'));
    if (!launch || isTotalRow(launch) || isHeaderRow(row)) return;

    const paidCell = cell(row, 'paid');
    if (typeof paidCell === 'boolean') paidStyleBoolean = true;
    const paid = parsePaidStatus(paidCell);
    const paidText = typeof paidCell === 'string' ? paidCell.trim() : '';
    if (paidText && paid && !paidToken) paidToken = paidText;
    if (paidText && !paid && !unpaidToken) unpaidToken = paidText;

    const costCenterText = cellText(cell(row, 'costCenter'));
    const dueDate = parseDateToISO(cell(row, 'dueDate'), '');

    parsed.push({
      launch,
      costCenter: costCenterText ? normalizeCostCenter(costCenterText) : 'Despesas',
      category: cellText(cell(row, 'category')) || 'Geral',
      // O sinal nao importa: o centro de custo e que diz se o valor entra ou sai.
      amount: Math.abs(parseCurrencyBR(cell(row, 'amount'))),
      paid,
      dueDate,
      paymentDate: paid ? parseDateToISO(cell(row, 'paymentDate'), '') || dueDate || null : null,
      sourceRow: index + 1,
    });
  });

  return {
    headerRow: headerIndex >= 0 ? headerIndex + 1 : null,
    columns,
    rows: parsed,
    paidValues: paidStyleBoolean
      ? { paid: true, unpaid: false }
      : { paid: paidToken ?? 'Pago', unpaid: unpaidToken ?? '' },
  };
}

export function parseSpreadsheetText(content: string): ParsedSheetRow[] {
  return parseSpreadsheetRows(parseDelimitedText(content)).rows;
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

/**
 * Export CSV publico (planilha compartilhada por link). Diferente do endpoint `gviz`, devolve
 * exatamente o que aparece nas celulas: o `gviz` adivinha um tipo por coluna e zera as celulas
 * que fogem dele (ex.: "dia 10" numa coluna de datas).
 */
export function buildCsvExportUrl(spreadsheetId: string, gid?: string | number | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  return gid !== null && gid !== undefined && gid !== '' ? `${base}&gid=${gid}` : base;
}

export function buildEditUrl(spreadsheetId: string, gid?: string | number | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return gid !== null && gid !== undefined && gid !== '' ? `${base}#gid=${gid}` : base;
}

/** Letra da coluna a partir do indice 0-based (0 -> A, 26 -> AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
