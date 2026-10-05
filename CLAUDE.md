# Contas+ Fácil — Guia para o Claude

Contexto operacional deste repositorio. Leia antes de propor codigo, investigar bug ou desenhar
feature. O README descreve o produto para quem usa; este arquivo descreve as regras para quem
altera o codigo. Decisoes e motivos estao em [docs/DECISIONS.md](docs/DECISIONS.md);
versionamento e release, em [docs/RELEASE.md](docs/RELEASE.md).

## O que e

App pessoal de controle financeiro alimentado por uma planilha do Google Sheets: o servidor le a
planilha sozinho (link publico, somente leitura, ou Google Sheets API com conta de servico,
leitura e escrita), o dashboard acompanha e um aviso diario vai para o Telegram com as despesas
vencidas ou a vencer. Uso individual, sem autenticacao.

O nome de exibicao e **Contas+ Fácil**. O slug tecnico (`package.json` `name`, diretorio e
repositorio no GitHub) continua `gestor-financeiro` — nao renomeie um sem o outro sem motivo,
porque `repository.url` do `package.json` e o que o semantic-release usa.

## Stack e runtime

- React 19 + Vite 6 + Tailwind CSS 4, TypeScript.
- Express serve a API (`server.ts`) e, em desenvolvimento, o Vite em modo middleware; em
  producao, os arquivos estaticos de `dist/`.
- Google Sheets API v4 e OAuth da conta de servico por `fetch` puro, com o JWT assinado pelo
  `crypto` do Node. Sem `googleapis`/`google-auth-library`.
- Persistencia em arquivos JSON dentro de `data/` (`transactions.json`, `telegram.json`,
  `sheets.json`, `notif-logs.json`, `google-service-account.json`), criados na primeira
  execucao. Sem banco de dados.
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
server.ts              Express: rotas da API e agendador de 30s (sincronizacao automatica da
                        planilha + aviso diario do Telegram); setup do Vite (dev) ou estaticos
server/
├── storage.ts           leitura/escrita atomica dos JSON de data/, dataVersion, dados de exemplo
├── telegram.ts          relatorio diario em HTML (texto da planilha escapado) e envio
├── google-auth.ts       chave da conta de servico (validar, salvar, status) e token OAuth (JWT)
├── sheets-api.ts        cliente minimo da Sheets API v4 (metadados, batchGet, update, batchUpdate)
└── sheets-sync.ts       leitura (API ou export CSV), sincronizacao, status e escrita na planilha
src/
├── App.tsx             abas, filtro de periodo, toasts, cabecalho com status da sincronizacao
├── api.ts              fetch da API propria com erro do servidor como exception
├── hooks/useFinanceData.ts  dados, polling de /api/status, sync ao abrir/focar, mutacoes
├── types.ts            Transaction (+ source na planilha), configs, SheetsStatus, AppStatus
├── data/seed.ts         dados de exemplo (trazidos para o mes corrente ao semear)
├── utils/finance.ts     texto/data/moeda, periodo (mes), estatisticas, vencimentos, filtro de obra
├── utils/spreadsheet.ts parser CSV/TSV e de linhas tipadas da API, cabecalho -> colunas,
│                        URLs do Sheets; usado pela colagem (cliente) e pela sincronizacao (servidor)
└── components/
    ├── Dashboard.tsx            cartoes, medidor, vencimentos, graficos da visao geral
    ├── FinanceCharts.tsx        medidor, barras por categoria, colunas mes a mes
    ├── UpcomingDue.tsx          proximos vencimentos e o selo de situacao (DueBadge)
    ├── FinanceTable.tsx         tabela/cartoes de lancamentos, formulario e edicao
    ├── GoogleSheetsImporter.tsx aba Planilha (compoe os paineis de components/sheets/)
    ├── sheets/                  conexao, conta de servico, colagem manual
    ├── SyncStatusBadge.tsx      selo de sincronizacao do cabecalho
    ├── Toasts.tsx               avisos no lugar de alert()
    └── TelegramConfigPanel.tsx  configuracao, teste e previa do bot
