import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { INITIAL_TRANSACTIONS } from './src/data/seed';
import { Transaction, TelegramConfig, GoogleSheetsConfig } from './src/types';
import { filterPersonalTransactions } from './src/utils/finance';
import {
  buildCsvExportUrl,
  extractSheetGid,
  extractSpreadsheetId,
  parseSpreadsheetText,
} from './src/utils/spreadsheet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Prepare the database directory
const DB_DIR = path.join(process.cwd(), 'data');
const TRANSACTIONS_FILE = path.join(DB_DIR, 'transactions.json');
const TELEGRAM_FILE = path.join(DB_DIR, 'telegram.json');
const SHEETS_FILE = path.join(DB_DIR, 'sheets.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Ensure database file loaded or seeded
function loadTransactions(): Transaction[] {
  try {
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading transactions.json, resorting to seed data:', err);
  }
  // Fallback to seed data and write it
  saveTransactions(INITIAL_TRANSACTIONS);
  return INITIAL_TRANSACTIONS;
}

function saveTransactions(data: Transaction[]) {
  try {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to transactions.json:', err);
  }
}

// Telegram Config setup
const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  dailyTime: '09:00',
  enabled: false,
};

function loadTelegramConfig(): TelegramConfig {
  try {
    if (fs.existsSync(TELEGRAM_FILE)) {
      const data = fs.readFileSync(TELEGRAM_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      return {
        botToken: loaded.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: loaded.chatId || process.env.TELEGRAM_CHAT_ID || '',
        dailyTime: loaded.dailyTime || '09:00',
        enabled: typeof loaded.enabled === 'boolean' ? loaded.enabled : false,
      };
    }
  } catch (err) {
    console.error('Error reading telegram.json:', err);
  }
  return DEFAULT_TELEGRAM_CONFIG;
}

function saveTelegramConfig(config: TelegramConfig) {
  try {
    fs.writeFileSync(TELEGRAM_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing telegram.json:', err);
  }
}

// Google Sheets connection
function loadSheetsConfig(): GoogleSheetsConfig | null {
  try {
    if (fs.existsSync(SHEETS_FILE)) {
      return JSON.parse(fs.readFileSync(SHEETS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading sheets.json:', err);
  }
  return null;
}

function saveSheetsConfig(config: GoogleSheetsConfig) {
  try {
    fs.writeFileSync(SHEETS_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing sheets.json:', err);
  }
}

// Log of sent notifications to avoid duplication
const LOGS_FILE = path.join(DB_DIR, 'notif-logs.json');
function loadNotifLogs(): string[] {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}
function addNotifLog(dateStr: string) {
  try {
    const logs = loadNotifLogs();
    if (!logs.includes(dateStr)) {
      logs.push(dateStr);
      // Keep logs to a reasonable size (last 30 days)
      if (logs.length > 30) {
        logs.shift();
      }
      fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
    }
  } catch (e) {}
}

// Function to send telegram message
async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  if (!botToken || !chatId) {
    console.error('Telegram keys missing: token or chat ID is empty');
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Telegram API error:', errText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error calling Telegram API:', error);
    return false;
  }
}

// Compile daily message report
function compilePendingReport(transactions: Transaction[]): { markdown: string; upcomingCount: number; amount: number } {
  // Filters despesas unpaid
  const unpaid = transactions.filter(t => t.costCenter === 'Despesas' && !t.paid);
  
  // Format numbers to BRL
  const fmt = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  let upcomingCount = 0;
  let totalAmount = 0;
  let rowsMarkdown = '';

  // Get current date representation in BRT (America/Sao_Paulo is usually UTC -3)
  // Let's analyze impending payments (due in the next 7 days, or overdue)
  const now = new Date();
  
  // Parse YYYY-MM-DD
  unpaid.forEach(item => {
    dueDate: {
      const parts = item.dueDate.split('-');
      if (parts.length === 3) {
        const dYear = parseInt(parts[0]);
        const dMonth = parseInt(parts[1]) - 1;
        const dDay = parseInt(parts[2]);
        const itemDate = new Date(dYear, dMonth, dDay);
        
        // Calculate diff in days
        const diffTime = itemDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Include if overdue or due within 7 days
        if (diffDays <= 7) {
          upcomingCount++;
          totalAmount += item.amount;
          const label = diffDays < 0 ? '⚠️ *ATRASADO*' : diffDays === 0 ? '⏰ *HOJE*' : `⏳ em ${diffDays}d`;
          const formattedDate = `${parts[2]}/${parts[1]}`;
          rowsMarkdown += `• *${item.launch}* - ${fmt(item.amount)} [Vence ${formattedDate} - ${label}]\n`;
        }
      } else {
        // Fallback for non-standard formats
        upcomingCount++;
        totalAmount += item.amount;
        rowsMarkdown += `• *${item.launch}* - ${fmt(item.amount)} [Vence: ${item.dueDate}]\n`;
      }
    }
  });

  // Global summaries
  const totalPaid = transactions.filter(t => t.costCenter === 'Despesas' && t.paid).reduce((acc, t) => acc + t.amount, 0);
  const totalPending = transactions.filter(t => t.costCenter === 'Despesas' && !t.paid).reduce((acc, t) => acc + t.amount, 0);
  const totalIncome = transactions.filter(t => t.costCenter === 'Receitas').reduce((acc, t) => acc + t.amount, 0);

  let markdown = `*📅 CONTAS+ FÁCIL - AVISOS DIÁRIOS*\n\n`;
  
  if (upcomingCount > 0) {
    markdown += `Olá! Você tem *${upcomingCount}* despesas vencendo em breve ou vencidas que precisam de atenção:\n\n`;
    markdown += rowsMarkdown;
    markdown += `\n💰 *Total a desembolsar com estes avisos:* ${fmt(totalAmount)}\n`;
  } else {
    markdown += `🎉 Olá! Não há nenhuma despesa vencida ou com vencimento nos próximos 7 dias. Tudo em dia!\n`;
  }

  markdown += `\n📊 *Resumo Geral do Mês:*
✅ Despesas Pagas: ${fmt(totalPaid)}
⏳ Despesas Pendentes: ${fmt(totalPending)}
💼 Receitas Totais: ${fmt(totalIncome)}
💵 Saldo Final Estimado: ${fmt(totalIncome - (totalPaid + totalPending))}`;

  return { markdown, upcomingCount, amount: totalAmount };
}

// API Routes

// 1. Transactions CRUD
app.get('/api/transactions', (req, res) => {
  const list = loadTransactions();
  res.json(list);
});

app.post('/api/transactions', (req, res) => {
  const list = loadTransactions();
  const newItem: Transaction = {
    id: 'tx-' + Math.random().toString(36).substr(2, 9),
    launch: req.body.launch || 'Novo Item',
    costCenter: req.body.costCenter === 'Receitas' ? 'Receitas' : 'Despesas',
    category: req.body.category || 'Geral',
    amount: parseFloat(req.body.amount) || 0,
    paid: !!req.body.paid,
    dueDate: req.body.dueDate || new Date().toISOString().split('T')[0],
    paymentDate: req.body.paid ? (req.body.paymentDate || new Date().toISOString().split('T')[0]) : null,
  };
  list.push(newItem);
  saveTransactions(list);
  res.json(newItem);
});

// Import entire dataset (CSV or bulk edit)
app.post('/api/transactions/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Formato inválido. Esperança de array de transações.' });
  }

  // Validate and format items
  const formatted: Transaction[] = items.map((t, idx) => ({
    id: t.id || 'tx-import-' + idx + '-' + Math.random().toString(36).substr(2, 5),
    launch: t.launch || 'Sem nome',
    costCenter: t.costCenter === 'Receitas' ? 'Receitas' : 'Despesas',
    category: t.category || 'Outros',
    amount: parseFloat(t.amount) || 0,
    paid: typeof t.paid === 'boolean' ? t.paid : false,
    dueDate: t.dueDate || new Date().toISOString().split('T')[0],
    paymentDate: t.paymentDate || null,
  }));

  saveTransactions(formatted);
  res.json({ success: true, count: formatted.length, data: formatted });
});

