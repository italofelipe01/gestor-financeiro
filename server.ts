import express, { Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { AppStatus, TelegramConfig, Transaction } from './src/types';
import {
  APP_TIME_ZONE,
  filterPersonalTransactions,
  getTodayISO,
  parseCurrencyBR,
  parseDateToISO,
} from './src/utils/finance';
import {
  getAccessToken,
  getServiceAccountStatus,
  parseServiceAccount,
  removeServiceAccount,
  saveServiceAccount,
} from './server/google-auth';
import {
  addMissingColumns,
  appendTransactionToSheet,
  connectSheet,
  deleteTransactionInSheet,
  disconnectSheet,
  getSheetsErrorStatus,
  getSheetsStatus,
  isAutoSyncDue,
  isSheetConnected,
  onCredentialsChanged,
  sheetsErrorMessage,
  syncNow,
  updateSheetSettings,
  updateTransactionInSheet,
} from './server/sheets-sync';
import {
  addNotifLog,
  buildSampleTransactions,
  getDataVersion,
  loadNotifLogs,
  loadSheetsConfig,
  loadTelegramConfig,
  loadTransactions,
  saveTelegramConfig,
  saveTransactions,
} from './server/storage';
import { PendingReport, compilePendingReport, sendTelegramMessage } from './server/telegram';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// 0.0.0.0 deixa abrir o app pelo celular na mesma rede. O app nao tem login: em rede que
// nao e sua, use HOST=127.0.0.1.
const HOST = process.env.HOST || '0.0.0.0';

// Colagem manual de planilha grande passa facil do limite padrao de 100 KB.
app.use(express.json({ limit: '2mb' }));

function sendError(res: Response, err: unknown) {
  const status = getSheetsErrorStatus(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: sheetsErrorMessage(err) });
}

type TransactionInput = Omit<Transaction, 'id' | 'source'>;

/** Normaliza o corpo de criacao/edicao. Campo ausente mantem o valor atual (edicao parcial). */
function sanitizeTransactionInput(body: any, current?: Transaction): TransactionInput {
  const input = body ?? {};
  const base: TransactionInput = current ?? {
    launch: 'Novo Item',
    costCenter: 'Despesas',
    category: 'Geral',
    amount: 0,
    paid: false,
    dueDate: getTodayISO(),
    paymentDate: null,
  };

  const paid = input.paid !== undefined ? !!input.paid : base.paid;
  let paymentDate: string | null = null;
  if (paid) {
    paymentDate = input.paymentDate
      ? parseDateToISO(input.paymentDate, '') || getTodayISO()
      : base.paymentDate || getTodayISO();
  }

  return {
    launch: input.launch !== undefined ? String(input.launch).trim() || base.launch : base.launch,
    costCenter: input.costCenter !== undefined ? (input.costCenter === 'Receitas' ? 'Receitas' : 'Despesas') : base.costCenter,
    category: input.category !== undefined ? String(input.category).trim() || 'Geral' : base.category,
    amount:
      input.amount !== undefined
        ? Math.abs(typeof input.amount === 'number' ? input.amount : parseCurrencyBR(input.amount)) || 0
        : base.amount,
    paid,
    // Vazio e valido: lancamento sem vencimento.
    dueDate: input.dueDate !== undefined ? parseDateToISO(input.dueDate, '') : base.dueDate,
    paymentDate,
  };
}

const MANUAL_IMPORT_BLOCKED =
  'Com uma planilha conectada, ela e a fonte dos lancamentos: uma importacao manual seria apagada na proxima sincronizacao. Desconecte a planilha para importar por colagem.';

// 0. Estado geral (o navegador consulta periodicamente para saber se precisa recarregar)
app.get('/api/status', (req, res) => {
  const status: AppStatus = {
    dataVersion: getDataVersion(),
    sheets: getSheetsStatus(),
    serviceAccount: getServiceAccountStatus(),
  };
  res.json(status);
});

// 1. Transactions CRUD
// Com planilha conectada no modo API, criar/editar/apagar grava na planilha. No link publico
// (somente leitura) essas rotas recusam, porque a proxima sincronizacao desfaria a alteracao.
app.get('/api/transactions', (req, res) => {
  res.json(loadTransactions());
});

app.post('/api/transactions', async (req, res) => {
  const item = sanitizeTransactionInput(req.body);

  if (isSheetConnected()) {
    try {
      return res.json(await appendTransactionToSheet(item));
    } catch (err) {
      return sendError(res, err);
    }
  }

  const list = loadTransactions();
  const newItem: Transaction = { ...item, id: 'tx-' + Math.random().toString(36).substring(2, 11) };
  list.push(newItem);
  saveTransactions(list);
  res.json(newItem);
});

// Import entire dataset (CSV or bulk edit)
app.post('/api/transactions/import', (req, res) => {
  if (isSheetConnected()) return res.status(409).json({ error: MANUAL_IMPORT_BLOCKED });

  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Formato inválido. Esperado um array de transações.' });
  }

  const formatted: Transaction[] = filterPersonalTransactions(
    items.map((t, idx) => ({
      ...sanitizeTransactionInput({ ...t, launch: t?.launch || 'Sem nome', category: t?.category || 'Outros', dueDate: t?.dueDate ?? '' }),
      id: typeof t?.id === 'string' && t.id ? t.id : 'tx-import-' + idx + '-' + Math.random().toString(36).substring(2, 7),
    })),
  );

  saveTransactions(formatted);
  res.json({ success: true, count: formatted.length, data: formatted });
});

