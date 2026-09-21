import { useState, useMemo, FormEvent } from 'react';
import { Transaction } from '../types';
import { Search, Plus, Filter, CheckCircle, XCircle, Trash2, Edit2, X, DollarSign, Calendar, Tag, Layers, CheckSquare, Square } from 'lucide-react';
import { formatDateBR, getTodayISO } from '../utils/finance';

interface FinanceTableProps {
  transactions: Transaction[];
  onTogglePaid: (id: string, currentPaid: boolean) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (item: Omit<Transaction, 'id'>) => void;
  onUpdateItem: (id: string, item: Partial<Transaction>) => void;
}

export default function FinanceTable({
  transactions,
  onTogglePaid,
  onDeleteItem,
  onAddItem,
  onUpdateItem,
}: FinanceTableProps) {
  // UI states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'todos' | 'receitas' | 'despesas' | 'pagas' | 'pendentes'>('todos');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Add Item states
  const [newItem, setNewItem] = useState({
    launch: '',
    costCenter: 'Despesas' as 'Despesas' | 'Receitas',
    category: '',
    amount: '',
    dueDate: getTodayISO(),
    paid: false,
  });

  // Unique categories for auto-suggestions inside form
  const categoriesList = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.category))).filter(Boolean).sort();
  }, [transactions]);

  // Combined search and filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Search matching
      const matchesSearch =
        t.launch.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase());

      // Type matching
      let matchesFilter = true;
      if (filterType === 'receitas') matchesFilter = t.costCenter === 'Receitas';
      else if (filterType === 'despesas') matchesFilter = t.costCenter === 'Despesas';
      else if (filterType === 'pagas') matchesFilter = t.costCenter === 'Despesas' && t.paid;
      else if (filterType === 'pendentes') matchesFilter = t.costCenter === 'Despesas' && !t.paid;

      return matchesSearch && matchesFilter;
    });
  }, [transactions, searchTerm, filterType]);

  // paginated results
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const resetAddForm = () => {
    setNewItem({
      launch: '',
      costCenter: 'Despesas',
      category: '',
      amount: '',
      dueDate: getTodayISO(),
      paid: false,
    });
    setShowAddForm(false);
  };

  const handleAddNewItemSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newItem.launch.trim() || !newItem.amount) return;

    onAddItem({
      launch: newItem.launch.trim(),
      costCenter: newItem.costCenter,
      category: newItem.category.trim() || 'Geral',
      amount: parseFloat(newItem.amount) || 0,
      paid: newItem.paid,
      dueDate: newItem.dueDate,
      paymentDate: newItem.paid ? newItem.dueDate : null,
    });

    resetAddForm();
  };

  const handleUpdateItemSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.launch.trim() || !editingItem.amount) return;

    onUpdateItem(editingItem.id, {
      launch: editingItem.launch.trim(),
      costCenter: editingItem.costCenter,
      category: editingItem.category.trim() || 'Geral',
      amount: parseFloat(editingItem.amount.toString()) || 0,
      paid: editingItem.paid,
      dueDate: editingItem.dueDate,
      paymentDate: editingItem.paid ? (editingItem.paymentDate || getTodayISO()) : null,
    });

    setEditingItem(null);
  };

  // formatting currency helper
  const fmt = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6" id="finance-table-view">
      {/* Search, Filter menu & Add Button */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="w-full text-sm border border-gray-200/80 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 bg-slate-50/20"
            placeholder="Pesquisar por descrição ou categoria..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Filter tabs */}
          <div className="inline-flex rounded-lg bg-gray-100 p-1 text-xs">
            <button
              onClick={() => { setFilterType('todos'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterType === 'todos' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => { setFilterType('receitas'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterType === 'receitas' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Receitas
            </button>
            <button
              onClick={() => { setFilterType('despesas'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterType === 'despesas' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Despesas
            </button>
            <button
              onClick={() => { setFilterType('pagas'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterType === 'pagas' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Pagas
            </button>
            <button
              onClick={() => { setFilterType('pendentes'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterType === 'pendentes' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Pendentes
            </button>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-xl transition duration-150 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Adicionar Novo
          </button>
        </div>
      </div>

      {/* Inline Form block: Add Item */}
      {showAddForm && (
        <div className="bg-white p-6 rounded-2xl border border-dashed border-indigo-200 shadow-md transform transition-all duration-200">
          <div className="flex justify-between items-center pb-4 mb-4 border-b border-gray-150">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
              <Plus className="w-5 h-5 text-indigo-500" />
              Adicionar Lançamento Financeiro
            </h3>
            <button onClick={resetAddForm} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleAddNewItemSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">
                Lançamento
              </label>
              <input
                type="text"
                required
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ex: Aluguel, Supermercado"
                value={newItem.launch}
                onChange={(e) => setNewItem({ ...newItem, launch: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">
                Centro de Custo
              </label>
              <select
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                value={newItem.costCenter}
                onChange={(e) => setNewItem({ ...newItem, costCenter: e.target.value as 'Despesas' | 'Receitas' })}
              >
                <option value="Despesas">Despesas (-)</option>
                <option value="Receitas">Receitas (+)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">
                Segmento / Categoria
              </label>
              <input
                type="text"
                list="add-categories-suggestions"
                required
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ex: Moradia, Alimentação"
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              />
              <datalist id="add-categories-suggestions">
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">
                Expectativa (Valor R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-xs font-bold">R$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="0,00"
                  value={newItem.amount}
                  onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">
                  Vencimento
                </label>
                <input
                  type="date"
                  required
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={newItem.dueDate}
                  onChange={(e) => setNewItem({ ...newItem, dueDate: e.target.value })}
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2 pl-1 select-none text-xs text-gray-650">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    checked={newItem.paid}
                    onChange={(e) => setNewItem({ ...newItem, paid: e.target.checked })}
                  />
                  <span>Já Pago?</span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-5 flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={resetAddForm}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-250 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
              >
                Salvar Lançamento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Editing Item Modal Panel */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-500" />
                Editar Lançamento
              </h3>
              <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateItemSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nome do Item</label>
                  <input
                    type="text"
                    required
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-open focus:outline-none"
                    value={editingItem.launch}
                    onChange={(e) => setEditingItem({ ...editingItem, launch: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Centro de Custo</label>
                  <select
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-open focus:outline-none"
                    value={editingItem.costCenter}
                    onChange={(e) => setEditingItem({ ...editingItem, costCenter: e.target.value as 'Despesas' | 'Receitas' })}
                  >
                    <option value="Despesas">Despesas (-)</option>
                    <option value="Receitas">Receitas (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Categoria / Segmento</label>
                  <input
                    type="text"
                    required
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-open focus:outline-none"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Expectativa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-open focus:outline-none"
                    value={editingItem.amount}
                    onChange={(e) => setEditingItem({ ...editingItem, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Vencimento</label>
                  <input
                    type="date"
                    required
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-open focus:outline-none"
                    value={editingItem.dueDate}
                    onChange={(e) => setEditingItem({ ...editingItem, dueDate: e.target.value })}
                  />
                </div>

                <div className="col-span-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-650 border-gray-300 rounded focus:ring-indigo-505"
                      checked={editingItem.paid}
                      onChange={(e) => setEditingItem({ ...editingItem, paid: e.target.checked })}
                    />
                    <span className="text-xs font-semibold text-gray-700">Declarar este lançamento como Pago / Liquidado</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 hover:bg-slate-50 text-slate-500 border border-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Responsive Ledger List Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/75 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                <th className="p-4 w-12 text-center">Pago</th>
                <th className="p-4 min-w-[150px]">Lançamento</th>
                <th className="p-4">Centro</th>
                <th className="p-4">Segmento de Operação</th>
                <th className="p-4">Vencimento</th>
                <th className="p-4 pr-6 text-right">Expectativa (R$)</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 font-medium whitespace-nowrap">
                    Nenhum lançamento encontrado correspondendo aos termos e filtros buscados.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => {
                  const isExpense = tx.costCenter === 'Despesas';
                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/50 transition duration-150 ${
                        tx.paid && isExpense ? 'bg-emerald-50/5' : ''
                      }`}
                    >
                      {/* Paid Toggle checkbox */}
                      <td className="p-4 text-center">
                        {isExpense ? (
                          <button
                            onClick={() => onTogglePaid(tx.id, tx.paid)}
                            className="p-1 hover:bg-slate-100 rounded-lg text-gray-450 transition"
                            title={tx.paid ? 'Marcar como Pendente' : 'Marcar como Pago'}
                          >
                            {tx.paid ? (
                              <CheckSquare className="w-5 h-5 text-emerald-500 fill-emerald-50" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-300" />
                            )}
                          </button>
                        ) : (
                          <div className="flex items-center justify-center">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" title="Receita sempre considerada quitada"></span>
                          </div>
                        )}
                      </td>

                      {/* Launch Name */}
                      <td className="p-4 font-semibold text-gray-900">
                        <span className="flex flex-col">
                          <span>{tx.launch}</span>
                          {!tx.paid && isExpense && (
                            <span className="inline-block sm:hidden text-[10px] text-rose-500 font-bold uppercase tracking-wider mt-0.5">Falta Pagar</span>
                          )}
                        </span>
                      </td>

                      {/* Cost Center badge */}
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          tx.costCenter === 'Receitas'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tx.costCenter === 'Receitas' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                          {tx.costCenter}
                        </span>
                      </td>

                      {/* Category segment */}
                      <td className="p-4 text-xs font-medium text-gray-500 bg-slate-50/1 p-1 pr-3 max-w-[150px] truncate">
                        {tx.category}
                      </td>

                      {/* Due Date */}
                      <td className="p-4 font-mono text-xs text-cool-600">
                        {formatDateBR(tx.dueDate)}
                      </td>

                      {/* Amount Expectativa */}
                      <td className={`p-4 pr-6 text-right font-bold text-xs ${
                        tx.costCenter === 'Receitas' ? 'text-emerald-600' : 'text-slate-800'
                      }`}>
                        {fmt(tx.amount)}
                      </td>

                      {/* Actions CRUD buttons */}
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingItem(tx)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition duration-150 cursor-pointer"
                            title="Editar lançamento"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteItem(tx.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition duration-150 cursor-pointer"
                            title="Apagar lançamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & pagination */}
        {totalPages > 1 && (
          <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-gray-150">
            <span className="text-xs text-gray-500 font-medium">
              Mostrando página <strong className="text-gray-950 font-semibold">{currentPage}</strong> de <strong className="text-gray-950 font-semibold">{totalPages}</strong> ({filteredTransactions.length} registros filtrados)
            </span>
            <div className="flex items-center gap-1 text-xs">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition duration-150 disabled:opacity-40 font-semibold cursor-pointer"
              >
                Anterior
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition duration-150 disabled:opacity-40 font-semibold cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