// Reset database back to Initial User Seed
app.post('/api/transactions/reset', (req, res) => {
  saveTransactions(INITIAL_TRANSACTIONS);
  res.json({ success: true, count: INITIAL_TRANSACTIONS.length, data: INITIAL_TRANSACTIONS });
});

app.put('/api/transactions/:id', (req, res) => {
  const list = loadTransactions();
  const idx = list.findIndex(t => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  const current = list[idx];
  const updated: Transaction = {
    ...current,
    launch: req.body.launch !== undefined ? req.body.launch : current.launch,
    costCenter: req.body.costCenter !== undefined ? req.body.costCenter : current.costCenter,
    category: req.body.category !== undefined ? req.body.category : current.category,
    amount: req.body.amount !== undefined ? parseFloat(req.body.amount) : current.amount,
    paid: req.body.paid !== undefined ? !!req.body.paid : current.paid,
    dueDate: req.body.dueDate !== undefined ? req.body.dueDate : current.dueDate,
    paymentDate: req.body.paid ? (req.body.paymentDate || new Date().toISOString().split('T')[0]) : null,
  };

  list[idx] = updated;
  saveTransactions(list);
  res.json(updated);
});

app.delete('/api/transactions/:id', (req, res) => {
  let list = loadTransactions();
  const filtered = list.filter(t => t.id !== req.params.id);
  saveTransactions(filtered);
  res.json({ success: true });
});

// 2. Telegram Configuration
app.get('/api/telegram/config', (req, res) => {
  res.json(loadTelegramConfig());
});

app.post('/api/telegram/config', (req, res) => {
  const oldConfig = loadTelegramConfig();
  const newConfig: TelegramConfig = {
    botToken: req.body.botToken !== undefined ? req.body.botToken : oldConfig.botToken,
    chatId: req.body.chatId !== undefined ? req.body.chatId : oldConfig.chatId,
    dailyTime: req.body.dailyTime || oldConfig.dailyTime,
    enabled: typeof req.body.enabled === 'boolean' ? req.body.enabled : oldConfig.enabled,
  };
  saveTelegramConfig(newConfig);
  res.json(newConfig);
});

// Send a test message
app.post('/api/telegram/test', async (req, res) => {
  const config = loadTelegramConfig();
  const token = req.body.botToken || config.botToken;
  const chat = req.body.chatId || config.chatId;

  if (!token || !chat) {
    return res.status(400).json({ error: 'Configuração do Telegram incompleta. Preencha o Token do Bot e Chat ID.' });
  }

  const testMessage = `🔔 *Teste de Notificação - Contas+ Fácil*\n\nOlá! Seu bot de finanças está funcionando perfeitamente. O aplicativo está conectado e programado para te avisar sobre as próximas contas.`;
  
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

  const transactions = loadTransactions();
  const report = compilePendingReport(transactions);

  const ok = await sendTelegramMessage(token, chat, report.markdown);
  if (ok) {
    res.json({ success: true, message: 'Relatório diário disparado com sucesso!', report: report.markdown });
  } else {
    res.status(500).json({ error: 'Erro no disparo da notificação de finanças. Verifique seus credenciais e logs.', report: report.markdown });
  }
});

// Endpoint to view the formatted report text on-screen
app.get('/api/telegram/preview-report', (req, res) => {
  const transactions = loadTransactions();
  const report = compilePendingReport(transactions);
  res.json({ report: report.markdown });
});

// 3. Google Sheets connection
app.get('/api/sheets/config', (req, res) => {
  res.json(loadSheetsConfig());
});

app.post('/api/sheets/config', (req, res) => {
  const sheetUrl = String(req.body.sheetUrl || '').trim();
  const spreadsheetId = extractSpreadsheetId(sheetUrl);

  if (!spreadsheetId) {
    return res.status(400).json({
      error: 'URL invalida. Cole o endereco completo da planilha, no formato https://docs.google.com/spreadsheets/d/...',
    });
  }

  const existing = loadSheetsConfig();
  const config: GoogleSheetsConfig = {
    sheetUrl,
    spreadsheetId,
    gid: extractSheetGid(sheetUrl),
    // Trocar de planilha invalida o histórico de sincronizacao anterior.
    lastSyncAt: existing?.spreadsheetId === spreadsheetId ? existing.lastSyncAt : null,
    lastSyncCount: existing?.spreadsheetId === spreadsheetId ? existing.lastSyncCount : 0,
  };

  saveSheetsConfig(config);
  res.json(config);
});

app.delete('/api/sheets/config', (req, res) => {
  try {
    if (fs.existsSync(SHEETS_FILE)) fs.unlinkSync(SHEETS_FILE);
  } catch (err) {
    console.error('Error removing sheets.json:', err);
  }
  res.json({ success: true });
});

// Baixa a planilha e substitui os lancamentos. A planilha e a fonte da verdade:
// sincronizar sobrescreve o que estiver salvo, e nao mescla.
app.post('/api/sheets/sync', async (req, res) => {
  const config = loadSheetsConfig();
  if (!config) {
    return res.status(400).json({ error: 'Nenhuma planilha conectada. Informe a URL da planilha primeiro.' });
  }

  // A URL buscada e sempre montada a partir do id ja validado, e nunca a string
  // que veio do cliente: isso impede que a rota vire um proxy para qualquer host.
  const csvUrl = buildCsvExportUrl(config.spreadsheetId, config.gid);

  let csv: string;
  try {
    const response = await fetch(csvUrl, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      return res.status(502).json({
        error: `O Google respondeu ${response.status}. Confirme que a planilha esta compartilhada como "qualquer pessoa com o link pode ver".`,
      });
    }

    csv = await response.text();
  } catch (err) {
    console.error('Error fetching spreadsheet:', err);
    return res.status(502).json({ error: 'Nao foi possivel baixar a planilha. Verifique a conexao e a URL.' });
  }

  // Planilha sem acesso publico devolve a pagina de login (HTML), com status 200.
  if (csv.trimStart().startsWith('<')) {
    return res.status(502).json({
      error: 'A planilha nao esta publica. No Google Sheets, use Compartilhar > "Qualquer pessoa com o link" como Leitor.',
    });
  }

  const parsed = parseSpreadsheetText(csv);
  const personalItems = filterPersonalTransactions(parsed);

  if (personalItems.length === 0) {
    return res.status(422).json({
      error: 'Nenhuma linha valida encontrada na planilha. Confira se as colunas seguem a ordem sugerida.',
    });
  }

  const transactions: Transaction[] = personalItems.map((item, idx) => ({
    ...item,
    id: 'tx-sheet-' + idx + '-' + Math.random().toString(36).substring(2, 7),
  }));

  saveTransactions(transactions);
  saveSheetsConfig({
    ...config,
    lastSyncAt: new Date().toISOString(),
    lastSyncCount: transactions.length,
  });

  res.json({
    success: true,
    count: transactions.length,
    filteredOut: parsed.length - personalItems.length,
    data: transactions,
  });
});


// 4. BACKGROUND CRON JOB LOOPER
// Runs every 30 seconds to check if we should trigger the daily automatic message.
setInterval(async () => {
  const config = loadTelegramConfig();
  if (!config.enabled || !config.botToken || !config.chatId) {
    return;
  }

  // Get current date time in Sao Paulo
  const brtDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = String(brtDate.getHours()).padStart(2, '0');
  const minute = String(brtDate.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${hour}:${minute}`;

  // It's the scheduled time!
  if (currentTimeStr === config.dailyTime) {
    const todayYMD = `${brtDate.getFullYear()}-${String(brtDate.getMonth() + 1).padStart(2, '0')}-${String(brtDate.getDate()).padStart(2, '0')}`;
    const logs = loadNotifLogs();

    if (!logs.includes(todayYMD)) {
      console.log(`Triggering daily automatic Telegram report at ${config.dailyTime} (BRT)...`);
      const transactions = loadTransactions();
      const report = compilePendingReport(transactions);
      
      const success = await sendTelegramMessage(config.botToken, config.chatId, report.markdown);
      if (success) {
        addNotifLog(todayYMD);
        console.log(`Daily automatic Telegram report successfully sent to Chat ID ${config.chatId}`);
      } else {
        console.error(`Failed to send background automatic Telegram report for ${todayYMD}`);
      }
    }
  }
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT}`);
  });
}

setupVite();
