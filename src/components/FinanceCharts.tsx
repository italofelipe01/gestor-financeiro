import { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { filterPersonalTransactions } from '../utils/finance';

interface FinanceChartsProps {
  transactions: Transaction[];
}

export default function FinanceCharts({ transactions }: FinanceChartsProps) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  // Group expenses by category
  const categoryData = useMemo(() => {
    const expenses = filterPersonalTransactions(transactions).filter(t => t.costCenter === 'Despesas');
    const categories: Record<string, number> = {};

    expenses.forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });

    const topFive = Object.entries(categories)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const topFiveTotal = topFive.reduce((acc, item) => acc + item.amount, 0);
    return topFive.map((item) => ({
      ...item,
      percentage: topFiveTotal > 0 ? (item.amount / topFiveTotal) * 100 : 0,
    }));
  }, [transactions]);

  // General paid ratio
  const paidStats = useMemo(() => {
    const expenses = filterPersonalTransactions(transactions).filter(t => t.costCenter === 'Despesas');
    const total = expenses.reduce((acc, t) => acc + t.amount, 0);
    const paid = expenses.filter(t => t.paid).reduce((acc, t) => acc + t.amount, 0);
    const pending = total - paid;
    const ratio = total > 0 ? (paid / total) * 100 : 0;

    return { total, paid, pending, ratio };
  }, [transactions]);

  // Color map for categories
  const categoryColors: Record<number, string> = {
    0: '#4F46E5', // Indigo
    1: '#EF4444', // Red
    2: '#10B981', // Emerald
    3: '#F59E0B', // Amber
    4: '#3B82F6', // Blue
    5: '#EC4899', // Pink
    6: '#8B5CF6', // Purple
    7: '#14B8A6', // Teal
    8: '#64748B', // Slate
  };

  const getCategoryColor = (index: number) => {
    return categoryColors[index % 9] || '#94A3B8';
  };

  // Helper formatting BRL
  const fmt = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Donut chart calculations
  const donutRadius = 50;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * donutRadius;
  let accumulatedAngle = 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" id="finance-charts-view">
      {/* Chart 1: Paid Ratio Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs flex flex-col justify-between" id="chart-paid-ratio">
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Progresso de Pagamentos
          </h3>
          <p className="text-2xl font-bold text-gray-900 mb-4">
            {paidStats.ratio.toFixed(1)}% das Despesas Pagas
          </p>
        </div>

        {/* Big visual progress circle and ledger */}
        <div className="flex flex-col sm:flex-row items-center gap-6 my-2">
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* SVG circular progress */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
              {/* Background track circle */}
              <circle
                cx="60"
                cy="60"
                r="50"
                className="stroke-gray-100 fill-none"
                strokeWidth={strokeWidth}
              />
              {/* Foreground progress circle */}
              <circle
                cx="60"
                cy="60"
                r="50"
                className="stroke-emerald-500 fill-none transition-all duration-1000 ease-out"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (paidStats.ratio / 100) * circumference}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{paidStats.ratio.toFixed(0)}%</span>
              <span className="text-[10px] text-gray-400 uppercase font-semibold">Pago</span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-3">
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block"></span>
                  Já Pago (Liquidado)
                </span>
                <span className="font-bold text-gray-900">{fmt(paidStats.paid)}</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${paidStats.ratio}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 block"></span>
                  Pendente (Falta Pagar)
                </span>
                <span className="font-bold text-gray-900">{fmt(paidStats.pending)}</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-red-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${100 - paidStats.ratio}%` }}
                />
              </div>
            </div>
            
            <div className="pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-400">
              <span>Total de Compromissos:</span>
              <span className="font-medium text-gray-700">{fmt(paidStats.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart 2: Category Expenses Breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs flex flex-col justify-between" id="chart-categories">
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Divisão de Despesas por Categoria
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Suas 5 maiores frentes de gasto no mês
          </p>
        </div>

        {categoryData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-100 rounded-xl">
            Nenhuma despesa cadastrada para exibir o gráfico.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Custom SVG Donut Component */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                {categoryData.map((cat, i) => {
                  const strokeDasharray = `${(cat.percentage / 100) * circumference} ${circumference}`;
                  const strokeDashoffset = -accumulatedAngle;
                  accumulatedAngle += (cat.percentage / 100) * circumference;
                  
                  const color = getCategoryColor(i);
                  const isHovered = hoveredCategory === cat.name;

                  return (
                    <circle
                      key={cat.name}
                      cx="60"
                      cy="60"
                      r="50"
                      className="fill-none transition-all duration-300 cursor-pointer"
                      stroke={color}
                      strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      onMouseEnter={() => setHoveredCategory(cat.name)}
                      onMouseLeave={() => setHoveredCategory(null)}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {hoveredCategory ? (
                  <>
                    <span className="text-[10px] text-gray-400 max-w-[70px] truncate text-center uppercase font-bold">
                      {hoveredCategory}
                    </span>
                    <span className="text-xs font-bold text-gray-900">
                      {categoryData.find(c => c.name === hoveredCategory)?.percentage.toFixed(0)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-bold text-gray-850">
                      {categoryData.length}
                    </span>
                    <span className="text-[10px] text-gray-400 uppercase font-medium">Categorias</span>
                  </>
                )}
              </div>
            </div>

            {/* Scrollable Legends Ledger */}
            <div className="flex-1 w-full max-h-36 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
              {categoryData.map((cat, idx) => (
                <div
                  key={cat.name}
                  className={`flex items-center justify-between text-xs p-1 rounded-md transition-colors ${
                    hoveredCategory === cat.name ? 'bg-indigo-50/50' : ''
                  }`}
                  onMouseEnter={() => setHoveredCategory(cat.name)}
                  onMouseLeave={() => setHoveredCategory(null)}
                >
                  <span className="flex items-center gap-2 text-gray-600 truncate max-w-[140px]">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: getCategoryColor(idx) }}
                    ></span>
                    <span className="font-medium truncate">{cat.name}</span>
                  </span>
                  <span className="font-semibold text-gray-900 shrink-0">
                    {fmt(cat.amount)} <span className="text-[10px] text-gray-450 font-normal">({cat.percentage.toFixed(0)}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
