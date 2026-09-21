import { useState, useEffect } from 'react';
import { TelegramConfig } from '../types';
import { Send, Settings, Bell, CheckCircle2, AlertCircle, Eye, RefreshCw, Smartphone } from 'lucide-react';

export default function TelegramConfigPanel() {
  const [configs, setConfigs] = useState<TelegramConfig>({
    botToken: '',
    chatId: '',
    dailyTime: '09:00',
    enabled: false,
  });

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewReport, setPreviewReport] = useState<string>('');

  // Fetch configs on load
  useEffect(() => {
    fetchConfigs();
    fetchPreview();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/telegram/config');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      }
    } catch (e) {
      console.error('Error fetching telegram configurations:', e);
    }
  };

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/telegram/preview-report');
      if (res.ok) {
        const data = await res.json();
        setPreviewReport(data.report || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveConfigs = async (updatedValue?: Partial<TelegramConfig>) => {
    setLoading(true);
    setStatusMsg(null);
    const bodyToSubmit = { ...configs, ...updatedValue };
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSubmit),
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
        setStatusMsg({ type: 'success', text: 'Configurações salvas e programadas com sucesso!' });
        fetchPreview(); // Refresh preview text in case numbers changed
      } else {
        setStatusMsg({ type: 'error', text: 'Erro ao salvar configurações.' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Não foi possível salvar as configurações no servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTestBot = async () => {
    setTesting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: configs.botToken,
          chatId: configs.chatId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ type: 'success', text: '🎉 WhatsApp/Telegram: Mensagem de teste enviada com sucesso! Verifique seu app.' });
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Erro desconhecido ao testar bot do Telegram.' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Erro de comunicação ao disparar o teste.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSendReportNow = async () => {
    setNotifying(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/telegram/notify-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: configs.botToken,
          chatId: configs.chatId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ type: 'success', text: '🚀 Alerta de despesas diárias enviado com sucesso para o Telegram!' });
        if (data.report) setPreviewReport(data.report);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Erro ao despachar alerta.' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Erro ao conectar-se com o servidor de disparo.' });
    } finally {
      setNotifying(false);
    }
  };

  // Simple Markdown interpreter for mock card rendering
  const renderMockTelegramText = (text: string) => {
    if (!text) return 'Carregando estrutura de texto...';
    // replacement rules for basic bold and inline bullet icons
    let html = text
      .split('\n')
      .map(line => {
        let l = line;
        // Bold formatting
        l = l.replace(/\*(.*?)\*/g, '<strong class="font-semibold text-white">$1</strong>');
        // Bullet style
        if (l.trim().startsWith('•')) {
          l = `<div class="pl-2 flex items-start gap-1 text-slate-300"><span>•</span><span>${l.substring(1)}</span></div>`;
        } else {
          l = `<div>${l}</div>`;
        }
        return l;
      })
      .join('\n');

    return <div className="space-y-1 font-sans text-xs sm:text-sm text-slate-100 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="space-y-8" id="telegram-panel-view">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Left column: Setup fields */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Configurar Notificação do Telegram</h2>
              <p className="text-xs text-gray-500">Receba boletins das contas a pagar diretamente no seu chat</p>
            </div>
          </div>

          {/* Feedback message banner */}
          {statusMsg && (
            <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
              statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-800 border border-rose-100'
            }`}>
              {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
              <span className="font-medium">{statusMsg.text}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Token do Bot do Telegram
              </label>
              <input
                type="text"
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-mono text-xs"
                placeholder="Ex: 5123456789:ABCdefGhIJKlmNoPQRstuVwxyZ"
                value={configs.botToken}
                onChange={(e) => setConfigs({ ...configs, botToken: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Criado conversando com o <a href="https://t.me/BotFather" target="_blank" className="underline text-indigo-500 font-medium">@BotFather</a> no Telegram (comando `/newbot`).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Seu Chat ID do Telegram
              </label>
              <input
                type="text"
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 font-mono text-xs"
                placeholder="Ex: 876543210 (ou ID do grupo com sinal negativo)"
                value={configs.chatId}
                onChange={(e) => setConfigs({ ...configs, chatId: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Consiga seu Chat ID enviando qualquer mensagem para o bot <a href="https://t.me/userinfobot" target="_blank" className="underline text-indigo-500 font-medium">@userinfobot</a>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Horário do Envio Diário
                </label>
                <input
                  type="time"
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800"
                  value={configs.dailyTime}
                  onChange={(e) => setConfigs({ ...configs, dailyTime: e.target.value })}
                />
              </div>

              <div className="flex flex-col justify-end pb-1.5">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Ativar Alertas Diários
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={configs.enabled}
                    onChange={(e) => handleSaveConfigs({ enabled: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-3 text-xs font-semibold text-gray-600">
                    {configs.enabled ? 'Notificações Ativas' : 'Notificações Desativadas'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={() => handleSaveConfigs()}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm px-4 py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-1.5 disabled:opacity-55 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              {loading ? 'Salvando...' : 'Salvar Configs'}
            </button>

            <button
              onClick={handleTestBot}
              disabled={testing || !configs.botToken || !configs.chatId}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs sm:text-sm px-4 py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4 text-slate-500" />
              {testing ? 'Testando...' : 'Enviar Teste'}
            </button>

            <button
              onClick={handleSendReportNow}
              disabled={notifying || !configs.botToken || !configs.chatId}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium text-xs sm:text-sm px-4 py-2.5 rounded-xl transition duration-150 border border-emerald-150 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-emerald-600" />
              {notifying ? 'Enviando...' : 'Disparar Relatório'}
            </button>
          </div>
        </div>

        {/* Right column: Blueprint / Live Mock Telegram Screen */}
        <div className="lg:col-span-2 space-y-4 flex flex-col justify-between">
          
          {/* Instructions Box */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/65">
            <h4 className="font-semibold text-slate-800 text-xs sm:text-sm mb-2 uppercase tracking-wide">Como conectar seu celular?</h4>
            <ol className="text-xs text-slate-600 space-y-2.5 list-decimal pl-4">
              <li>Clique no link <a href="https://t.me/BotFather" target="_blank" className="text-indigo-600 font-medium underline">@BotFather</a> no Telegram, inicie-o e mande o comando <code className="bg-white px-1.5 py-0.5 rounded border font-mono">/newbot</code>. Defina nome e apelido para obter o <strong>Token</strong>.</li>
              <li>Acesse <a href="https://t.me/userinfobot" target="_blank" className="text-indigo-600 font-medium underline">@userinfobot</a> no Telegram, mande no chat dele para descobrir o seu número <strong>Chat ID</strong>.</li>
              <li>Preencha os dados à esquerda, salve e aperte <strong>Enviar Teste</strong> para validar!</li>
              <li>Lembre-se de primeiro iniciar o seu próprio bot recém-criado tocando no botão <strong>Começar (/start)</strong> nele, para que ele tenha autorização de mandar mensagens para você!</li>
            </ol>
          </div>

          {/* Simulated Mobile Mock Client Card displaying report */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col relative overflow-hidden flex-1 min-h-[300px]" id="simulated-telegram-phone">
            
            {/* Phone header bezel */}
            <div className="flex justify-between items-center text-slate-400 text-[10px] font-mono border-b border-slate-800/80 pb-2.5 mb-3 px-1">
              <span className="flex items-center gap-1 font-sans">
                <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                Telegram Mockup
              </span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchPreview} 
                  disabled={previewLoading}
                  className="p-1 hover:text-white transition duration-150 rounded"
                  title="Atualizar texto do relatório"
                >
                  <RefreshCw className={`w-3 h-3 ${previewLoading ? 'animate-spin' : ''}`} />
                </button>
                <span>Sinal ●●●●</span>
              </div>
            </div>

            {/* Bubble layout simulating Telegram chat */}
            <div className="flex-1 flex flex-col justify-end space-y-3">
              <div className="bg-indigo-600 text-white text-[10px] self-center px-3 py-1 rounded-full font-medium drop-shadow-xs mb-1">
                Hoje, {configs.dailyTime}h
              </div>

              {/* Chat bubble body */}
              <div className="bg-[#182533] border border-[#202E3E] text-slate-200 rounded-2xl rounded-tr-none px-4 py-3 max-w-[92%] self-end relative shadow-md">
                {renderMockTelegramText(previewReport)}
                <div className="text-right text-[10px] text-slate-400 mt-2 font-mono">
                  {configs.dailyTime} ✔✔
                </div>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-500 font-mono mt-3.5 border-t border-slate-800/80 pt-2 shrink-0">
              Visualização prévia do conteúdo do boletim
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
