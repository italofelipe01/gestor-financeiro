# Contas+ Fácil

Controle pessoal de gastos alimentado por uma planilha do Google Sheets: você edita a planilha,
o dashboard se atualiza sozinho, e todo dia chega no Telegram o aviso das contas vencidas ou
que vencem nos próximos 7 dias.

> O diretorio e o repositorio continuam com o slug tecnico `gestor-financeiro`; "Contas+ Fácil"
> e o nome de exibicao do produto.

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4, em TypeScript.
- **Backend:** Express, servindo a API e o build do Vite (em desenvolvimento, o proprio Vite
  roda em modo middleware). Fala com a Google Sheets API v4 e com a API do Telegram por
  `fetch`, sem SDK.
- **Dados:** arquivos JSON em `data/` (criados automaticamente na primeira execucao). Sem
  banco de dados externo.

## Rodar localmente

**Pre-requisitos:** Node.js 22+.

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. (Opcional) Copiar `.env.example` para `.env`. Tudo nele tambem pode ser configurado pela
   propria interface:

   ```bash
   cp .env.example .env
   ```

3. Rodar em desenvolvimento (Vite + Express na porta 3000, com HMR):

   ```bash
   npm run dev
   ```

4. Build de producao e execucao:

   ```bash
   npm run build
   npm start
   ```

A sincronizacao automatica e o aviso diario rodam **dentro do servidor**: ele precisa ficar
ligado (num PC que nao desliga, num mini servidor, ou num servico com disco persistente para a
pasta `data/`). Se o servidor estiver desligado no horario do aviso, o aviso do dia sai assim
que ele voltar.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o servidor com Vite em modo middleware (HMR) |
| `npm run lint` | Checagem de tipos (`tsc --noEmit`) |
| `npm run build` | Build do client (Vite) e bundle do servidor (esbuild) em `dist/` |
| `npm start` | Roda o build de producao (`dist/server.cjs`) |
| `npm run clean` | Remove `dist/` |

## Funcionalidades

- **Visao geral:** filtro por mes; cartoes de receitas, despesas, pago, a pagar e saldo;
  medidor de despesas pagas; lista de proximos vencimentos (com "marcar como pago" num clique);
  despesas por categoria; evolucao de receitas x despesas mes a mes (com visao em tabela).
- **Lancamentos:** tabela com busca, filtros (pendentes, atrasadas, pagas...), ordenacao e
  situacao de cada conta; vira lista de cartoes no celular. Com a planilha conectada pela API,
  incluir, editar, marcar como pago e apagar **gravam na planilha**.
- **Planilha conectada:** o app le a planilha sozinho (intervalo configuravel, ao abrir o app e
  antes do aviso do Telegram), mostra quais colunas reconheceu e pode criar as que faltam.
- **Telegram:** resumo diario automatico no horario configurado (de Brasilia), alem de teste e
  disparo manual. O resumo rele a planilha antes de sair.
- **Layout fluido:** a interface ocupa a largura total da tela em qualquer dispositivo.

## Conectar a planilha do Google Sheets

Ha dois modos. Os dois sao gratuitos; o segundo pede uma configuracao unica de uns 5 minutos.

| | Link publico | Google Sheets API (conta de servico) |
| --- | --- | --- |
| Configuracao | Nenhuma | Projeto no Google Cloud + chave JSON |
| Planilha | Compartilhada como "qualquer pessoa com o link" | Privada, compartilhada so com a conta de servico |
| Leitura automatica | Sim | Sim |
| Editar pelo app (pago, incluir, editar, apagar) | Nao - a tabela fica somente leitura | Sim, grava na planilha |
| Varias abas (ex.: uma por mes) | So a aba da URL | Escolhe quais abas ler |
| Criar colunas que faltam | Nao | Sim (com checkbox em "Pago") |

### Modo 1 - link publico (sem configurar nada)

1. No Google Sheets: **Compartilhar > Acesso geral > "Qualquer pessoa com o link" > Leitor**.
2. Copie a URL da planilha (com a aba desejada aberta, para levar o `#gid=`).
3. No app, aba **Planilha**, cole a URL e clique em **Conectar**. A primeira leitura ja acontece.

"Qualquer pessoa com o link" significa que quem tiver a URL consegue ler a planilha.

### Modo 2 - Google Sheets API com conta de servico

1. Crie um projeto em <https://console.cloud.google.com/projectcreate> (gratuito; a Sheets API
   nao cobra e nao pede cartao).
