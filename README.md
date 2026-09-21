# Gestor Financeiro

Controle pessoal de gastos: acompanhe o que ja foi pago e o que falta, importe lancamentos de
uma planilha do Google Sheets e receba avisos diarios no Telegram sobre despesas pendentes ou
vencidas.

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
- **Importar planilha:** cola dados do Google Sheets e substitui a base de lancamentos.
- **Telegram:** configura token do bot e chat ID; envia um resumo diario automatico no horario
  configurado, alem de permitir testar e disparar manualmente.

## Variaveis de ambiente

Veja `.env.example`. `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` tambem podem ser configurados
pela propria interface (aba "Notificacoes do Telegram"), que grava em `data/telegram.json` -
por isso essa pasta nunca deve ser versionada (ja esta no `.gitignore`).

## Versionamento

A versao e gerada automaticamente a partir das mensagens de commit (Conventional Commits) a
cada push para `main`. Nao edite `version` no `package.json` nem o `CHANGELOG.md` a mao -
detalhes em [docs/RELEASE.md](docs/RELEASE.md).
