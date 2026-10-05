import { Transaction } from '../src/types';
import {
  computeStats,
  defaultPeriod,
  filterByPeriod,
  filterPersonalTransactions,
  formatBRL,
  formatMonthLabel,
  getUpcomingDue,
} from '../src/utils/finance';

// O Telegram recusa mensagem acima de 4096 caracteres; a lista de vencimentos e cortada antes.
const MAX_LISTED_ITEMS = 25;

/**
 * O relatorio usa parse_mode HTML, e nao Markdown: no Markdown, um "_" ou "*" no nome de um
 * lancamento vindo da planilha quebra o parse e o Telegram recusa a mensagem inteira.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTelegramMessage(botToken: string, chatId: string, html: string): Promise<boolean> {
  if (!botToken || !chatId) {
    console.error('Telegram keys missing: token or chat ID is empty');
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error('Telegram API error:', await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error calling Telegram API:', error);
    return false;
  }
}

export interface PendingReport {
  html: string;
  upcomingCount: number;
  amount: number;
}

/**
 * Despesas em aberto vencidas ou com vencimento nos proximos 7 dias (fuso de Brasilia), mais o
 * resumo do mes corrente — ou geral, quando a planilha nao tem lancamento datado neste mes.
 */
export function compilePendingReport(allTransactions: Transaction[], note?: string | null): PendingReport {
  const transactions = filterPersonalTransactions<Transaction>(allTransactions);
  const upcoming = getUpcomingDue(transactions, 7);
  const amount = upcoming.reduce((acc, { item }) => acc + item.amount, 0);

  let html = '<b>📅 CONTAS+ FÁCIL - AVISOS DIÁRIOS</b>\n\n';

  if (upcoming.length > 0) {
    html += `Olá! Você tem <b>${upcoming.length}</b> despesa(s) vencida(s) ou vencendo nos próximos 7 dias:\n\n`;
    upcoming.slice(0, MAX_LISTED_ITEMS).forEach(({ item, daysUntilDue }) => {
      const label = daysUntilDue < 0 ? '⚠️ <b>ATRASADO</b>' : daysUntilDue === 0 ? '⏰ <b>HOJE</b>' : `⏳ em ${daysUntilDue}d`;
      const [, month, day] = item.dueDate.split('-');
      html += `• <b>${escapeHtml(item.launch)}</b> - ${formatBRL(item.amount)} [Vence ${day}/${month} - ${label}]\n`;
    });
    if (upcoming.length > MAX_LISTED_ITEMS) {
      html += `… e mais ${upcoming.length - MAX_LISTED_ITEMS} despesa(s).\n`;
    }
    html += `\n💰 <b>Total a desembolsar com estes avisos:</b> ${formatBRL(amount)}\n`;
  } else {
    html += '🎉 Olá! Não há nenhuma despesa vencida ou com vencimento nos próximos 7 dias. Tudo em dia!\n';
  }

  const period = defaultPeriod(transactions);
  const stats = computeStats(filterByPeriod(transactions, period));
  const title = period === 'todos' ? 'Resumo geral' : `Resumo de ${formatMonthLabel(period)}`;

  html += `\n📊 <b>${title}:</b>
✅ Despesas pagas: ${formatBRL(stats.totalPaid)}
⏳ Despesas pendentes: ${formatBRL(stats.totalPending)}
💼 Receitas: ${formatBRL(stats.totalIncome)}
💵 Saldo estimado: ${formatBRL(stats.netBalance)}`;

  if (note) html += `\n\n<i>${escapeHtml(note)}</i>`;

  return { html, upcomingCount: upcoming.length, amount };
}