2. Ative a **Google Sheets API** no projeto:
   <https://console.cloud.google.com/apis/library/sheets.googleapis.com>.
3. Em **IAM e administrador > Contas de servico**, crie uma conta de servico (nao precisa de
   papel nenhum). Na conta criada: **Chaves > Adicionar chave > Criar nova chave > JSON**.
4. No app, aba **Planilha > Acesso completo pela Google Sheets API**, envie o arquivo `.json`
   e clique em **Salvar e testar**. (Alternativa: `GOOGLE_APPLICATION_CREDENTIALS` no `.env`
   apontando para o arquivo.)
5. Na planilha, **Compartilhar** com o e-mail da conta de servico (o app mostra e copia) como
   **Editor**. A planilha pode deixar de ser publica.

A chave fica em `data/google-service-account.json` (fora do git) e nunca volta ao navegador.
Contas Google de empresa podem ter a criacao de chaves bloqueada por politica da organizacao;
numa conta pessoal (@gmail.com) funciona.

Se a conta de servico perder o acesso, o app tenta ler pelo link publico e avisa que ficou
somente leitura - o dashboard nao para de atualizar.

### Formato da planilha

Colunas reconhecidas: `Lançamento | Centro de custo | Segmento | Expectativa | Pago |
Vencimento | Pagamento`.

- O **cabecalho** pode estar em qualquer uma das 10 primeiras linhas (titulo acima e ok) e e
  reconhecido por palavra-chave (`Descrição`, `Valor`, `Categoria`, `Status`, `Data`... tambem
  servem). Sem cabecalho reconhecivel, vale a ordem acima.
- So **Lançamento** e **Expectativa** (valor) sao indispensaveis. Coluna ausente vira valor
  padrao: despesa, categoria "Geral", pendente, sem vencimento.
- **Valor:** `R$ 1.234,56`, `1234,56` ou numero. O sinal e ignorado; quem decide se entra ou
  sai e o centro de custo (`Receita`, `Entrada`, `Renda` = receita; o resto e despesa).
- **Pago:** checkbox, ou texto `Sim`/`Pago`/`OK`/`X` (qualquer outra coisa = pendente).
- **Vencimento:** data (`DD/MM/AAAA`, `DD/MM`, ou data do Sheets) ou so o **dia** (`10` ou
  `dia 10`), que vira o dia 10 do mes corrente - bom para contas fixas. Vazio = sem
  vencimento: o lancamento conta em todos os meses e nao entra nos avisos de vencimento. No
  modo link publico a data e lida como aparece na celula, entao a planilha deve estar em
  portugues (Arquivo > Configuracoes > Localidade: Brasil); no modo API isso nao importa.
- Linhas `Total`/`Subtotal` e lancamentos de obra/reforma sao ignorados.
- **Uma aba por mes?** No modo API, marque todas as abas em "Abas lidas". Lancamentos novos
  criados pelo app vao para a primeira aba marcada.

A planilha e a fonte da verdade: cada leitura **substitui** os lancamentos salvos no app.

### Cota gratuita

Cada leitura usa 2 requisicoes da Sheets API (estrutura da planilha + valores de todas as abas
de uma vez); marcar como pago usa 1 leitura de conferencia, 1 escrita e uma releitura de
confirmacao. A cota gratuita e de
300 leituras e 300 escritas por minuto por projeto (60 por usuario) - sincronizar a cada minuto
usa menos de 5% dela.

## Variaveis de ambiente

Veja `.env.example`. `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` tambem podem ser configurados
pela propria interface (aba "Notificacoes do Telegram"), que grava em `data/telegram.json`; a
chave do Google, pela aba "Planilha", em `data/google-service-account.json`. Por isso essa pasta
nunca deve ser versionada (ja esta no `.gitignore`).

| Variavel | Para que serve |
| --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot e chat dos avisos diarios |
| `GOOGLE_APPLICATION_CREDENTIALS` | Caminho da chave JSON da conta de servico (modo API) |
| `PORT`, `HOST` | Porta (padrao 3000) e interface (padrao `0.0.0.0`) do servidor |

O app nao tem login: com `HOST=0.0.0.0`, qualquer aparelho da mesma rede abre o dashboard. Em
rede que nao e sua, use `HOST=127.0.0.1`.

## Versionamento

A versao e gerada automaticamente a partir das mensagens de commit (Conventional Commits) a
cada push para `main`. Nao edite `version` no `package.json` nem o `CHANGELOG.md` a mao -
detalhes em [docs/RELEASE.md](docs/RELEASE.md).
