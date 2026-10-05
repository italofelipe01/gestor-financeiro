import { useEffect, useState } from 'react';
import { CheckCircle2, Columns3, ExternalLink, Link2, Lock, PenLine, RotateCw, TriangleAlert, Unlink } from 'lucide-react';
import { apiFetch } from '../../api';
import { SheetField, SheetsStatus } from '../../types';
import { formatRelativeTime } from '../../utils/finance';
import { SHEET_FIELDS, SHEET_FIELD_LABELS, columnLetter } from '../../utils/spreadsheet';

interface SheetConnectionPanelProps {
  sheets: SheetsStatus | null;
  syncing: boolean;
  onSync: () => void;
  onChanged: () => Promise<unknown>;
  notify: (type: 'success' | 'error', text: string) => void;
}

const AUTO_SYNC_LABELS: Record<number, string> = {
  0: 'Desligada (só manual)',
  1: 'A cada 1 minuto',
  5: 'A cada 5 minutos',
  15: 'A cada 15 minutos',
  30: 'A cada 30 minutos',
  60: 'A cada 1 hora',
};

// Colunas sem as quais o app nao consegue ler um lancamento.
const REQUIRED_FIELDS: SheetField[] = ['launch', 'amount'];

export default function SheetConnectionPanel({ sheets, syncing, onSync, onChanged, notify }: SheetConnectionPanelProps) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedTabs, setSelectedTabs] = useState<number[]>([]);

  useEffect(() => {
    if (sheets?.sheetUrl) setSheetUrl(sheets.sheetUrl);
  }, [sheets?.sheetUrl]);

  const tabsRead = sheets?.tabs.map((t) => t.sheetId).filter((id): id is number => id !== null) ?? [];
  const tabsKey = (sheets?.selectedTabs.length ? sheets.selectedTabs : tabsRead).join(',');
  useEffect(() => {
    setSelectedTabs(tabsKey ? tabsKey.split(',').map(Number) : []);
  }, [tabsKey]);

  const run = async (action: () => Promise<{ error?: string | null } | unknown>, successText: string) => {
    setBusy(true);
    try {
      const result = (await action()) as { error?: string | null } | undefined;
      if (result && typeof result === 'object' && 'error' in result && result.error) notify('error', result.error);
      else notify('success', successText);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const handleConnect = () =>
    run(
      () => apiFetch('/api/sheets/config', { method: 'POST', body: { sheetUrl } }),
      'Planilha conectada e lida. O dashboard já mostra os dados dela.',
    );

  const handleDisconnect = () => {
    if (!window.confirm('Desconectar a planilha? Os lançamentos já lidos continuam salvos no app.')) return;
    run(async () => {
      await apiFetch('/api/sheets/config', { method: 'DELETE' });
      setSheetUrl('');
    }, 'Planilha desconectada.');
  };

  const handleAutoSync = (minutes: number) =>
    run(
      () => apiFetch('/api/sheets/config', { method: 'POST', body: { autoSyncMinutes: minutes } }),
      minutes > 0 ? `Sincronização automática: ${AUTO_SYNC_LABELS[minutes].toLowerCase()}.` : 'Sincronização automática desligada.',
    );

  const handleSaveTabs = () =>
    run(
      () => apiFetch('/api/sheets/config', { method: 'POST', body: { tabs: selectedTabs } }),
      'Abas atualizadas e relidas.',
    );

  const handleAddColumns = () =>
    run(async () => {
      const result = await apiFetch<{ added: string[] }>('/api/sheets/add-columns', { method: 'POST' });
      if (!result.added.length) return { error: 'A planilha já tem todas as colunas.' };
      return result;
    }, 'Colunas criadas na planilha.');

  const connected = !!sheets?.connected;
  const missingAny = sheets?.tabs.some((tab) => SHEET_FIELDS.some((f) => tab.columns[f] < 0) || tab.headerRow === null);
  const tabsDirty = selectedTabs.join(',') !== tabsKey;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs" id="google-sheets-connection">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-5">
        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
          <Link2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Planilha conectada</h2>
          <p className="text-xs text-gray-500">O app lê a planilha sozinho e o dashboard acompanha. Edite na planilha e pronto.</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2" htmlFor="sheet-url">
            URL da planilha
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="sheet-url"
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800"
            />
            <button
              onClick={handleConnect}
              disabled={busy || !sheetUrl.trim() || sheetUrl.trim() === sheets?.sheetUrl}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50 shrink-0"
            >
              {connected ? 'Trocar planilha' : 'Conectar'}
            </button>
          </div>
          {!connected && (
            <p className="text-[11px] text-gray-500 mt-2">
              Sem configurar nada, a planilha precisa estar em <strong>Compartilhar › Qualquer pessoa com o link › Leitor</strong> (o app
              só lê). Para planilha privada e para editar pelo app, configure a conta de serviço abaixo.
            </p>
          )}
        </div>

        {connected && sheets && (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm font-bold text-gray-900 truncate">{sheets.title || 'Planilha do Google Sheets'}</p>
                  {sheets.mode === 'api' && !sheets.warning ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                      <PenLine className="w-3 h-3" aria-hidden />
                      Leitura e escrita · Google Sheets API
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      <Lock className="w-3 h-3" aria-hidden />
                      Somente leitura · link público
                    </span>
                  )}
                  <p className="text-xs text-gray-600">
                    {sheets.lastSyncAt
                      ? `Última leitura ${formatRelativeTime(sheets.lastSyncAt)}: ${sheets.lastSyncCount} lançamentos`
                      : 'Ainda não lida.'}
                    {sheets.filteredOut > 0 ? ` · ${sheets.filteredOut} de obra deixados de fora` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={onSync}
                    disabled={syncing || busy}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-xl transition cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${syncing ? 'motion-safe:animate-spin' : ''}`} />
                    Sincronizar agora
                  </button>
                  {sheets.editUrl && (
                    <a
                      href={sheets.editUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-xs px-3 py-2 rounded-xl transition flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir
                    </a>
                  )}
                  <button
                    onClick={handleDisconnect}
                    disabled={busy}
                    className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-medium text-xs px-3 py-2 rounded-xl transition cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Desconectar
                  </button>
                </div>
              </div>

              {(sheets.lastError || sheets.warning) && (
                <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                  <TriangleAlert className="w-4 h-4 text-status-critical shrink-0" aria-hidden />
                  <span>{sheets.lastError || sheets.warning}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2" htmlFor="auto-sync">
                  Atualização automática
                </label>
                <select
                  id="auto-sync"
                  value={sheets.autoSyncMinutes}
                  onChange={(e) => handleAutoSync(Number(e.target.value))}
                  disabled={busy}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(AUTO_SYNC_LABELS).map(([minutes, label]) => (
                    <option key={minutes} value={minutes}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  O servidor relê a planilha nesse intervalo, ao abrir o app e antes do aviso do Telegram. Cada leitura gasta 2 das
                  300 requisições por minuto da cota gratuita.
                </p>
              </div>

              {sheets.availableTabs.length > 1 && (
                <div>
                  <span className="block text-xs font-semibold text-gray-700 mb-2">Abas lidas</span>
                  <div className="flex flex-wrap gap-2">
                    {sheets.availableTabs.map((tab) => {
                      const checked = selectedTabs.includes(tab.sheetId);
                      return (
                        <label
                          key={tab.sheetId}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer select-none ${
                            checked ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-indigo-600"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedTabs((prev) =>
                                e.target.checked ? [...prev, tab.sheetId] : prev.filter((id) => id !== tab.sheetId),
                              )
                            }
                          />
                          {tab.title}
                          {tab.hidden && <span className="text-gray-400">(oculta)</span>}
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={handleSaveTabs}
                      disabled={busy || !tabsDirty || selectedTabs.length === 0}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
                    >
                      Ler estas abas
                    </button>
                    <span className="text-[11px] text-gray-500">
                      Uma aba por mês? Marque todas. Lançamentos novos vão para a primeira marcada.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {sheets.tabs.length > 0 && (
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                  <Columns3 className="w-3.5 h-3.5 text-gray-500" aria-hidden />
                  Colunas reconhecidas
                </span>
                <div className="space-y-2">
                  {sheets.tabs.map((tab) => (
                    <div key={tab.sheetId ?? 'principal'} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-gray-700 mr-1">
                        {tab.title ?? 'Aba lida'}
                        {tab.headerRow === null ? ' (sem cabeçalho: ordem padrão)' : ` (cabeçalho na linha ${tab.headerRow})`}
                      </span>
                      {SHEET_FIELDS.map((field) => {
                        const index = tab.columns[field];
                        const found = index >= 0;
                        const required = REQUIRED_FIELDS.includes(field);
                        return (
                          <span
                            key={field}
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border ${
                              found
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : required
                                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                                  : 'border-gray-200 bg-gray-50 text-gray-500'
                            }`}
                          >
                            {found ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : <span aria-hidden>—</span>}
                            {SHEET_FIELD_LABELS[field as SheetField]}
                            {found ? ` (${columnLetter(index)})` : ' ausente'}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {missingAny &&
                  (sheets.writable ? (
                    <button
                      onClick={handleAddColumns}
                      disabled={busy}
                      className="mt-3 text-xs font-semibold px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
                    >
                      Adicionar colunas que faltam na planilha
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-500">
                      Coluna ausente vira valor padrão (despesa, sem vencimento, pendente). Crie as colunas na planilha ou configure a
                      conta de serviço para o app criá-las.
                    </p>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
