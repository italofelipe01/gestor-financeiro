import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Edit2, ExternalLink, Lock, Plus, Search, Square, Trash2, X } from 'lucide-react';
import { Transaction } from '../types';
import {
  dateDiffInDaysFromToday,
  formatBRL,
  formatDateBR,
  getTodayISO,
  normalizeText,
  parseCurrencyBR,
} from '../utils/finance';
import { DueBadge } from './UpcomingDue';

interface FinanceTableProps {
  transactions: Transaction[];
  readOnly: boolean;
  readOnlyReason: string | null;
  editUrl: string | null;
  writeTarget: string | null; // onde um lancamento novo vai parar, ex.: aba "Maio" da planilha
  onTogglePaid: (item: Transaction) => void;
  onDeleteItem: (item: Transaction) => Promise<boolean>;
  onAddItem: (item: Omit<Transaction, 'id'>) => Promise<boolean>;
  onUpdateItem: (id: string, item: Partial<Transaction>) => Promise<boolean>;
}

type FilterType = 'todos' | 'receitas' | 'despesas' | 'pagas' | 'pendentes' | 'atrasadas';
type SortType = 'vencimento' | 'planilha' | 'valor';

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'receitas', label: 'Receitas' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'atrasadas', label: 'Atrasadas' },
  { id: 'pagas', label: 'Pagas' },
];

const ITEMS_PER_PAGE = 15;

interface FormState {
  launch: string;
  costCenter: 'Despesas' | 'Receitas';
  category: string;
  amount: string;
  dueDate: string;
  paid: boolean;
  paymentDate: string;
}

const emptyForm = (): FormState => ({
  launch: '',
  costCenter: 'Despesas',
  category: '',
  amount: '',
  dueDate: getTodayISO(),
  paid: false,
  paymentDate: '',
});

function toForm(t: Transaction): FormState {
  return {
    launch: t.launch,
    costCenter: t.costCenter,
    category: t.category,
    amount: String(t.amount).replace('.', ','),
    dueDate: t.dueDate,
    paid: t.paid,
    paymentDate: t.paymentDate ?? '',
  };
}

function fromForm(form: FormState): Omit<Transaction, 'id'> {
  return {
    launch: form.launch.trim(),
    costCenter: form.costCenter,
    category: form.category.trim() || 'Geral',
    // Aceita "1.234,56" e "1234.56".
    amount: Math.abs(parseCurrencyBR(form.amount)),
    dueDate: form.dueDate,
    paid: form.paid,
    paymentDate: form.paid ? form.paymentDate || getTodayISO() : null,
  };
}

const inputClass =
  'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white text-gray-800';
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1';

function TransactionFields({
  form,
  setForm,
  categories,
  showPaymentDate,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  categories: string[];
  showPaymentDate: boolean;
}) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="tx-launch">Lançamento</label>
        <input
          id="tx-launch"
          type="text"
          required
          autoFocus
          className={inputClass}
          placeholder="Ex.: Aluguel, Supermercado"
          value={form.launch}
          onChange={(e) => setForm({ ...form, launch: e.target.value })}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="tx-cost-center">Centro de custo</label>
        <select
          id="tx-cost-center"
          className={inputClass}
          value={form.costCenter}
          onChange={(e) => setForm({ ...form, costCenter: e.target.value as FormState['costCenter'] })}
        >
          <option value="Despesas">Despesa (−)</option>
          <option value="Receitas">Receita (+)</option>
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="tx-category">Segmento / categoria</label>
        <input
          id="tx-category"
          type="text"
          list="tx-categories"
          className={inputClass}
          placeholder="Ex.: Moradia"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <datalist id="tx-categories">
          {categories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
      </div>

      <div>
        <label className={labelClass} htmlFor="tx-amount">Valor (R$)</label>
        <input
          id="tx-amount"
          type="text"
          inputMode="decimal"
          required
          className={`${inputClass} tabular-nums`}
          placeholder="0,00"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="tx-due">Vencimento <span className="font-normal text-gray-400">(opcional)</span></label>
        <input
          id="tx-due"
          type="date"
          className={inputClass}
          value={form.dueDate}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
        />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
          <input
            type="checkbox"
            className="w-4 h-4 accent-indigo-600"
            checked={form.paid}
            onChange={(e) => setForm({ ...form, paid: e.target.checked, paymentDate: e.target.checked ? form.paymentDate || getTodayISO() : '' })}
          />
          {form.costCenter === 'Receitas' ? 'Já recebido' : 'Já pago'}
        </label>
        {showPaymentDate && form.paid && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            em
            <input
              type="date"
              className={`${inputClass} w-auto`}
              value={form.paymentDate}
              onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
            />
          </label>
        )}
      </div>
    </>
  );
}

