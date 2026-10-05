import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { AppStatus, Transaction } from '../types';
import { filterPersonalTransactions } from '../utils/finance';

// O servidor ja relê a planilha sozinho; o navegador so pergunta se os dados mudaram.
const POLL_MS = 30000;
// Ao abrir (ou voltar para) a aba do navegador, relê a planilha se a ultima leitura for mais velha que isso.
const SYNC_ON_FOCUS_MAX_AGE_SECONDS = 60;

type Notify = (type: 'success' | 'error', text: string) => void;

export function useFinanceData(notify: Notify) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const versionRef = useRef<string | null>(null);

  const loadTransactions = useCallback(async () => {
    const data = await apiFetch<Transaction[]>('/api/transactions');
    setTransactions(filterPersonalTransactions(data));
  }, []);

  /** Atualiza o status e recarrega os lancamentos so quando a versao dos dados mudou. */
  const refresh = useCallback(
    async (force = false) => {
      try {
        const next = await apiFetch<AppStatus>('/api/status');
        setStatus(next);
        if (force || next.dataVersion !== versionRef.current) {
          await loadTransactions();
          versionRef.current = next.dataVersion;
        }
        setLoadError(null);
        return next;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [loadTransactions],
  );

  /** Pede ao servidor para reler a planilha agora. */
  const syncSheet = useCallback(
    async (options: { maxAgeSeconds?: number; silent?: boolean } = {}) => {
      setSyncing(true);
      try {
        const result = await apiFetch<{ skipped: boolean; changed: boolean; count: number }>('/api/sheets/sync', {
          method: 'POST',
          body: { maxAgeSeconds: options.maxAgeSeconds ?? 0 },
        });
        if (!options.silent) {
          notify('success', result.changed ? `Planilha sincronizada: ${result.count} lançamentos.` : 'Planilha sincronizada, sem mudanças.');
        }
      } catch (err) {
        if (!options.silent) notify('error', err instanceof Error ? err.message : String(err));
      } finally {
        setSyncing(false);
        await refresh();
      }
    },
    [notify, refresh],
  );

  // Primeira carga: dados salvos na hora, e uma leitura da planilha em seguida.
  useEffect(() => {
    refresh(true).then((first) => {
      if (first?.sheets.connected) syncSheet({ maxAgeSeconds: SYNC_ON_FOCUS_MAX_AGE_SECONDS, silent: true });
    });
  }, [refresh, syncSheet]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (status?.sheets.connected) syncSheet({ maxAgeSeconds: SYNC_ON_FOCUS_MAX_AGE_SECONDS, silent: true });
      else refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, syncSheet, status?.sheets.connected]);

  /** Executa uma alteracao; em erro, mostra a mensagem do servidor e recarrega o estado real. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>, successText?: string): Promise<boolean> => {
      try {
        await action();
        if (successText) notify('success', successText);
        await refresh();
        return true;
      } catch (err) {
        notify('error', err instanceof Error ? err.message : String(err));
        await refresh(true);
        return false;
      }
    },
    [notify, refresh],
  );

  const sheetConnected = !!status?.sheets.connected;

  const togglePaid = useCallback(
    (item: Transaction) => {
      const paid = !item.paid;
      // Otimista: o check muda na hora; gravar na planilha leva um instante.
      setTransactions((prev) => prev.map((t) => (t.id === item.id ? { ...t, paid } : t)));
      return mutate(() => apiFetch(`/api/transactions/${encodeURIComponent(item.id)}`, { method: 'PUT', body: { paid } }));
    },
    [mutate],
  );

  const addItem = useCallback(
    (item: Omit<Transaction, 'id'>) =>
      mutate(
        () => apiFetch('/api/transactions', { method: 'POST', body: item }),
        sheetConnected ? 'Lançamento incluído na planilha.' : 'Lançamento incluído.',
      ),
    [mutate, sheetConnected],
  );

  const updateItem = useCallback(
    (id: string, fields: Partial<Transaction>) =>
      mutate(
        () => apiFetch(`/api/transactions/${encodeURIComponent(id)}`, { method: 'PUT', body: fields }),
        sheetConnected ? 'Alteração gravada na planilha.' : 'Lançamento atualizado.',
      ),
    [mutate, sheetConnected],
  );

  const deleteItem = useCallback(
    (id: string) =>
      mutate(
        () => apiFetch(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        sheetConnected ? 'Linha apagada da planilha.' : 'Lançamento apagado.',
      ),
    [mutate, sheetConnected],
  );

  return {
    transactions,
    status,
    loading,
    loadError,
    syncing: syncing || !!status?.sheets.syncing,
    refresh,
    syncSheet,
    togglePaid,
    addItem,
    updateItem,
    deleteItem,
  };
}
