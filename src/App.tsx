import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CalendarRange, FileSpreadsheet, MessageSquareCode, RefreshCw, Sparkles, TableProperties, TrendingUp, AlertCircle } from 'lucide-react';
import Dashboard from './components/Dashboard';
import FinanceTable from './components/FinanceTable';
import GoogleSheetsImporter from './components/GoogleSheetsImporter';
import SyncStatusBadge from './components/SyncStatusBadge';
import TelegramConfigPanel from './components/TelegramConfigPanel';
import Toasts, { Toast } from './components/Toasts';
import { useFinanceData } from './hooks/useFinanceData';
import { Transaction } from './types';
import { Period, computeStats, defaultPeriod, filterByPeriod, formatBRL, formatMonthLabel, listMonths } from './utils/finance';

type Tab = 'visao-geral' | 'lancamentos' | 'planilha' | 'telegram';
const TABS: Tab[] = ['visao-geral', 'lancamentos', 'planilha', 'telegram'];

// A aba fica no endereco (#lancamentos), entao recarregar a pagina nao volta para o inicio.
function tabFromHash(): Tab {
  const hash = window.location.hash.replace('#', '') as Tab;
  return TABS.includes(hash) ? hash : 'visao-geral';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(tabFromHash);
  const [period, setPeriod] = useState<Period | null>(null); // null = automatico (mes atual, se houver dados)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (type: Toast['type'], text: string) => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
      setTimeout(() => dismissToast(id), type === 'error' ? 9000 : 4500);
    },
    [dismissToast],
  );

  const data = useFinanceData(notify);
  const { transactions, status } = data;
  const sheets = status?.sheets ?? null;

  useEffect(() => {
    const onHash = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goTo = (tab: Tab) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };

  const months = useMemo(() => listMonths(transactions), [transactions]);
  const effectivePeriod: Period =
    period && (period === 'todos' || months.includes(period)) ? period : defaultPeriod(transactions);
  const periodTransactions = useMemo(
    () => filterByPeriod(transactions, effectivePeriod),
    [transactions, effectivePeriod],
  );
  const stats = computeStats(periodTransactions);

  // Com planilha conectada, so o modo API grava; no link publico a tabela fica somente leitura.
  const canEdit = !sheets?.connected || sheets.writable;
  const readOnlyReason = canEdit
    ? null
    : sheets?.warning ||
      'A planilha está conectada pelo link público, que é somente leitura: edite direto na planilha e o app atualiza sozinho. Para editar por aqui, configure a conta de serviço na aba Planilha.';
  const writeTarget =
    sheets?.connected && sheets.writable
      ? `na aba "${sheets.tabs[0]?.title ?? 'principal'}" da planilha`
      : null;

  const handleRefresh = () => (sheets?.connected ? data.syncSheet() : data.refresh(true));

  const tabButton = (tab: Tab, icon: ReactNode, label: string, shortLabel: string, alert = false) => (
    <button
      key={tab}
      onClick={() => goTo(tab)}
      role="tab"
      aria-selected={activeTab === tab}
      className={`px-2.5 sm:px-5 py-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition cursor-pointer border-b-2 flex items-center gap-2 ${
        activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >
      <span className="hidden sm:inline-flex">{icon}</span>
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
      {alert && <span className="w-2 h-2 rounded-full bg-status-critical" aria-label="com aviso" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col" id="main-application-view">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="page-shell py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-200 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-none whitespace-nowrap">Contas+ Fácil</h1>
              <span className="text-xs text-indigo-600 font-semibold tracking-wide hidden sm:flex items-center gap-1 mt-1">
                <Sparkles className="w-3 h-3" />
                Planilha inteligente & alertas
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 text-xs font-semibold min-w-0">
            <SyncStatusBadge sheets={sheets} syncing={data.syncing} onOpenSheetTab={() => goTo('planilha')} />
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-gray-500 font-medium">Receitas</span>
              <span className="text-gray-900 font-bold text-sm tabular-nums">{formatBRL(stats.totalIncome)}</span>
            </div>
            <div className="hidden lg:block w-px h-8 bg-gray-200" aria-hidden />
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-gray-500 font-medium">Falta pagar</span>
              <span className="text-gray-900 font-bold text-sm tabular-nums">{formatBRL(stats.totalPending)}</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={data.syncing}
              className="p-2 hover:bg-slate-100 rounded-lg text-gray-500 hover:text-indigo-600 transition disabled:opacity-60 cursor-pointer shrink-0"
              title={sheets?.connected ? 'Ler a planilha agora' : 'Recarregar dados'}
              aria-label={sheets?.connected ? 'Ler a planilha agora' : 'Recarregar dados'}
            >
              <RefreshCw className={`w-4 h-4 ${data.syncing ? 'motion-safe:animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell py-5 sm:py-8 flex-1">
        <nav className="flex border-b border-gray-200 gap-1 overflow-x-auto pb-px mb-5 sm:mb-6" role="tablist" id="layout-categories-tab-rail">
          {tabButton('visao-geral', <TrendingUp className="w-4 h-4" />, 'Visão geral', 'Geral')}
          {tabButton('lancamentos', <TableProperties className="w-4 h-4" />, `Lançamentos (${periodTransactions.length})`, 'Lançamentos')}
          {tabButton(
            'planilha',
            <FileSpreadsheet className="w-4 h-4" />,
            'Planilha Google Sheets',
            'Planilha',
            !!(sheets?.lastError || sheets?.warning),
          )}
          {tabButton('telegram', <MessageSquareCode className="w-4 h-4" />, 'Notificações do Telegram', 'Telegram')}
        </nav>

        {(activeTab === 'visao-geral' || activeTab === 'lancamentos') && transactions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-5 sm:mb-6">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600" htmlFor="period-filter">
              <CalendarRange className="w-4 h-4 text-gray-400" aria-hidden />
              Período
            </label>
            <select
              id="period-filter"
              value={effectivePeriod}
              onChange={(e) => setPeriod(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
              <option value="todos">Todos os meses</option>
            </select>
            <span className="text-xs text-gray-500">
              {periodTransactions.length} de {transactions.length} lançamentos
              {effectivePeriod !== 'todos' && periodTransactions.some((t) => !t.dueDate) ? ' · sem vencimento entram em todo mês' : ''}
            </span>
          </div>
        )}

        {data.loading && transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-100 rounded-2xl shadow-xs">
            <RefreshCw className="w-8 h-8 text-indigo-600 motion-safe:animate-spin mb-3" />
            <p className="text-gray-500 font-medium text-sm">Carregando dados financeiros...</p>
          </div>
        ) : data.loadError && transactions.length === 0 ? (
          <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl text-center flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-600" />
            <p className="text-rose-800 font-bold">{data.loadError}</p>
            <button
              onClick={() => data.refresh(true)}
              className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-xl shadow-md hover:bg-rose-700 transition cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'visao-geral' && (
              <Dashboard
                transactions={periodTransactions}
                allTransactions={transactions}
                period={effectivePeriod}
                onSelectPeriod={setPeriod}
                sheets={sheets}
                canEdit={canEdit}
                onTogglePaid={data.togglePaid}
                onGoTo={goTo}
              />
            )}

            {activeTab === 'lancamentos' && (
              <FinanceTable
                transactions={periodTransactions}
                readOnly={!canEdit}
                readOnlyReason={readOnlyReason}
                editUrl={sheets?.editUrl ?? null}
                writeTarget={writeTarget}
                onTogglePaid={data.togglePaid}
                onDeleteItem={(item: Transaction) => data.deleteItem(item.id)}
                onAddItem={data.addItem}
                onUpdateItem={data.updateItem}
              />
            )}

            {activeTab === 'planilha' && (
              <GoogleSheetsImporter
                status={status}
                syncing={data.syncing}
                currentCount={transactions.length}
                onSync={() => data.syncSheet()}
                onChanged={() => data.refresh(true)}
                notify={notify}
              />
            )}

            {activeTab === 'telegram' && (
              <div className="motion-safe:animate-fade-in">
                <TelegramConfigPanel />
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 py-6 mt-12 bg-white shrink-0">
        <div className="page-shell text-center text-xs text-gray-500 font-medium">
          Contas+ Fácil • Controle financeiro pessoal • {new Date().getFullYear()}
        </div>
      </footer>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
