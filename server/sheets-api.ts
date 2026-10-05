import { SheetTab } from '../src/types';
import { getAccessToken } from './google-auth';

// Cliente minimo da Google Sheets API v4 (REST). Cota gratuita: 300 leituras e 300 escritas por
// minuto por projeto (60 por usuario) — uma sincronizacao gasta 2 leituras.
const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function friendlyError(status: number, message: string, reason: string): string {
  if (/not supported for this document/i.test(message)) {
    return 'O arquivo e um Excel (.xlsx) guardado no Drive, e a API so le Planilhas Google. Abra o arquivo e use Arquivo > Salvar como Planilhas Google, depois conecte a URL nova.';
  }
  if (reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(message)) {
    return 'A Google Sheets API esta desativada no projeto da conta de servico. Ative em console.cloud.google.com > APIs e servicos > Biblioteca > Google Sheets API.';
  }
  if (status === 403) {
    return 'A conta de servico nao tem acesso a esta planilha. Compartilhe a planilha com o e-mail da conta de servico como Editor.';
  }
  if (status === 404) return 'Planilha ou aba nao encontrada. Confira a URL conectada.';
  if (status === 429) return 'Limite de requisicoes do Google atingido. A proxima sincronizacao tenta de novo.';
  return `O Google respondeu ${status}: ${message}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new SheetsApiError('Nao foi possivel falar com a Google Sheets API. Verifique a conexao.', 0);
  }

  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || response.statusText;
    const reason = body?.error?.details?.find((d: any) => d?.reason)?.reason ?? '';
    throw new SheetsApiError(friendlyError(response.status, message, reason), response.status);
  }
  return body as T;
}

/** Nome de aba numa notacao A1: entre aspas simples, com aspas internas dobradas. */
export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export interface SpreadsheetMeta {
  title: string;
  tabs: (SheetTab & { rowCount: number; columnCount: number })[];
}

export async function getSpreadsheetMeta(spreadsheetId: string): Promise<SpreadsheetMeta> {
  const fields = 'properties.title,sheets.properties(sheetId,title,index,hidden,sheetType,gridProperties(rowCount,columnCount))';
  const body: any = await request(`${spreadsheetId}?fields=${encodeURIComponent(fields)}`);
  const tabs = (body.sheets ?? [])
    .map((s: any) => s.properties ?? {})
    // Abas de grafico ou de objeto nao tem celulas para ler.
    .filter((p: any) => !p.sheetType || p.sheetType === 'GRID')
    .map((p: any) => ({
      sheetId: Number(p.sheetId ?? 0),
      title: String(p.title ?? ''),
      index: Number(p.index ?? 0),
      hidden: !!p.hidden,
      rowCount: Number(p.gridProperties?.rowCount ?? 0),
      columnCount: Number(p.gridProperties?.columnCount ?? 0),
    }))
    .sort((a: SheetTab, b: SheetTab) => a.index - b.index);

  return { title: String(body.properties?.title ?? ''), tabs };
}

export interface ValueRange {
  range: string;
  values: unknown[][];
}

/**
 * Valores crus (UNFORMATTED_VALUE) e datas como numero serial: valor vem como numero, checkbox
 * como booleano e data sem depender do formato/locale da celula.
 */
export async function batchGetValues(spreadsheetId: string, ranges: string[]): Promise<ValueRange[]> {
  const params = new URLSearchParams({
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
    majorDimension: 'ROWS',
  });
  ranges.forEach((range) => params.append('ranges', range));
  const body: any = await request(`${spreadsheetId}/values:batchGet?${params.toString()}`);
  return (body.valueRanges ?? []).map((vr: any) => ({ range: String(vr.range ?? ''), values: vr.values ?? [] }));
}

/**
 * USER_ENTERED: o Sheets interpreta como se a pessoa tivesse digitado — data ISO vira data,
 * numero vira numero e o formato da coluna e preservado.
 */
export async function updateValues(spreadsheetId: string, data: ValueRange[]): Promise<void> {
  await request(`${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

export async function batchUpdate(spreadsheetId: string, requests: unknown[]): Promise<void> {
  await request(`${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

/** Linha e coluna (0-based) onde comeca o intervalo devolvido pela API, ex.: 'Aba'!B3:H40. */
export function parseRangeStart(range: string): { row: number; column: number } {
  const match = range.match(/!\$?([A-Z]+)\$?(\d+)/);
  if (!match) return { row: 0, column: 0 };
  const column = match[1].split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { row: Number(match[2]) - 1, column };
}