export default function FinanceTable({
  transactions,
  readOnly,
  readOnlyReason,
  editUrl,
  writeTarget,
  onTogglePaid,
  onDeleteItem,
  onAddItem,
  onUpdateItem,
}: FinanceTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('todos');
  const [sortType, setSortType] = useState<SortType>('vencimento');
  const [currentPage, setCurrentPage] = useState(1);
  const [addForm, setAddForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState<{ item: Transaction; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);

  const categoriesList = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.category))).filter(Boolean).sort(),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const term = normalizeText(searchTerm);
    const list = transactions.filter((t) => {
      const matchesSearch = !term || normalizeText(t.launch).includes(term) || normalizeText(t.category).includes(term);
      if (!matchesSearch) return false;

      const isExpense = t.costCenter === 'Despesas';
      switch (filterType) {
        case 'receitas':
          return !isExpense;
        case 'despesas':
          return isExpense;
        case 'pagas':
          return isExpense && t.paid;
        case 'pendentes':
          return isExpense && !t.paid;
        case 'atrasadas': {
          const diff = dateDiffInDaysFromToday(t.dueDate);
          return isExpense && !t.paid && diff !== null && diff < 0;
        }
        default:
          return true;
      }
    });

    if (sortType === 'valor') return [...list].sort((a, b) => b.amount - a.amount);
    if (sortType === 'vencimento') {
      // Sem vencimento vai para o fim.
      return [...list].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    }
    return [...list].sort(
      (a, b) => (a.source?.sheetId ?? 0) - (b.source?.sheetId ?? 0) || (a.source?.row ?? 0) - (b.source?.row ?? 0),
    );
  }, [transactions, searchTerm, filterType, sortType]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const paginatedTransactions = filteredTransactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm || !addForm.launch.trim() || !addForm.amount) return;
    setSaving(true);
    const ok = await onAddItem(fromForm(addForm));
    setSaving(false);
    if (ok) setAddForm(null);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.form.launch.trim() || !editing.form.amount) return;
    setSaving(true);
    const ok = await onUpdateItem(editing.item.id, fromForm(editing.form));
    setSaving(false);
    if (ok) setEditing(null);
  };

  const handleDelete = async (item: Transaction) => {
    const where = item.source ? ' Isso apaga a linha na planilha.' : '';
    if (!window.confirm(`Apagar o lançamento "${item.launch}"?${where}`)) return;
    await onDeleteItem(item);
  };

  const statusCell = (tx: Transaction) => {
    if (tx.costCenter === 'Receitas') {
      return <span className="text-xs text-gray-500">{tx.paid ? 'Recebida' : 'Receita'}</span>;
    }
    if (tx.paid) {
      return <span className="text-xs text-gray-500">Pago{tx.paymentDate ? ` em ${formatDateBR(tx.paymentDate).slice(0, 5)}` : ''}</span>;
    }
    const diff = dateDiffInDaysFromToday(tx.dueDate);
    if (diff !== null && diff <= 7) return <DueBadge daysUntilDue={diff} />;
    return <span className="text-xs text-gray-500">Pendente</span>;
  };

  const paidToggle = (tx: Transaction) => (
    <button
      onClick={() => onTogglePaid(tx)}
      disabled={readOnly}
      className="p-1 rounded-lg transition hover:bg-slate-100 disabled:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      title={readOnly ? 'Somente leitura' : tx.paid ? 'Marcar como pendente' : 'Marcar como pago'}
      aria-label={`${tx.paid ? 'Desmarcar' : 'Marcar'} ${tx.launch} como pago`}
    >
      {tx.paid ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-gray-300" />}
    </button>
  );

  const rowActions = (tx: Transaction) =>
    readOnly ? null : (
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setEditing({ item: tx, form: toForm(tx) })}
          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          title="Editar lançamento"
          aria-label={`Editar ${tx.launch}`}
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleDelete(tx)}
          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          title="Apagar lançamento"
          aria-label={`Apagar ${tx.launch}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );

  return (
    <div className="space-y-4 sm:space-y-6 motion-safe:animate-fade-in" id="finance-table-view">
      {readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <span>{readOnlyReason}</span>
          </p>
          {editUrl && (
            <a
              href={editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-white border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir planilha
            </a>
          )}
        </div>
      )}

      {/* Busca, filtros e ordenacao */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <input
            type="search"
            className="w-full text-sm border border-gray-200 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700"
            placeholder="Pesquisar por descrição ou categoria..."
            aria-label="Pesquisar lançamentos"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-1 text-xs overflow-x-auto max-w-full" role="tablist" aria-label="Filtrar lançamentos">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filterType === f.id}
                onClick={() => {
                  setFilterType(f.id);
                  setCurrentPage(1);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition cursor-pointer ${
                  filterType === f.id ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            value={sortType}
            onChange={(e) => setSortType(e.target.value as SortType)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Ordenar por"
          >
            <option value="vencimento">Por vencimento</option>
            <option value="planilha">Ordem da planilha</option>
            <option value="valor">Maior valor</option>
          </select>

          {!readOnly && (
            <button
              onClick={() => setAddForm(addForm ? null : emptyForm())}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          )}
        </div>
      </div>

      {addForm && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-white p-5 sm:p-6 rounded-2xl border border-dashed border-indigo-200 shadow-md motion-safe:animate-fade-in"
        >
          <div className="flex justify-between items-start gap-3 pb-3 mb-4 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Novo lançamento</h3>
              {writeTarget && <p className="text-xs text-gray-500 mt-0.5">Será incluído {writeTarget}.</p>}
            </div>
            <button type="button" onClick={() => setAddForm(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <TransactionFields form={addForm} setForm={setAddForm} categories={categoriesList} showPaymentDate={false} />
          </div>
          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
            <button type="button" onClick={() => setAddForm(null)} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-60">
              {saving ? 'Salvando…' : 'Salvar lançamento'}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
          onClick={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <form
            onSubmit={handleEditSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-dialog-title"
            className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 motion-safe:animate-fade-in max-h-[95vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 id="edit-dialog-title" className="font-bold text-gray-900 text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-500" aria-hidden />
                Editar lançamento
              </h3>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TransactionFields
                form={editing.form}
                setForm={(form) => setEditing({ ...editing, form })}
                categories={categoriesList}
                showPaymentDate
              />
            </div>
            {editing.item.source && (
              <p className="mt-4 text-xs text-gray-500">
                Linha {editing.item.source.row}
                {editing.item.source.tab ? ` da aba "${editing.item.source.tab}"` : ''} da planilha.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-slate-600 border border-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer disabled:opacity-60">
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {paginatedTransactions.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-400 font-medium">
            Nenhum lançamento encontrado com esses filtros.
          </p>
        ) : (
          <>
            {/* Celular: cartoes */}
            <ul className="md:hidden divide-y divide-gray-100">
              {paginatedTransactions.map((tx) => (
                <li key={tx.id} className="flex items-start gap-3 p-4">
                  {tx.costCenter === 'Despesas' ? paidToggle(tx) : <span className="w-7 shrink-0" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">{tx.launch}</p>
                      <p className={`text-sm font-semibold tabular-nums shrink-0 ${tx.costCenter === 'Receitas' ? 'text-blue-700' : 'text-gray-900'}`}>
                        {tx.costCenter === 'Receitas' ? '+' : '−'} {formatBRL(tx.amount)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {tx.category} · {tx.dueDate ? `vence ${formatDateBR(tx.dueDate)}` : 'sem vencimento'}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      {statusCell(tx)}
                      {rowActions(tx)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Tela media em diante: tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                    <th className="p-3 pl-4 w-12 text-center">Pago</th>
                    <th className="p-3 min-w-[160px]">Lançamento</th>
                    <th className="p-3">Centro</th>
                    <th className="p-3">Segmento</th>
                    <th className="p-3">Vencimento</th>
                    <th className="p-3">Situação</th>
                    <th className="p-3 text-right">Valor</th>
                    {!readOnly && <th className="p-3 pr-4 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {paginatedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 pl-4 text-center">
                        {tx.costCenter === 'Despesas' ? (
                          paidToggle(tx)
                        ) : (
                          <span className="text-[11px] text-gray-400" title="Receita">—</span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-gray-900">{tx.launch}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            tx.costCenter === 'Receitas' ? 'bg-blue-50 text-blue-800' : 'bg-orange-50 text-orange-800'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${tx.costCenter === 'Receitas' ? 'bg-series-1' : 'bg-series-2'}`} aria-hidden />
                          {tx.costCenter === 'Receitas' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-500 max-w-[180px] truncate">{tx.category}</td>
                      <td className="p-3 text-xs text-gray-600 tabular-nums">{formatDateBR(tx.dueDate) || '—'}</td>
                      <td className="p-3">{statusCell(tx)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-gray-900">{formatBRL(tx.amount)}</td>
                      {!readOnly && <td className="p-3 pr-4">{rowActions(tx)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="bg-slate-50 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 text-xs text-gray-500">
          <span>
            {filteredTransactions.length} {filteredTransactions.length === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
            {formatBRL(filteredTransactions.reduce((acc, t) => acc + (t.costCenter === 'Receitas' ? t.amount : -t.amount), 0))} de saldo
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setCurrentPage(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 font-semibold cursor-pointer"
              >
                Anterior
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setCurrentPage(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 font-semibold cursor-pointer"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
