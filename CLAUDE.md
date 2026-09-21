# Gestor Financeiro — Guia para o Claude

Contexto operacional deste repositorio. Leia antes de propor codigo, investigar bug ou desenhar
feature. O README descreve o produto para quem usa; este arquivo descreve as regras para quem
altera o codigo. Decisoes e motivos estao em [docs/DECISIONS.md](docs/DECISIONS.md);
versionamento e release, em [docs/RELEASE.md](docs/RELEASE.md).

## O que e

App pessoal de controle financeiro: dashboard de receitas/despesas, tabela de lancamentos,
importador de planilha do Google Sheets e notificacoes diarias no Telegram sobre despesas
pendentes ou vencidas. Uso individual, sem autenticacao.

## Stack e runtime

- React 19 + Vite 6 + Tailwind CSS 4, TypeScript.
- Express serve a API (`server.ts`) e, em desenvolvimento, o Vite em modo middleware; em
  producao, os arquivos estaticos de `dist/`.
- Persistencia em arquivos JSON dentro de `data/` (`transactions.json`, `telegram.json`,
  `notif-logs.json`), criados na primeira execucao. Sem banco de dados.
- Plataforma de desenvolvimento: Windows / PowerShell. Node 22+.

## Comandos

```powershell
npm install
npm run dev      # Express + Vite middleware, porta 3000, HMR
npm run lint     # tsc --noEmit
npm run build    # vite build + esbuild (bundle do servidor) em dist/
npm start        # roda dist/server.cjs
```

## Mapa do codigo

```text
server.ts              Express: API de transacoes e config do Telegram, cron de 30s para o
                        aviso diario, setup do Vite (dev) ou estaticos (producao)
src/
├── App.tsx             estado principal, abas, agregacao de estatisticas
├── types.ts            Transaction, TelegramConfig, GoogleSheetsConfig, DashboardStats
├── data/seed.ts         dados iniciais usados quando data/transactions.json nao existe
├── utils/finance.ts     normalizacao de texto/data/moeda, filtro de despesas de obra
└── components/
    ├── FinanceCharts.tsx        graficos da visao geral
    ├── FinanceTable.tsx         CRUD da tabela de lancamentos
    ├── GoogleSheetsImporter.tsx importacao/colagem de planilha
    └── TelegramConfigPanel.tsx  configuracao e teste do bot
```

## Regras do codigo

1. **`data/` nunca e versionado.** Contem `telegram.json` com o token do bot em texto plano.
   Confirme `git status` antes de qualquer commit que toque area de configuracao.
2. **`filterPersonalTransactions` e generica** (`src/utils/finance.ts`) para preservar o tipo
   de entrada. Ao chama-la sobre uma variavel tipada como `Transaction[]` dentro de um
   fechamento (`useMemo`, `forEach` aninhado), passe o tipo explicito
   (`filterPersonalTransactions<Transaction>(...)`) — sem isso o TypeScript já inferiu o
   generico apenas como o `Pick` da assinatura nesse contexto (`src/App.tsx`), quebrando o
   `npm run lint`.
3. **Datas em ISO (`YYYY-MM-DD`) internamente.** `parseDateToISO`/`formatDateBR` fazem a
   conversao de/para o formato brasileiro na borda (importacao e exibicao).
4. **Horario do cron e o de Brasília** (`America/Sao_Paulo`), calculado a cada 30s em
   `server.ts`; `notif-logs.json` evita reenviar o aviso no mesmo dia.
5. **Nenhum segredo em arquivo versionado.** `.env` fica fora do git; o modelo e
   `.env.example`.

## Gates antes de fechar qualquer tarefa de codigo

Sao os mesmos do `.github/workflows/quality.yml`, que roda em PR para `main` e, a cada push
para `main`, dentro do `release.yml`, antes de versionar:

1. `npm run lint`
2. `npm run build`

Nao ha suite de testes automatizados neste projeto ainda. Se mexer em logica de negocio
(`src/utils/finance.ts`, agregacoes de `server.ts`), teste manualmente pelo `npm run dev` antes
de fechar a tarefa.

## Commits, versao e release

- Conventional Commits em portugues, **sem acentos no assunto**: `feat(financas): ...`,
  `fix(telegram): ...`, `refactor(server): ...`, `docs: ...`, `ci: ...`. Escopos usados:
  `financas`, `telegram`, `sheets`, `ui`, `server`, `config`, `deps`, `repo`.
- `fix`/`perf` → patch, `feat` → minor, `BREAKING CHANGE:` no rodape (ou `!`) → major. O resto
  nao muda a versao.
- **Nao edite `version` no `package.json` nem o `CHANGELOG.md` a mao**: o workflow de release
  escreve os dois.
- **Nunca reescreva o historico da `main`** (rebase, amend ou push forcado de algo ja
  publicado). Ver [docs/RELEASE.md](docs/RELEASE.md).
- Nunca adicionar trailer de coautoria de IA nos commits.
- Commit e push so quando o usuario pedir.

## Armadilhas conhecidas

- `npm run dev` cria `data/` na primeira chamada de `loadTransactions`/`loadTelegramConfig`; se
  o diretorio nao existir, `server.ts` o cria (`fs.mkdirSync`).
- `@google/genai`, `GEMINI_API_KEY` e `APP_URL` foram removidos por nao serem usados (residuo
  do template do AI Studio) — ver [docs/DECISIONS.md](docs/DECISIONS.md). Se uma feature de IA
  for adicionada, reintroduza a dependencia e documente a variavel em `.env.example`.
- `costCenter` so tem dois valores validos (`'Despesas'` | `'Receitas'`); `normalizeCostCenter`
  em `finance.ts` decide o valor na importacao a partir de texto livre da planilha.
