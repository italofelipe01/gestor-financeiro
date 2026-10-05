import { useState } from 'react';
import { Clipboard, LayoutGrid, RefreshCw, Table, Upload } from 'lucide-react';
import { apiFetch } from '../../api';
import { Transaction } from '../../types';
import { filterPersonalTransactions } from '../../utils/finance';
import { SHEET_FIELDS, SHEET_FIELD_LABELS, parseSpreadsheetText } from '../../utils/spreadsheet';

interface PasteImportPanelProps {
  sheetConnected: boolean;
  currentCount: number;
  onChanged: () => Promise<unknown>;
  notify: (type: 'success' | 'error', text: string) => void;
}

/** Alternativa manual a conexao: colar celulas copiadas do Sheets ou do Excel. */
export default function PasteImportPanel({ sheetConnected, currentCount, onChanged, notify }: PasteImportPanelProps) {
  const [pasteContent, setPasteContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async (replaceExisting: boolean) => {
    const parsedItems = parseSpreadsheetText(pasteContent);
    const personalItems = filterPersonalTransactions(parsedItems);
    if (personalItems.length === 0) {
      notify('error', 'Não foi possível detectar nenhuma linha válida. Confira se a primeira coluna tem o nome do lançamento.');
      return;
    }

    setLoading(true);
    try {
      const existing = replaceExisting ? [] : await apiFetch<Transaction[]>('/api/transactions');
      const result = await apiFetch<{ count: number }>('/api/transactions/import', {
        method: 'POST',
        body: [...existing, ...personalItems.map(({ sourceRow, ...item }) => item)],
      });
      const filteredOut = parsedItems.length - personalItems.length;
      notify(
        'success',
        `${personalItems.length} lançamentos importados${filteredOut ? ` (${filteredOut} de obra deixados de fora)` : ''}. Total: ${result.count}.`,
      );
      setPasteContent('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      await onChanged();
    }
  };

  const handleResetToSeed = async () => {
    if (!window.confirm('Voltar aos dados de exemplo? Os lançamentos atuais serão substituídos.')) return;
    setLoading(true);
    try {
      await apiFetch('/api/transactions/reset', { method: 'POST' });
      notify('success', 'Dados de exemplo restaurados.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      await onChanged();
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Importar copiando e colando</h2>
            <p className="text-xs text-gray-500">Alternativa manual, sem conexão com a planilha</p>
          </div>
        </div>
        {!sheetConnected && (
          <button
            onClick={handleResetToSeed}
            disabled={loading}
            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-medium text-xs px-3 py-2 rounded-xl transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Restaurar dados de exemplo
          </button>
        )}
      </div>

      {sheetConnected ? (
        <p className="text-sm text-gray-600">
          Com uma planilha conectada, ela é a fonte dos lançamentos: uma importação manual seria substituída na próxima
          sincronização. Para importar por colagem, desconecte a planilha.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-3 space-y-4">
            <label className="block text-xs font-semibold text-gray-700 flex items-center gap-1.5" htmlFor="paste-area">
              <Clipboard className="w-3.5 h-3.5 text-indigo-500" aria-hidden />
              Cole as linhas da planilha aqui
            </label>
            <textarea
              id="paste-area"
              className="w-full h-56 border border-gray-200 rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 placeholder-gray-400 bg-slate-50/50"
              placeholder={'Exemplo:\nFeira\tDespesas\tAlimentação\tR$ 40,00\nSalário Líquido\tReceitas\tRenda Principal\tR$ 12.000,00'}
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleImport(true)}
                disabled={loading || !pasteContent.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Substituir tudo
              </button>
              <button
                onClick={() => handleImport(false)}
                disabled={loading || !pasteContent.trim()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs sm:text-sm px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Clipboard className="w-4 h-4" />
                Somar aos {currentCount} atuais
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-3 text-xs text-indigo-950">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <LayoutGrid className="w-4 h-4 text-indigo-600" aria-hidden />
              Formato aceito
            </h3>
            <p>Copie as células direto do Google Sheets ou do Excel. Com cabeçalho, as colunas são reconhecidas pelo nome; sem cabeçalho, vale esta ordem:</p>
            <p className="font-mono text-[11px] bg-white p-2 rounded-lg border border-indigo-100 text-gray-700">
              {SHEET_FIELDS.map((f) => SHEET_FIELD_LABELS[f]).join(' | ')}
            </p>
            <p>Valores como <code>R$ 1.234,56</code>, datas <code>DD/MM/AAAA</code> ou só o dia (<code>10</code> = dia 10 do mês atual) e Pago como Sim/Não ou checkbox.</p>
            <p className="border-t border-indigo-100 pt-2">
              Lançamentos de <strong>obra/reforma</strong> são deixados de fora de propósito, para o dashboard mostrar só as finanças pessoais.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