```

## Regras do codigo

1. **`data/` nunca e versionado.** Contem `telegram.json` com o token do bot e
   `google-service-account.json` com a chave privada do Google, em texto plano. Confirme
   `git status` antes de qualquer commit que toque area de configuracao. A chave privada nunca
   sai do servidor: rotas devolvem so `getServiceAccountStatus()` (e-mail, projeto).
2. **`filterPersonalTransactions` e generica** (`src/utils/finance.ts`) para preservar o tipo
   de entrada. Ao chama-la sobre uma variavel tipada como `Transaction[]` dentro de um
   fechamento (`useMemo`, `forEach` aninhado), passe o tipo explicito
   (`filterPersonalTransactions<Transaction>(...)`) — sem isso o TypeScript já inferiu o
   generico apenas como o `Pick` da assinatura nesse contexto (`src/App.tsx`), quebrando o
   `npm run lint`.
3. **Datas em ISO (`YYYY-MM-DD`) internamente; vazio = sem vencimento.** `parseDateToISO`
   converte na borda (texto BR, serial do Sheets, dia solto "10" = dia 10 do mes corrente) e
   devolve `''` quando nao reconhece — nunca "hoje", que faria toda conta sem data vencer todo
   dia. `filterByPeriod` conta lancamento sem data em todos os meses; `getUpcomingDue` o ignora.
4. **Horario e o de Brasília** (`APP_TIME_ZONE`). O agendador roda a cada 30s em `server.ts`;
   o aviso sai quando `hora >= dailyTime` e o dia ainda nao esta em `notif-logs.json` (se o
   servidor estava fora no minuto exato, sai quando ele volta). Falha de envio espera 10 min.
5. **Nenhum segredo em arquivo versionado.** `.env` fica fora do git; o modelo e
   `.env.example`.
6. **O servidor nunca busca uma URL vinda do cliente.** A sincronizacao extrai o id da
   planilha com `extractSpreadsheetId` e monta a URL de export com `buildCsvExportUrl` (ou o
   caminho da Sheets API). Fazer `fetch(req.body.sheetUrl)` transformaria a rota num proxy
   aberto (SSRF). Pelo mesmo motivo, `getAccessToken` usa o endpoint OAuth fixo e ignora o
   `token_uri` do JSON da chave.
7. **O parser de planilha mora em `src/utils/spreadsheet.ts`**, nao dentro do componente:
   colagem manual e sincronizacao precisam concordar sobre como uma linha vira lancamento.
8. **A planilha conectada e a fonte da verdade.** Cada leitura substitui os lancamentos.
   Com planilha conectada, criar/editar/apagar so funciona no modo API (grava na planilha);
   no link publico essas rotas respondem 409 — a alteracao local seria apagada na proxima
   leitura. Importacao por colagem e restauracao de exemplo tambem recusam com planilha
   conectada.
9. **Escrita na planilha (`server/sheets-sync.ts`)**: tudo passa pela fila `withLock`; antes de
   alterar ou apagar, `verifyRow` confere que a linha ainda tem o mesmo lancamento (senao 409 e
   releitura). Grava com `USER_ENTERED`, data em ISO (o Sheets entende em qualquer locale),
   texto iniciado por `= + - @` com apostrofo (senao vira formula) e o "Pago" no formato que a
   coluna ja usa (`paidValues`: checkbox ou texto). Leitura e com `UNFORMATTED_VALUE` +
   `SERIAL_NUMBER`: valor chega como numero e data como serial, sem depender do locale.
10. **Texto da planilha e dado nao confiavel.** O relatorio do Telegram usa `parse_mode: HTML`
    com `escapeHtml` em todo texto vindo da planilha; a previa no navegador e montada como
    elementos React (`renderTelegramHtml`), nunca com `dangerouslySetInnerHTML`.
11. **Nada de container com largura fixa.** Header, `main` e footer usam a utility
   `page-shell` (`src/index.css`), que da largura total com gutter fluido. Nao reintroduza
   `max-w-7xl mx-auto` — era isso que deixava as bordas vazias em tela larga. Grid novo
   comeca em `grid-cols-2` no celular e sobe por breakpoint ate `xl`.

## Gates antes de fechar qualquer tarefa de codigo

Sao os mesmos do `.github/workflows/quality.yml`, que roda em PR para `main` e, a cada push
para `main`, dentro do `release.yml`, antes de versionar:

1. `npm run lint`
2. `npm run build`

Nao ha suite de testes automatizados neste projeto ainda. Se mexer em logica de negocio
(`src/utils/finance.ts`, `src/utils/spreadsheet.ts`, `server/`), teste manualmente pelo
`npm run dev` antes de fechar a tarefa. Para a Sheets API sem credencial real, substitua o
`globalThis.fetch` num script `tsx` que importa `server.ts` e responde por `oauth2.googleapis.com`,
`sheets.googleapis.com` e `docs.google.com` (o JWT pode ser verificado com a chave publica).

`tsconfig.json` nao liga `strict`/`noImplicitAny`, entao `tsc --noEmit` nao acusa parametro ou
retorno implicitamente `any` — só pega erro estrutural real (prop que nao existe, tipo
incompativel). Nao é um gate exaustivo; revise tipos manualmente em codigo novo.

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

- `npm run build` injeta `process.env.NODE_ENV="production"` no bundle do servidor (`--define`
  do esbuild): `npm start` sempre serve o `dist/`, sem depender da variavel no shell (no
  Windows, `NODE_ENV=production npm start` nem funciona). `npm run dev` continua com o Vite.
- `server/storage.ts` cria `data/` ao ser importado, se o diretorio nao existir
  (`fs.mkdirSync`).
- `@google/genai`, `GEMINI_API_KEY` e `APP_URL` foram removidos por nao serem usados (residuo
  do template do AI Studio) — ver [docs/DECISIONS.md](docs/DECISIONS.md). Se uma feature de IA
  for adicionada, reintroduza a dependencia e documente a variavel em `.env.example`.
- Os ids dos lancamentos da planilha sao `sheet-<gid>-<linha>`: estaveis entre leituras, mas
  mudam quando linhas sao inseridas/apagadas acima. Depois de apagar uma linha, o servidor
  rele tudo; o cliente sempre recarrega a lista apos uma alteracao (via `dataVersion`).
- O export CSV publico e `/export?format=csv`, e nao `/gviz/tq`: o gviz escolhe um tipo por
  coluna e zera as celulas que fogem dele. Ver [docs/DECISIONS.md](docs/DECISIONS.md).
- Conta de servico configurada mas sem acesso a planilha: a leitura cai para o link publico
  (se a planilha for publica) com `warning` no status, e o app fica somente leitura.
- `costCenter` so tem dois valores validos (`'Despesas'` | `'Receitas'`); `normalizeCostCenter`
  em `finance.ts` decide o valor na importacao a partir de texto livre da planilha.
- `@types/react`/`@types/react-dom` nao vinham instalados no template original: sem eles,
  todo JSX e prop de componente resolvia como `any` silenciosamente (o editor mostrava dezenas
  de erros TS7016/TS7026 que o `tsc --noEmit` da CLI nao acusava, por `noImplicitAny` estar
  desligado). Ficam fixados no major do `react`/`react-dom` instalado (19.x).
- `src/vite-env.d.ts` (com `/// <reference types="vite/client" />`) tambem faltava: sem ele,
  o editor nao reconhece importacao de `.css` e de outros assets do Vite (`import
  './index.css'` em `src/main.tsx` acusava TS2882). Nao mexa nesse arquivo alem da referencia
  padrao.