// Reset database back to Initial User Seed
app.post('/api/transactions/reset', (req, res) => {
  if (isSheetConnected()) return res.status(409).json({ error: MANUAL_IMPORT_BLOCKED });
  const sample = buildSampleTransactions();
  saveTransactions(sample);
  res.json({ success: true, count: sample.length, data: sample });
});

app.put('/api/transactions/:id', async (req, res) => {
  const list = loadTransactions();
  const idx = list.findIndex((t) => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Transação não encontrada. Os dados podem ter sido atualizados pela planilha.' });
  }

  const current = list[idx];
  const updated: Transaction = { ...current, ...sanitizeTransactionInput(req.body, current) };

  if (isSheetConnected()) {
    try {
      return res.json(await updateTransactionInSheet(current, updated));
    } catch (err) {
      return sendError(res, err);
    }
  }

  list[idx] = updated;
  saveTransactions(list);
  res.json(updated);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const list = loadTransactions();
  const current = list.find((t) => t.id === req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Transação não encontrada. Os dados podem ter sido atualizados pela planilha.' });
  }

  if (isSheetConnected()) {
    try {
      await deleteTransactionInSheet(current);
      return res.json({ success: true });
    } catch (err) {
      return sendError(res, err);
    }
  }

  saveTransactions(list.filter((t) => t.id !== current.id));
  res.json({ success: true });
});

// 2. Telegram Configuration
app.get('/api/telegram/config', (req, res) => {
  res.json(loadTelegramConfig());
});

app.post('/api/telegram/config', (req, res) => {
  const oldConfig = loadTelegramConfig();
  const dailyTime = typeof req.body.dailyTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.dailyTime)
    ? req.body.dailyTime
    : oldConfig.dailyTime;
  const newConfig: TelegramConfig = {
    botToken: req.body.botToken !== undefined ? String(req.body.botToken).trim() : oldConfig.botToken,
    chatId: req.body.chatId !== undefined ? String(req.body.chatId).trim() : oldConfig.chatId,
    dailyTime,
    enabled: typeof req.body.enabled === 'boolean' ? req.body.enabled : oldConfig.enabled,
  };
  saveTelegramConfig(newConfig);
  res.json(newConfig);
});

/**
 * Com planilha conectada, o relatorio relê a planilha antes (salvo leitura de menos de 1 min):
 * o aviso das 9h reflete a planilha mesmo que ninguem tenha aberto o app.
 */
async function buildDailyReport(): Promise<PendingReport> {
  let note: string | null = null;
  if (isSheetConnected()) {
    try {
      await syncNow({ maxAgeSeconds: 60 });
    } catch (err) {
      const lastSyncAt = loadSheetsConfig()?.lastSyncAt;
      const when = lastSyncAt
        ? ` de ${new Date(lastSyncAt).toLocaleString('pt-BR', { timeZone: APP_TIME_ZONE, dateStyle: 'short', timeStyle: 'short' })}`
        : '';
      note = `Não consegui ler a planilha agora (${sheetsErrorMessage(err)}). Valores da última sincronização${when}.`;
    }
  }
  return compilePendingReport(loadTransactions(), note);
}

// Send a test message
app.post('/api/telegram/test', async (req, res) => {
  const config = loadTelegramConfig();
  const token = req.body.botToken || config.botToken;
  const chat = req.body.chatId || config.chatId;

  if (!token || !chat) {
    return res.status(400).json({ error: 'Configuração do Telegram incompleta. Preencha o Token do Bot e Chat ID.' });
  }

  const testMessage = '🔔 <b>Teste de Notificação - Contas+ Fácil</b>\n\nOlá! Seu bot de finanças está funcionando perfeitamente. O aplicativo está conectado e programado para te avisar sobre as próximas contas.';

  const ok = await sendTelegramMessage(token, chat, testMessage);
  if (ok) {
    res.json({ success: true, message: 'Mensagem de teste enviada com sucesso!' });
  } else {
    res.status(500).json({ error: 'Erro ao enviar notificação. Verifique se o Token e Chat ID estão corretos e o bot foi iniciado (/start) por você no Telegram.' });
  }
});

// Force compile and preview / send the current pending report
app.post('/api/telegram/notify-now', async (req, res) => {
  const config = loadTelegramConfig();
  const token = req.body.botToken || config.botToken;
  const chat = req.body.chatId || config.chatId;

  if (!token || !chat) {
    return res.status(400).json({ error: 'Configuração do Telegram inadequada. Forneça o Token do Bot e Chat ID.' });
  }

  const report = await buildDailyReport();
  const ok = await sendTelegramMessage(token, chat, report.html);
  if (ok) {
    res.json({ success: true, message: 'Relatório diário disparado com sucesso!', report: report.html });
  } else {
    res.status(500).json({ error: 'Erro no disparo da notificação de finanças. Verifique suas credenciais e logs.', report: report.html });
  }
});

