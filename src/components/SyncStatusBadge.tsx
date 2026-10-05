import { TriangleAlert, CircleDashed, CloudCheck, RefreshCw } from 'lucide-react';
import { SheetsStatus } from '../types';
import { formatRelativeTime } from '../utils/finance';

interface SyncStatusBadgeProps {
  sheets: SheetsStatus | null;
  syncing: boolean;
  onOpenSheetTab: () => void;
}

/** Estado da conexao com a planilha, sempre visivel no topo. Clicar leva a aba Planilha. */
export default function SyncStatusBadge({ sheets, syncing, onOpenSheetTab }: SyncStatusBadgeProps) {
  let icon = <CircleDashed className="w-3.5 h-3.5 text-gray-400" aria-hidden />;
  let label = 'Sem planilha conectada';
  let tone = 'text-gray-500 bg-gray-50 border-gray-200';

  if (sheets?.connected) {
    if (syncing) {
      icon = <RefreshCw className="w-3.5 h-3.5 text-indigo-500 motion-safe:animate-spin" aria-hidden />;
      label = 'Sincronizando…';
      tone = 'text-indigo-700 bg-indigo-50 border-indigo-100';
    } else if (sheets.lastError || sheets.warning) {
      icon = <TriangleAlert className="w-3.5 h-3.5 text-status-critical" aria-hidden />;
      label = sheets.lastError ? 'Erro ao ler a planilha' : 'Planilha somente leitura';
      tone = 'text-rose-800 bg-rose-50 border-rose-200';
    } else {
      icon = <CloudCheck className="w-3.5 h-3.5 text-status-good" aria-hidden />;
      label = `Planilha atualizada ${formatRelativeTime(sheets.lastSyncAt)}`;
      tone = 'text-emerald-800 bg-emerald-50 border-emerald-200';
    }
  }

  return (
    <button
      onClick={onOpenSheetTab}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 sm:px-2.5 py-1.5 sm:py-1 text-[11px] font-semibold whitespace-nowrap transition hover:brightness-95 cursor-pointer ${tone}`}
      title={sheets?.lastError || sheets?.warning || label}
      aria-label={label}
    >
      {icon}
      {/* No celular so o icone: o texto completo fica no title e no aria-label. */}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
