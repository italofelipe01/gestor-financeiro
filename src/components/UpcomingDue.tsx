import { CalendarClock, CircleCheck, Clock, Square, TriangleAlert } from 'lucide-react';
import { Transaction } from '../types';
import { describeDueIn, formatBRL, formatDateBR, getUpcomingDue } from '../utils/finance';

interface UpcomingDueProps {
  transactions: Transaction[]; // todos os periodos: conta atrasada de outro mes continua importando
  canEdit: boolean;
  onTogglePaid: (item: Transaction) => void;
  onSeeAll: () => void;
}

const MAX_ITEMS = 6;

/** Status com icone e texto, nunca so cor. */
export function DueBadge({ daysUntilDue }: { daysUntilDue: number }) {
  if (daysUntilDue < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
        <TriangleAlert className="w-3 h-3 text-status-critical" aria-hidden />
        {describeDueIn(daysUntilDue)}
      </span>
    );
  }
  if (daysUntilDue === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        <Clock className="w-3 h-3 text-status-warning" aria-hidden />
        {describeDueIn(daysUntilDue)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      <CalendarClock className="w-3 h-3 text-slate-500" aria-hidden />
      {describeDueIn(daysUntilDue)}
    </span>
  );
}

/** O mesmo recorte do aviso diario do Telegram: vencidas e as que vencem em ate 7 dias. */
export default function UpcomingDue({ transactions, canEdit, onTogglePaid, onSeeAll }: UpcomingDueProps) {
  const upcoming = getUpcomingDue(transactions, 7);
  const total = upcoming.reduce((acc, { item }) => acc + item.amount, 0);
  const overdue = upcoming.filter((u) => u.daysUntilDue < 0).length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs" id="upcoming-due">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500">Próximos vencimentos</h3>
          <p className="text-xs text-gray-400">Despesas em aberto vencidas ou que vencem nos próximos 7 dias</p>
        </div>
        {upcoming.length > 0 && (
          <p className="sm:text-right">
            <span className="block text-lg font-semibold text-gray-900 tabular-nums">{formatBRL(total)}</span>
            <span className="text-xs text-gray-500">
              {upcoming.length} {upcoming.length === 1 ? 'conta' : 'contas'}
              {overdue > 0 ? ` · ${overdue} atrasada${overdue === 1 ? '' : 's'}` : ''}
            </span>
          </p>
        )}
      </div>

      {upcoming.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-900">
          <CircleCheck className="w-5 h-5 text-status-good shrink-0" aria-hidden />
          Nada vencido nem vencendo nos próximos 7 dias.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {upcoming.slice(0, MAX_ITEMS).map(({ item, daysUntilDue }) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <button
                onClick={() => onTogglePaid(item)}
                disabled={!canEdit}
                className="p-1 rounded-lg text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 disabled:hover:bg-transparent disabled:hover:text-gray-300 disabled:cursor-not-allowed cursor-pointer transition"
                title={canEdit ? 'Marcar como pago' : 'Somente leitura: marque como pago na planilha'}
                aria-label={`Marcar ${item.launch} como pago`}
              >
                <Square className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.launch}</p>
                <p className="text-xs text-gray-500 truncate">
                  {item.category} · vence {formatDateBR(item.dueDate)}
                </p>
                <div className="mt-1">
                  <DueBadge daysUntilDue={daysUntilDue} />
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0 self-start">{formatBRL(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {upcoming.length > MAX_ITEMS && (
        <button onClick={onSeeAll} className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer">
          Ver as {upcoming.length} contas em Lançamentos →
        </button>
      )}
    </section>
  );
}