// Endpoint to view the formatted report text on-screen (HTML do Telegram: so <b> e <i>)
app.get('/api/telegram/preview-report', (req, res) => {
  res.json({ report: compilePendingReport(loadTransactions()).html });
});

// 3. Google Sheets connection
app.get('/api/sheets/config', (req, res) => {
  res.json(loadSheetsConfig());
});

app.get('/api/sheets/status', (req, res) => {
  res.json(getSheetsStatus());
});

// Com `sheetUrl`, conecta (ou troca) a planilha e ja le; sem, ajusta abas/intervalo.
app.post('/api/sheets/config', async (req, res) => {
  try {
    const { error } =
      req.body.sheetUrl !== undefined
        ? await connectSheet(String(req.body.sheetUrl || ''))
        : await updateSheetSettings({ tabs: req.body.tabs, autoSyncMinutes: req.body.autoSyncMinutes });
    res.json({ status: getSheetsStatus(), error });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/sheets/config', (req, res) => {
  disconnectSheet();
  res.json({ success: true });
});

// Le a planilha e substitui os lancamentos. A planilha e a fonte da verdade:
// sincronizar sobrescreve o que estiver salvo, e nao mescla.
app.post('/api/sheets/sync', async (req, res) => {
  try {
    const result = await syncNow({ maxAgeSeconds: Number(req.body?.maxAgeSeconds) || 0 });
    res.json({ success: true, ...result, dataVersion: getDataVersion(), status: getSheetsStatus() });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/sheets/add-columns', async (req, res) => {
  try {
    const added = await addMissingColumns();
    res.json({ success: true, added, status: getSheetsStatus() });
  } catch (err) {
    sendError(res, err);
  }
});

// Conta de servico: a chave privada entra aqui e nunca volta para o navegador.
app.get('/api/sheets/service-account', (req, res) => {
  res.json(getServiceAccountStatus());
});

app.post('/api/sheets/service-account', async (req, res) => {
  let credentials;
  try {
    credentials = parseServiceAccount(req.body?.json ?? req.body);
    // Pede um token antes de salvar: chave revogada ou de outro tipo falha ja aqui.
    await getAccessToken(credentials);
  } catch (err) {
    return res.status(400).json({ error: sheetsErrorMessage(err) });
  }

  saveServiceAccount(credentials);
  onCredentialsChanged();

  let error: string | null = null;
  if (isSheetConnected()) {
    try {
      await syncNow();
    } catch (err) {
      error = sheetsErrorMessage(err);
    }
  }
  res.json({ serviceAccount: getServiceAccountStatus(), status: getSheetsStatus(), error });
});

app.delete('/api/sheets/service-account', (req, res) => {
  removeServiceAccount();
  onCredentialsChanged();
  if (isSheetConnected()) {
    syncNow().catch((err) => console.error('Sheets sync after removing service account failed:', sheetsErrorMessage(err)));
  }
  res.json({ serviceAccount: getServiceAccountStatus() });
});


// 4. BACKGROUND SCHEDULER
// A cada 30s: sincroniza a planilha quando passou o intervalo configurado e confere se e hora
// do aviso diario do Telegram.

function brasiliaNow(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

const TELEGRAM_RETRY_MS = 10 * 60000;
let telegramSending = false;
let telegramLastFailureAt = 0;

async function runScheduler() {
  if (isAutoSyncDue()) {
    syncNow().catch((err) => console.error('Automatic Sheets sync failed:', sheetsErrorMessage(err)));
  }

  const config = loadTelegramConfig();
  if (!config.enabled || !config.botToken || !config.chatId || telegramSending) return;
  if (Date.now() - telegramLastFailureAt < TELEGRAM_RETRY_MS) return;

  // ">=" e nao "===": se o servidor estava desligado ou ocupado no minuto exato, o aviso do
  // dia sai assim que ele voltar, em vez de pular o dia. O log impede o envio duplicado.
  const { date, time } = brasiliaNow();
  if (time < config.dailyTime || loadNotifLogs().includes(date)) return;

  telegramSending = true;
  try {
    console.log(`Triggering daily automatic Telegram report at ${time} (BRT)...`);
    const report = await buildDailyReport();
    if (await sendTelegramMessage(config.botToken, config.chatId, report.html)) {
      addNotifLog(date);
      console.log(`Daily automatic Telegram report successfully sent to Chat ID ${config.chatId}`);
    } else {
      telegramLastFailureAt = Date.now();
      console.error(`Failed to send background automatic Telegram report for ${date}; retrying in 10 minutes`);
    }
  } finally {
    telegramSending = false;
  }
}

setInterval(() => {
  runScheduler().catch((err) => console.error('Scheduler error:', err));
}, 30000);



// Vite Setup (and serving production client static assets)
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server started on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    // Primeira leitura da planilha (e aviso atrasado do dia, se houver) sem esperar 30s.
    runScheduler().catch((err) => console.error('Scheduler error:', err));
  });
}

setupVite();
