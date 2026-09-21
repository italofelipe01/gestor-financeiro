import { useState, useEffect, useMemo } from 'react';
import { Transaction, DashboardStats } from './types';
import FinanceCharts from './components/FinanceCharts';
import FinanceTable from './components/FinanceTable';
import GoogleSheetsImporter from './components/GoogleSheetsImporter';
import TelegramConfigPanel from './components/TelegramConfigPanel';
import { filterPersonalTransactions, getTodayISO } from './utils/finance';
import { 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  PlusCircle, 
  TableProperties, 
  MessageSquareCode, 
  Import,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'visao-geral' | 'lancamentos' | 'importar' | 'telegram'>('visao-geral');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch transactions on load
  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(filterPersonalTransactions(data));
      } else {
        setErrorMsg('Erro de comunicação ao carregar transações do servidor.');
      }
    } catch (e) {
      setErrorMsg('Não foi possível conectar-se ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle paid state immediately in backend
  const handleTogglePaid = async (id: string, currentPaid: boolean) => {
    try {
      const target = transactions.find(t => t.id === id);
      if (!target) return;

      const updatedPaidState = !currentPaid;
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid: updatedPaidState,
          paymentDate: updatedPaidState ? getTodayISO() : null
        })
      });

      if (res.ok) {
        const updatedItem = await res.json();
        setTransactions(prev => prev.map(t => t.id === id ? updatedItem : t));
      } else {
        alert('Falha ao atualizar status de pagamento.');
      }
    } catch (err) {
      console.error(err);
      alert('Problema de conectividade ao salvar status.');
    }
  };

  // Delete transaction with confirmation dialog
  const handleDeleteItem = async (id: string) => {
    const item = transactions.find(t => t.id === id);
    if (!item) return;

    const confirmed = window.confirm(`Deseja mesmo apagar o lançamento "${item.launch}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTransactions(prev => prev.filter(t => t.id !== id));
      } else {
        alert('Erro ao excluir lançamento.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add new item to ledger
  const handleAddItem = async (newItem: Omit<Transaction, 'id'>) => {
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      if (res.ok) {
        const created = await res.json();
        setTransactions(prev => [...prev, created]);
      } else {
        alert('Problema ao criar novo lançamento.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update item completely
  const handleUpdateItem = async (id: string, updatedFields: Partial<Transaction>) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        const updated = await res.json();
        setTransactions(prev => prev.map(t => t.id === id ? updated : t));
      } else {
        alert('Erro ao atualizar lançamento.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Bulk update from clipboard copy paste Sheets
  const handleImportSuccess = (importedItems: Transaction[]) => {
    setTransactions(filterPersonalTransactions(importedItems));
  };

  // Compute aggregated financials metrics
  const stats: DashboardStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalPaid = 0;
    let totalPending = 0;

    filterPersonalTransactions<Transaction>(transactions).forEach(t => {
      if (t.costCenter === 'Receitas') {
        totalIncome += t.amount;
      } else if (t.costCenter === 'Despesas') {
        totalExpense += t.amount;
        if (t.paid) {
          totalPaid += t.amount;
        } else {
          totalPending += t.amount;
        }
      }
    });

    return {
      totalIncome,
      totalExpense,
      totalPaid,
      totalPending,
      netBalance: totalIncome - totalExpense
    };
  }, [transactions]);

  // Currency helper formatter BRL
  const fmt = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans" id="main-application-view">
      
      {/* Visual top navigation bar */}
      <header className="bg-white border-b border-gray-150 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          
          {/* Logo brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-md shadow-indigo-200">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-none">Gestor Financeiro</h1>
              <span className="text-xs text-indigo-600 font-semibold tracking-wide flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Planilha Inteligente & Alertas
              </span>
            </div>
          </div>

          {/* Quick Stats banner */}
          <div className="hidden sm:flex items-center gap-6 text-xs font-semibold">
            <div className="flex flex-col items-end">
              <span className="text-gray-400 font-medium">Receitas</span>
              <span className="text-emerald-500 font-bold text-sm">{fmt(stats.totalIncome)}</span>
            </div>
            <div className="w-px h-8 bg-gray-100"></div>
            <div className="flex flex-col items-end">
              <span className="text-gray-400 font-medium">Falta Pagar</span>
              <span className="text-rose-500 font-bold text-sm">{fmt(stats.totalPending)}</span>
            </div>
            <button 
              onClick={fetchTransactions}
              className="p-2 hover:bg-slate-100 rounded-lg text-gray-400 hover:text-indigo-600 transition"
              title="Sincronizar dados"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Container Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tab rail */}
        <div className="flex border-b border-gray-200 gap-1 overflow-x-auto pb-px mb-8" id="layout-categories-tab-rail">
          <button
            onClick={() => setActiveTab('visao-geral')}
            className={`px-5 py-3 text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'visao-geral' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Visão Geral
          </button>

          <button
            onClick={() => setActiveTab('lancamentos')}
            className={`px-5 py-3 text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'lancamentos' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <TableProperties className="w-4 h-4" />
            Controle de Lançamentos ({transactions.length})
          </button>

          <button
            onClick={() => setActiveTab('importar')}
            className={`px-5 py-3 text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'importar' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Import className="w-4 h-4" />
            Importar Planilha Google Sheets
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-5 py-3 text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'telegram' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <MessageSquareCode className="w-4 h-4" />
            Notificações do Telegram
          </button>
        </div>

        {/* Loading / Error States screen layout */}
        {loading && transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-100 rounded-2xl shadow-xs">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
            <p className="text-gray-400 font-medium text-sm">Carregando dados financeiros...</p>
          </div>
        ) : errorMsg ? (
          <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl text-center flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-600" />
            <p className="text-rose-800 font-bold">{errorMsg}</p>
            <button 
              onClick={fetchTransactions}
              className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-xl shadow-md hover:bg-rose-700 transition"
            >
              Tentar Novamente
            </button>
          </div>
        ) : (
          <div>
            {/* TAB 1: VISION GERAL / DASHBOARD VIEWS */}
            {activeTab === 'visao-geral' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Scorecards Rows grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  
                  {/* Card 1: Receitas */}
                  <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Total Receitas</span>
                      <span className="text-base sm:text-lg font-bold text-gray-900">{fmt(stats.totalIncome)}</span>
                    </div>
                  </div>

                  {/* Card 2: Despesas */}
                  <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Total Despesas</span>
                      <span className="text-base sm:text-lg font-bold text-gray-900">{fmt(stats.totalExpense)}</span>
                    </div>
                  </div>

                  {/* Card 3: Já Pago */}
                  <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Apenas Desp. Pagas</span>
                      <span className="text-base sm:text-lg font-bold text-gray-900">{fmt(stats.totalPaid)}</span>
                    </div>
                  </div>

                  {/* Card 4: Falta Pagar */}
                  <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Ainda Falta Pagar</span>
                      <span className="text-base sm:text-lg font-bold text-gray-900 text-yellow-700">{fmt(stats.totalPending)}</span>
                    </div>
                  </div>

                  {/* Card 5: Net Balance */}
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-5 rounded-2xl shadow-sm text-white flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/10 text-indigo-300 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-300 block tracking-wider">Saldo Líquido</span>
                      <span className={`text-base sm:text-lg font-extrabold ${stats.netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(stats.netBalance)}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Dashboard Charts Row */}
                <FinanceCharts transactions={transactions} />

                {/* Info reminder: Telegram Next Alert status details */}
                <div className="bg-slate-100/70 border border-slate-200/50 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-55 text-indigo-600 rounded-xl">
                      <MessageSquareCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">Controle de Alertas Automatizados Diários</h4>
                      <p className="text-xs text-gray-500">Mantenha seu Telegram configurado para mandar avisos todos os dias das contas pendentes e valor de desembolso.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('telegram')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer shrink-0"
                  >
                    Ver Configurações de Notificações
                  </button>
                </div>

              </div>
            )}

            {/* TAB 2: LEDGER TRANSACTIONS LIST */}
            {activeTab === 'lancamentos' && (
              <div className="animate-in fade-in duration-300">
                <FinanceTable
                  transactions={transactions}
                  onTogglePaid={handleTogglePaid}
                  onDeleteItem={handleDeleteItem}
                  onAddItem={handleAddItem}
                  onUpdateItem={handleUpdateItem}
                />
              </div>
            )}

            {/* TAB 3: IMPORT GOOGLE SHEETS */}
            {activeTab === 'importar' && (
              <div className="animate-in fade-in duration-300">
                <GoogleSheetsImporter 
                  onImportSuccess={handleImportSuccess} 
                  currentCount={transactions.length} 
                />
              </div>
            )}

            {/* TAB 4: TELEGRAM INTEGRATION PANELS */}
            {activeTab === 'telegram' && (
              <div className="animate-in fade-in duration-300">
                <TelegramConfigPanel />
              </div>
            )}
          </div>
        )}

      </main>

      {/* Aesthetic human literal margin footer */}
      <footer className="border-t border-gray-150 py-6 mt-16 bg-white shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400 font-medium">
          Gestor Financeiro Pessoal • {new Date().getFullYear()}
        </div>
      </footer>

    </div>
  );
}
