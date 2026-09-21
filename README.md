# Contas+ Fácil

Controle pessoal de gastos: acompanhe o que ja foi pago e o que falta, importe lancamentos de
uma planilha do Google Sheets e receba avisos diarios no Telegram sobre despesas pendentes ou
vencidas.

> O diretorio e o repositorio continuam com o slug tecnico `gestor-financeiro`; "Contas+ Fácil"
> e o nome de exibicao do produto.

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4, em TypeScript.
- **Backend:** Express, servindo a API e o build do Vite (em desenvolvimento, o proprio Vite
  roda em modo middleware).
- **Dados:** arquivos JSON em `data/` (criados automaticamente na primeira execucao). Sem
  banco de dados externo.

## Rodar localmente

**Pre-requisitos:** Node.js 22+.

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` para `.env` e preencher o token do bot do Telegram (opcional; sem
   ele, a aba de notificacoes fica disponivel mas o envio falha):

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

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o servidor com Vite em modo middleware (HMR) |
| `npm run lint` | Checagem de tipos (`tsc --noEmit`) |
| `npm run build` | Build do client (Vite) e bundle do servidor (esbuild) em `dist/` |
| `npm start` | Roda o build de producao (`dist/server.cjs`) |
| `npm run clean` | Remove `dist/` |

## Funcionalidades

- **Visao geral:** cartoes de receitas, despesas, pago, a pagar e saldo liquido, com graficos.
- **Lancamentos:** CRUD de transacoes (receita ou despesa), com status pago/pendente.
- **Planilha conectada:** aponte a URL da sua planilha do Google Sheets e o app busca os
  lancamentos direto dela (ver abaixo). Tambem da para colar as celulas manualmente.
- **Telegram:** configura token do bot e chat ID; envia um resumo diario automatico no horario
  configurado, alem de permitir testar e disparar manualmente.
- **Layout fluido:** a interface ocupa a largura total da tela em qualquer dispositivo, com
  gutter e tipografia que escalam com a viewport (celular, notebook, monitor 4K ou ultrawide).

## Conectar a planilha do Google Sheets

O app le a planilha pelo export CSV publico do proprio Google — sem API key e sem OAuth. Por
isso a planilha precisa estar compartilhada por link:

1. No Google Sheets: **Compartilhar > Acesso geral > "Qualquer pessoa com o link" > Leitor**.
2. Copie a URL da planilha (se quiser uma aba especifica, copie com a aba aberta, para levar o
   `#gid=`).
3. No app, aba **Importar Planilha Google Sheets > Conectar planilha**, cole a URL e clique em
   **Conectar**.
4. Clique em **Sincronizar agora**. A planilha e a fonte da verdade: sincronizar **substitui**
   os lancamentos salvos, nao mescla.

As colunas esperadas sao `Lançamento | Centro de custo | Segmento | Expectativa | Pago |
Vencimento | Pagamento`. O cabecalho e reconhecido por palavra-chave, entao pequenas variacoes
de nome funcionam; sem cabecalho reconhecivel, vale a ordem acima. Valores em `R$ 1.234,56` e
datas em `DD/MM/AAAA` sao convertidos automaticamente.

A conexao fica em `data/sheets.json` (fora do git). O servidor monta a URL de download a partir
do id da planilha — nunca busca a URL crua enviada pelo navegador, para a rota nao virar um
proxy aberto.

**Privacidade:** "qualquer pessoa com o link" significa que quem tiver a URL consegue ler a
planilha. Se isso nao servir, use a importacao por colagem, que nao exige compartilhamento.

## Variaveis de ambiente

Veja `.env.example`. `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` tambem podem ser configurados
pela propria interface (aba "Notificacoes do Telegram"), que grava em `data/telegram.json` -
por isso essa pasta nunca deve ser versionada (ja esta no `.gitignore`).

## Versionamento

A versao e gerada automaticamente a partir das mensagens de commit (Conventional Commits) a
cada push para `main`. Nao edite `version` no `package.json` nem o `CHANGELOG.md` a mao -
detalhes em [docs/RELEASE.md](docs/RELEASE.md).
