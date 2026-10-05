import { ReactNode } from 'react';
import {
  CalendarClock,
  CheckCircle,
  FileSpreadsheet,
  MessageSquareCode,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { SheetsStatus, Transaction } from '../types';
import { Period, computeStats, formatBRL } from '../utils/finance';
import { CategoryBars, MonthlyColumns, PaymentMeter } from './FinanceCharts';
import UpcomingDue from './UpcomingDue';

interface DashboardProps {
  transactions: Transaction[]; // do periodo escolhido
  allTransactions: Transaction[];
  period: Period;
  onSelectPeriod: (period: Period) => void;
  sheets: SheetsStatus | null;
  canEdit: boolean;
  onTogglePaid: (item: Transaction) => void;
  onGoTo: (tab: 'lancamentos' | 'planilha' | 'telegram') => void;
}

function StatTile({ label, value, icon, tint }: { label: string; value: string; icon: ReactNode; tint: string }) {
  return (
    <div className="bg-white p-4 sm:p-5 border border-gray-100 rounded-2xl shadow-xs flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 ${tint}`} aria-hidden>
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-xs font-medium text-gray-500 block">{label}</span>
        <span className="text-base sm:text-lg font-semibold text-gray-900 block truncate">{value}</span>
      </div>
    </div>
  );
}

export default function Dashboard({
  transactions,
  allTransactions,
  period,
  onSelectPeriod,
  sheets,
  canEdit,
  onTogglePaid,
  onGoTo,
}: DashboardProps) {
  const stats = computeStats(transactions);
  const showingSample = !sheets?.connected && allTransactions.some((t) => t.id.startsWith('seed-'));

  return (
    <div className="space-y-6 sm:space-y-8 motion-safe:animate-fade-in">
      {!sheets?.connected && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white text-emerald-700 rounded-xl border border-emerald-100">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Conecte sua planilha do Google Sheets</h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {showingSample ? 'Você está vendo dados de exemplo. ' : ''}
                Com a planilha conectada, o dashboard se atualiza sozinho a cada poucos minutos — é só editar a planilha.
              </p>
            </div>
          </div>
          <button
            onClick={() => onGoTo('planilha')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0"
          >
            Conectar planilha
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        <StatTile
          label="Receitas"
          value={formatBRL(stats.totalIncome)}
          icon={<TrendingUp className="w-5 h-5" />}
          tint="bg-blue-50 text-blue-700"
        />
        <StatTile
          label="Despesas"
          value={formatBRL(stats.totalExpense)}
          icon={<TrendingDown className="w-5 h-5" />}
          tint="bg-orange-50 text-orange-700"
        />
        <StatTile
          label="Já pago"
          value={formatBRL(stats.totalPaid)}
          icon={<CheckCircle className="w-5 h-5" />}
          tint="bg-teal-50 text-teal-700"
        />
        <StatTile
          label="Falta pagar"
          value={formatBRL(stats.totalPending)}
          icon={<CalendarClock className="w-5 h-5" />}
          tint="bg-amber-50 text-amber-700"
        />

        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-4 sm:p-5 rounded-2xl shadow-sm text-white flex items-center gap-4 col-span-2 lg:col-span-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/10 text-indigo-200 flex items-center justify-center shrink-0" aria-hidden>
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-medium text-indigo-200 block">Saldo previsto</span>
            <span className="text-base sm:text-lg font-semibold block truncate">{formatBRL(stats.netBalance)}</span>
            {stats.netBalance < 0 && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-200">
                <TriangleAlert className="w-3 h-3" aria-hidden />
                Despesas maiores que receitas
              </span>
            )}
          </div>
        </div>
      </div>

      <PaymentMeter transactions={transactions} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        <UpcomingDue
          transactions={allTransactions}
          canEdit={canEdit}
          onTogglePaid={onTogglePaid}
          onSeeAll={() => onGoTo('lancamentos')}
        />
        <CategoryBars transactions={transactions} />
      </div>

      <MonthlyColumns transactions={allTransactions} period={period} onSelectPeriod={onSelectPeriod} />

      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white text-indigo-600 rounded-xl border border-slate-200">
            <MessageSquareCode className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm">Avisos diários no Telegram</h4>
            <p className="text-xs text-gray-500">
              Todo dia, no horário escolhido, o app relê a planilha e manda as contas vencidas e as dos próximos 7 dias.
            </p>
          </div>
        </div>
        <button
          onClick={() => onGoTo('telegram')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0"
        >
          Configurar avisos
        </button>
      </div>
    </div>
  );
}
