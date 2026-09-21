import { useState } from 'react';
import { Transaction } from '../types';
import { Table, Upload, Clipboard, CheckCircle2, AlertCircle, RefreshCw, FileText, LayoutGrid } from 'lucide-react';
import {
  filterPersonalTransactions,
  normalizeCostCenter,
  normalizeText,
  parseCurrencyBR,
  parseDateToISO,
  parsePaidStatus,
} from '../utils/finance';

interface GoogleSheetsImporterProps {
  onImportSuccess: (importedItems: Transaction[]) => void;
  currentCount: number;
}

export default function GoogleSheetsImporter({ onImportSuccess, currentCount }: GoogleSheetsImporterProps) {
  const [pasteContent, setPasteContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const splitSpreadsheetRow = (line: string) => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const delimiter = line.includes(';') ? ';' : ',';
    const columns: string[] = [];
    let current = '';
    let quoted = false;

    for (const char of line) {
      if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        columns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    columns.push(current.trim());
    return columns.map((c) => c.replace(/^["']|["']$/g, ''));
  };

  // Parse TSV (Tab-Separated - standard Excel/Google Sheets copy paste) or CSV format
  const handleImport = async (replaceExisting: boolean) => {
    if (!pasteContent.trim()) {
      setStatusMsg({ type: 'error', text: 'Cole os dados da planilha na caixa de texto primeiro.' });
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      // Split into rows
      const lines = pasteContent.split(/\r?\n/);
      const parsedItems: Partial<Transaction>[] = [];
      
      let headerIndices = {
        launch: -1,
        costCenter: -1,
        category: -1,
        amount: -1,
        paid: -1,
        dueDate: -1,
        paymentDate: -1,
      };

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const columns = splitSpreadsheetRow(line);
        const normalizedColumns = columns.map(normalizeText);

        // Identify headers if line index is 0 or contains key words
        const isHeader = normalizedColumns.some(col => 
          col.includes('lanc') ||
          col.includes('centro') ||
          col.includes('segmento') ||
          col.includes('expectativa') ||
          col.includes('valor') ||
          col.includes('venc')
        );

        if (isHeader && parsedItems.length === 0 && index <= 1) {
          columns.forEach((col, idx) => {
            const lower = normalizeText(col);
            if (lower.includes('pagamento') || lower.includes('liquidacao')) headerIndices.paymentDate = idx;
            else if (lower.includes('venc')) headerIndices.dueDate = idx;
            else if (lower === 'pago' || lower === 'paga' || lower.includes('status')) headerIndices.paid = idx;
            else if (lower.includes('lanç') || lower.includes('lanc') || lower.includes('desc') || lower.includes('item')) headerIndices.launch = idx;
            else if (lower.includes('centro') || lower.includes('custo') || lower.includes('tipo')) headerIndices.costCenter = idx;
            else if (lower.includes('seg') || lower.includes('oper') || lower.includes('cat')) headerIndices.category = idx;
            else if (lower.includes('expe') || lower.includes('val') || lower.includes('quant')) headerIndices.amount = idx;
          });
          return; // Skip processing header row as an item
        }

        // Fallback guess indices if no header detected, or use position mapping
        const colLaunch = headerIndices.launch !== -1 ? headerIndices.launch : 0;
        const colCostCenter = headerIndices.costCenter !== -1 ? headerIndices.costCenter : 1;
        const colCategory = headerIndices.category !== -1 ? headerIndices.category : 2;
        const colAmount = headerIndices.amount !== -1 ? headerIndices.amount : 3;
        const colPaid = headerIndices.paid !== -1 ? headerIndices.paid : 4;
        const colDueDate = headerIndices.dueDate !== -1 ? headerIndices.dueDate : 5;
        const colPaymentDate = headerIndices.paymentDate !== -1 ? headerIndices.paymentDate : 6;

        const launch = columns[colLaunch] || '';
        const costCenterRaw = columns[colCostCenter] || 'Despesas';
        const category = columns[colCategory] || 'Geral';
        const amountRaw = columns[colAmount] || '0';
        const paidRaw = columns[colPaid] !== undefined ? columns[colPaid] : 'não';

        if (!launch) return; // skip empty rows

        const paid = parsePaidStatus(paidRaw);
        const dueDate = parseDateToISO(columns[colDueDate]);
        const paymentDate = paid ? parseDateToISO(columns[colPaymentDate], dueDate) : null;

        parsedItems.push({
          launch,
          costCenter: normalizeCostCenter(costCenterRaw),
          category,
          amount: parseCurrencyBR(amountRaw),
          paid,
          dueDate,
          paymentDate,
        });
      });

      const personalItems = filterPersonalTransactions(parsedItems as Transaction[]);

      if (personalItems.length === 0) {
        setStatusMsg({ type: 'error', text: 'Não foi possível detectar nenhuma linha válida para importação.' });
        setLoading(false);
        return;
      }

      // Fetch existing items if we chose to merge/append
      let finalItems: any[] = [];
      if (!replaceExisting) {
        const res = await fetch('/api/transactions');
        if (res.ok) {
          finalItems = await res.json();
        }
      }

      const mergedList = [...finalItems, ...personalItems];

      // Submit to backend
      const response = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mergedList),
      });

      if (response.ok) {
        const data = await response.json();
        onImportSuccess(data.data);
        const filteredOut = parsedItems.length - personalItems.length;
        setStatusMsg({
          type: 'success',
          text: `Sucesso! ${personalItems.length} itens importados. ${filteredOut} lançamento(s) de obra foram isolados. Registros totais ativos: ${data.count}.`,
        });
        setPasteContent('');
      } else {
        setStatusMsg({ type: 'error', text: 'Ocorreu um erro ao persistir dados no servidor de banco.' });
      }
    } catch (e) {
      console.error(e);
      setStatusMsg({ type: 'error', text: 'Estrutura dos dados colados é incompatível. Tente copiar novamente de forma estruturada.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetToSeed = async () => {
    const isConfirmed = window.confirm(
      'Tem certeza que deseja redefinir o banco de dados? Isso apagará as modificações atuais e voltará à planilha padrão enviada por você (excluindo Despesas de Obra).'
    );
    if (!isConfirmed) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/transactions/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onImportSuccess(data.data);
        setStatusMsg({ type: 'success', text: 'Planilha original restaurada com sucesso!' });
      } else {
        setStatusMsg({ type: 'error', text: 'Erro ao redefinir base de dados.' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Não foi possível contatar o servidor.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="google-sheets-importer-view">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Importar do Google Sheets</h2>
              <p className="text-xs text-gray-500">Substitua ou adicione lançamentos facilmente copiando e colando células</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetToSeed}
              disabled={loading}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-150 font-medium text-xs px-3 py-2 rounded-xl transition duration-150 flex items-center gap-1 cursor-pointer disabled:opacity-55"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar Planilha Original
            </button>
          </div>
        </div>

        {/* Status notice */}
        {statusMsg && (
          <div className={`p-4 rounded-xl flex items-start gap-3 text-sm mb-6 ${
            statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-800 border border-rose-100'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span className="font-medium">{statusMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          
          {/* Paste area (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clipboard className="w-3.5 h-3.5 text-indigo-500" />
                Cole as linhas de sua planilha aqui:
              </label>
              <textarea
                className="w-full h-64 border border-gray-200 rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 placeholder-gray-400 bg-slate-50/50"
                placeholder="Exemplo de colagem:&#10;Feira&#9;Despesas&#9;Alimentação&#9;R$ 40,00&#10;Padaria&#9;Despesas&#9;Alimentação&#9;R$ 150,00&#10;Salário Líquido&#9;Receitas&#9;Renda Principal&#9;R$ 12.000,00"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleImport(true)}
                disabled={loading || !pasteContent.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm px-5 py-2.5 rounded-xl transition duration-150 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Substituir Todo o Banco
              </button>

              <button
                onClick={() => handleImport(false)}
                disabled={loading || !pasteContent.trim()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs sm:text-sm px-5 py-2.5 rounded-xl transition duration-150 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Clipboard className="w-4 h-4" />
                Adicionar aos {currentCount} Itens Atuais
              </button>
            </div>
          </div>

          {/* Guidelines info area (2 cols) */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                <LayoutGrid className="w-4 h-4 text-indigo-600" />
                Instruções de Formatação
              </h3>
              <p className="text-xs text-indigo-900 leading-relaxed">
                Você pode copiar diretamente as células do seu <strong>Planilhas Google (Google Sheets)</strong> ou Excel e colá-las aqui. Nosso motor inteligente irá ler as colunas.
              </p>
              
              <div className="text-[11px] text-indigo-955 space-y-1 bg-white p-3 rounded-xl border border-indigo-100">
                <span className="font-bold block text-gray-700">A ordem sugerida das colunas:</span>
                <p className="font-mono text-[10px] text-gray-600">
                  Lançamento | Centro de custo | Segmento | Expectativa
                </p>
              </div>

              <div className="text-[11px] text-indigo-955 space-y-1 border-t border-indigo-100/70 pt-2">
                <span className="font-bold text-indigo-900 block">🛑 Filtro de Segurança Integrado:</span>
                <p className="text-indigo-800">
                  Como solicitado, o app de forma integrada <strong>exclui todas as Despesas de Obra</strong> para evitar misturar lançamentos pessoais e manter os dashboards totalmente focados nas despesas residenciais e receitas.
                </p>
              </div>
            </div>

            {/* Structured Table Mock showing layout */}
            <div className="border border-gray-150 rounded-2xl overflow-hidden text-xs">
              <div className="bg-gray-50 border-b border-gray-150 px-4 py-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="font-semibold text-gray-750">Exemplo da Planilha Aceita</span>
              </div>
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-gray-100/50 text-gray-500 font-bold border-b border-gray-150">
                    <th className="p-2 pl-3">Lançamento</th>
                    <th className="p-2">Centro Custo</th>
                    <th className="p-2">Segmento</th>
                    <th className="p-2 pr-3 text-right">Expectativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-600 font-mono">
                  <tr>
                    <td className="p-2 pl-3 font-sans">Supermercado</td>
                    <td className="p-2">Despesas</td>
                    <td className="p-2">Alimentação</td>
                    <td className="p-2 pr-3 text-right text-red-600">R$ 1.000,00</td>
                  </tr>
                  <tr>
                    <td className="p-2 pl-3 font-sans">Salário Líquido</td>
                    <td className="p-2">Receitas</td>
                    <td className="p-2">Renda Princ.</td>
                    <td className="p-2 pr-3 text-right text-emerald-600">R$ 12.000,00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
