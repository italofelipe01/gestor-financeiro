import { ChangeEvent, useState } from 'react';
import { Copy, ExternalLink, KeyRound, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '../../api';
import { ServiceAccountStatus } from '../../types';

interface ServiceAccountPanelProps {
  serviceAccount: ServiceAccountStatus | null;
  sheetConnected: boolean;
  onChanged: () => Promise<unknown>;
  notify: (type: 'success' | 'error', text: string) => void;
}

const STEPS: { text: string; link?: { href: string; label: string } }[] = [
  {
    text: 'Crie (ou escolha) um projeto no Google Cloud. É gratuito e não pede cartão para usar a Sheets API.',
    link: { href: 'https://console.cloud.google.com/projectcreate', label: 'Criar projeto' },
  },
  {
    text: 'Ative a Google Sheets API nesse projeto.',
    link: { href: 'https://console.cloud.google.com/apis/library/sheets.googleapis.com', label: 'Ativar Sheets API' },
  },
  {
    text: 'Crie uma conta de serviço (nenhum papel é necessário) e, em Chaves › Adicionar chave › JSON, baixe o arquivo.',
    link: { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts', label: 'Contas de serviço' },
  },
  { text: 'Envie o arquivo .json aqui (ou cole o conteúdo) e clique em "Salvar e testar".' },
  { text: 'Na planilha, use Compartilhar e adicione o e-mail da conta de serviço como Editor.' },
];

/**
 * Conta de servico: a forma gratuita de usar a Google Sheets API sem login que expira. Com ela a
 * planilha pode ser privada e o app grava de volta (pago, edicao, inclusao, exclusao).
 */
export default function ServiceAccountPanel({ serviceAccount, sheetConnected, onChanged, notify }: ServiceAccountPanelProps) {
  const [keyJson, setKeyJson] = useState('');
  const [busy, setBusy] = useState(false);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setKeyJson).catch(() => notify('error', 'Não foi possível ler o arquivo.'));
    e.target.value = '';
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ error: string | null }>('/api/sheets/service-account', {
        method: 'POST',
        body: { json: keyJson },
      });
      setKeyJson('');
      if (result.error) notify('error', `Chave salva, mas a leitura falhou: ${result.error}`);
      else notify('success', sheetConnected ? 'Chave salva. A planilha agora é lida e editada pela API.' : 'Chave salva e validada com o Google.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remover a chave da conta de serviço? O app volta a ler a planilha pelo link público, só leitura.')) return;
    setBusy(true);
    try {
      await apiFetch('/api/sheets/service-account', { method: 'DELETE' });
      notify('success', 'Chave removida.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const copyEmail = async () => {
    if (!serviceAccount?.clientEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccount.clientEmail);
      notify('success', 'E-mail copiado. Cole em Compartilhar, na planilha.');
    } catch {
      notify('error', 'Não foi possível copiar; selecione o e-mail e copie manualmente.');
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs" id="google-service-account">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-5">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Acesso completo pela Google Sheets API</h2>
          <p className="text-xs text-gray-500">Opcional e gratuito: planilha privada e edição pelo app gravando na planilha</p>
        </div>
      </div>

      {serviceAccount?.configured ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="w-5 h-5 text-status-good shrink-0" aria-hidden />
            <div className="min-w-0 text-sm text-emerald-950">
              <p className="font-semibold">Conta de serviço configurada{serviceAccount.source === 'env' ? ' (via GOOGLE_APPLICATION_CREDENTIALS)' : ''}</p>
              <p className="text-xs mt-1">Compartilhe a planilha com este e-mail como <strong>Editor</strong>:</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 truncate rounded-lg bg-white border border-emerald-200 px-2 py-1 text-xs select-all">
                  {serviceAccount.clientEmail}
                </code>
                <button
                  onClick={copyEmail}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </button>
              </div>
            </div>
          </div>
          {serviceAccount.source === 'arquivo' && (
            <button
              onClick={handleRemove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:text-rose-900 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover chave
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ol className="space-y-3 text-xs text-gray-700">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-5 h-5 shrink-0 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="leading-relaxed">
                  {step.text}{' '}
                  {step.link && (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {step.link.label}
                      <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div className="space-y-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 cursor-pointer">
              <Upload className="w-4 h-4" aria-hidden />
              Escolher arquivo .json da chave
              <input type="file" accept="application/json,.json" className="sr-only" onChange={handleFile} />
            </label>
            <textarea
              value={keyJson}
              onChange={(e) => setKeyJson(e.target.value)}
              placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'
              aria-label="Conteúdo do arquivo JSON da chave"
              spellCheck={false}
              className="w-full h-32 border border-gray-200 rounded-xl p-3 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 bg-slate-50/60"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={busy || !keyJson.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Validando…' : 'Salvar e testar'}
              </button>
              <span className="text-[11px] text-gray-500">A chave fica só no servidor, em data/ (fora do git), e nunca volta ao navegador.</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
