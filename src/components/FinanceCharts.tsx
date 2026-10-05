import { useMemo, useState } from 'react';
import { Table2, ChartColumn } from 'lucide-react';
import { Transaction } from '../types';
import { Period, formatBRL, formatMonthLabel } from '../utils/finance';

// Alem disso, as categorias menores somam em "Outras": cor nenhuma e gerada para a 9a.
const MAX_CATEGORIES = 7;
const MAX_MONTHS = 12;
const PLOT_HEIGHT = 160;

const compactBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function shortMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace('.', '');
  return `${name}/${String(year).slice(2)}`;
}

/** Proximo valor "redondo" (1, 2, 2,5, 5 x 10^n) para os ticks do eixo. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Uma razao contra um limite: medidor, e nao um donut de duas fatias. */
export function PaymentMeter({ transactions }: { transactions: Transaction[] }) {
  const stats = useMemo(() => {
    const expenses = transactions.filter((t) => t.costCenter === 'Despesas');
    const total = expenses.reduce((acc, t) => acc + t.amount, 0);
    const paid = expenses.filter((t) => t.paid).reduce((acc, t) => acc + t.amount, 0);
    const pendingCount = expenses.filter((t) => !t.paid).length;
    return { total, paid, pending: total - paid, pendingCount, ratio: total > 0 ? (paid / total) * 100 : 0 };
  }, [transactions]);

  return (
    <section
      className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8"
      id="chart-paid-ratio"
    >
      <div className="shrink-0">
        <h3 className="text-sm font-semibold text-gray-500">Despesas pagas no período</h3>
        <p className="mt-1 text-gray-900">
          <span className="text-3xl font-semibold">{stats.ratio.toFixed(0)}%</span>
          <span className="ml-2 text-sm text-gray-500">de {formatBRL(stats.total)}</span>
        </p>
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        <div
          role="meter"
          aria-label="Percentual das despesas já pagas"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(stats.ratio)}
          className="h-3 w-full rounded-full bg-series-track overflow-hidden"
        >
          <div className="h-full rounded-full bg-series-1 transition-[width] duration-700" style={{ width: `${stats.ratio}%` }} />
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-1" aria-hidden />
              Já pago
            </dt>
            <dd className="font-semibold text-gray-900 tabular-nums">{formatBRL(stats.paid)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-track" aria-hidden />
              Falta pagar
            </dt>
            <dd className="font-semibold text-gray-900 tabular-nums">
              {formatBRL(stats.pending)}
              <span className="ml-1 text-xs font-normal text-gray-500">
                ({stats.pendingCount} {stats.pendingCount === 1 ? 'conta' : 'contas'})
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Comparar magnitudes entre categorias: barras de uma cor so, valor na ponta de cada uma. */
export function CategoryBars({ transactions }: { transactions: Transaction[] }) {
  const [active, setActive] = useState<string | null>(null);

  const { rows, total } = useMemo(() => {
    const byCategory = new Map<string, { amount: number; count: number; pending: number }>();
    transactions
      .filter((t) => t.costCenter === 'Despesas')
      .forEach((t) => {
        const entry = byCategory.get(t.category) ?? { amount: 0, count: 0, pending: 0 };
        entry.amount += t.amount;
        entry.count += 1;
        if (!t.paid) entry.pending += t.amount;
        byCategory.set(t.category, entry);
      });

    const sorted = Array.from(byCategory, ([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount);
    const head = sorted.slice(0, MAX_CATEGORIES);
    const tail = sorted.slice(MAX_CATEGORIES);
    if (tail.length) {
      head.push({
        name: `Outras (${tail.length})`,
        amount: tail.reduce((acc, r) => acc + r.amount, 0),
        count: tail.reduce((acc, r) => acc + r.count, 0),
        pending: tail.reduce((acc, r) => acc + r.pending, 0),
      });
    }
    return { rows: head, total: sorted.reduce((acc, r) => acc + r.amount, 0) };
  }, [transactions]);

  const max = rows.reduce((acc, r) => Math.max(acc, r.amount), 0);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs" id="chart-categories">
      <h3 className="text-sm font-semibold text-gray-500">Despesas por categoria</h3>
      <p className="text-xs text-gray-400 mb-4">Percentual sobre o total de despesas do período</p>

      {rows.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          Nenhuma despesa no período.
        </div>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const share = total > 0 ? (row.amount / total) * 100 : 0;
            const isActive = active === row.name;
            return (
              <li
                key={row.name}
                tabIndex={0}
                onMouseEnter={() => setActive(row.name)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(row.name)}
                onBlur={() => setActive(null)}
                className={`rounded-lg px-2 py-1.5 outline-none transition-colors ${isActive ? 'bg-slate-50' : ''} focus-visible:ring-2 focus-visible:ring-indigo-300`}
              >
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-gray-600 truncate">{row.name}</span>
                  <span className="shrink-0 font-semibold text-gray-900 tabular-nums">
                    {formatBRL(row.amount)}
                    <span className="ml-1.5 font-normal text-gray-500">{share.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-2.5">
                  <div
                    className={`h-full bg-series-1 rounded-r-[4px] transition-[width,opacity] duration-500 ${active && !isActive ? 'opacity-50' : ''}`}
                    style={{ width: `${max > 0 ? Math.max((row.amount / max) * 100, 1) : 0}%` }}
                  />
                </div>
                {isActive && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {row.count} {row.count === 1 ? 'lançamento' : 'lançamentos'} · {formatBRL(row.pending)} em aberto
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface MonthRow {
  month: string;
  income: number;
  expense: number;
}

/**
 * Evolucao mes a mes (receitas x despesas, colunas agrupadas, um eixo so). Mostra todos os
 * meses e destaca o periodo escolhido; clicar numa coluna seleciona o mes.
 */
export function MonthlyColumns({
  transactions,
  period,
  onSelectPeriod,
}: {
  transactions: Transaction[];
  period: Period;
  onSelectPeriod: (period: Period) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { months, undated } = useMemo(() => {
    const byMonth = new Map<string, MonthRow>();
    let undatedCount = 0;
    transactions.forEach((t) => {
      if (!t.dueDate) {
        undatedCount += 1;
        return;
      }
      const key = t.dueDate.slice(0, 7);
      const row = byMonth.get(key) ?? { month: key, income: 0, expense: 0 };
      if (t.costCenter === 'Receitas') row.income += t.amount;
      else row.expense += t.amount;
      byMonth.set(key, row);
    });
    const sorted = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
    return { months: sorted.slice(-MAX_MONTHS), undated: undatedCount };
  }, [transactions]);

  // Um mes so nao e evolucao: os cartoes do topo ja contam essa historia.
  if (months.length < 2) return null;

  const max = months.reduce((acc, m) => Math.max(acc, m.income, m.expense), 0);
  const step = niceCeil(max / 4);
  const top = step * Math.max(1, Math.ceil(max / step));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const focusIndex = hovered ?? months.findIndex((m) => m.month === period);
  const focus = focusIndex >= 0 ? months[focusIndex] : months[months.length - 1];

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs" id="chart-monthly">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500">Receitas e despesas por mês</h3>
          <p className="text-xs text-gray-400">
            Pelo vencimento{undated > 0 ? ` · ${undated} lançamento(s) sem data ficam de fora` : ''} · clique num mês para filtrar
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-1" aria-hidden />
              Receitas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-2" aria-hidden />
              Despesas
            </span>
          </div>
          <button
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            {showTable ? <ChartColumn className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            {showTable ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 font-medium">Mês</th>
                <th className="py-2 font-medium text-right">Receitas</th>
                <th className="py-2 font-medium text-right">Despesas</th>
                <th className="py-2 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 tabular-nums">
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="py-2 text-gray-700">{formatMonthLabel(m.month)}</td>
                  <td className="py-2 text-right text-gray-900">{formatBRL(m.income)}</td>
                  <td className="py-2 text-right text-gray-900">{formatBRL(m.expense)}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{formatBRL(m.income - m.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-600 mb-3" aria-live="polite">
            <strong className="text-gray-900">{formatMonthLabel(focus.month)}:</strong> receitas{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{formatBRL(focus.income)}</span> · despesas{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{formatBRL(focus.expense)}</span> · saldo{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{formatBRL(focus.income - focus.expense)}</span>
          </p>

          {/* pt-2: o rotulo do topo do eixo e centrado na linha e passaria do limite do grafico */}
          <div className="flex gap-2 pt-2">
            {/* Eixo Y */}
            <div className="relative w-14 shrink-0 text-[10px] text-chart-muted tabular-nums" style={{ height: PLOT_HEIGHT }}>
              {ticks.map((tick) => (
                <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(tick / top) * 100}%` }}>
                  {compactBRL.format(tick)}
                </span>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div className="relative" style={{ height: PLOT_HEIGHT }}>
                {ticks.map((tick) => (
                  <div
                    key={tick}
                    className={`absolute inset-x-0 h-px ${tick === 0 ? 'bg-chart-baseline' : 'bg-chart-grid'}`}
                    style={{ bottom: `${(tick / top) * 100}%` }}
                    aria-hidden
                  />
                ))}

                <div className="absolute inset-0 flex items-end">
                  {months.map((m, i) => {
                    const dimmed = period !== 'todos' && m.month !== period && hovered !== i;
                    return (
                      <button
                        key={m.month}
                        onClick={() => onSelectPeriod(m.month === period ? 'todos' : m.month)}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(i)}
                        onBlur={() => setHovered(null)}
                        aria-label={`${formatMonthLabel(m.month)}: receitas ${formatBRL(m.income)}, despesas ${formatBRL(m.expense)}`}
                        aria-pressed={m.month === period}
                        className={`relative flex-1 h-full flex items-end justify-center gap-[2px] rounded-md cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                          hovered === i ? 'bg-slate-50' : ''
                        }`}
                      >
                        <span
                          className={`w-2.5 sm:w-4 max-w-6 bg-series-1 rounded-t-[4px] transition-opacity ${dimmed ? 'opacity-35' : ''}`}
                          style={{ height: `${(m.income / top) * 100}%` }}
                        />
                        <span
                          className={`w-2.5 sm:w-4 max-w-6 bg-series-2 rounded-t-[4px] transition-opacity ${dimmed ? 'opacity-35' : ''}`}
                          style={{ height: `${(m.expense / top) * 100}%` }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex mt-1.5">
                {months.map((m, i) => (
                  <span
                    key={m.month}
                    // No celular, com muitos meses, um rotulo sim e outro nao para nao encavalar.
                    className={`flex-1 text-center text-[10px] ${m.month === period ? 'font-bold text-gray-900' : 'text-chart-muted'} ${
                      months.length > 6 && i % 2 === 1 && m.month !== period ? 'invisible sm:visible' : ''
                    }`}
                  >
                    {shortMonth(m.month)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
