# Registro de decisoes

Decisoes de arquitetura e processo que nao se deduzem do codigo. Cada item traz a escolha, o
motivo, o custo aceito e a regra que resulta dela. Decisao superada nao e apagada: ganha nota
dizendo o que a substituiu.

## 2026-09-21 — Repositorio versionado do zero

**Motivo:** o projeto veio de um export do Google AI Studio sem `.git`. Uma auditoria de
CI/versionamento/documentacao exige historico git.
**Regra:** `git init` com branch `main`; historico comeca no commit `c3d0427` (todo o codigo
existente na epoca).

## 2026-09-21 — semantic-release (JS) no lugar do python-semantic-release

**Motivo:** o repositorio de referencia (`cafe`) usa python-semantic-release, mas este projeto
e Node/TypeScript, sem publicacao em nenhum registry.
**Custo:** `@semantic-release/npm` fica no pipeline so para atualizar a versao no
`package.json` (`npmPublish: false`); nao publica nada no npm.
**Regra:** versao e CHANGELOG gerados a cada push para `main`, processo em
[RELEASE.md](RELEASE.md).

## 2026-09-21 — Dependabot cobre `npm` alem de `github-actions`

**Motivo:** ao contrario do `requirements.txt` do `cafe` (sem lockfile, nada para o Dependabot
propor), este projeto tem `package-lock.json` versionado, entao o ecossistema `npm` tem o que
atualizar mesmo com `^` no `package.json`.
**Regra:** `.github/dependabot.yml` inclui os dois ecossistemas, agrupados, semanais.

## 2026-09-21 — Pasta `data/` fora do controle de versao

**Motivo:** `server.ts` grava `data/telegram.json` com o token do bot e o chat ID configurados
pela interface. Sem essa exclusao, um `git add -A` depois de rodar `npm run dev` versiona a
credencial em texto plano.
**Regra:** `data/` entra no `.gitignore`. Configuracao de exemplo fica em `.env.example`
(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).

## 2026-09-21 — Removida a dependencia `@google/genai`

**Motivo:** resquicio do template do Google AI Studio; nada no codigo importava o pacote, e
`GEMINI_API_KEY`/`APP_URL` nao eram lidos em lugar nenhum.
**Custo:** se uma feature de IA for adicionada no futuro, a dependencia e a variavel de
ambiente precisam voltar.
**Regra:** dependencias e variaveis de ambiente documentadas refletem o que o codigo
efetivamente usa.

## 2026-09-21 — Adicionados `@types/react` e `@types/react-dom`

**Motivo:** o template original nao instalava os tipos do React. `react`/`react-dom` nao
embutem `.d.ts` proprios, entao todo JSX resolvia como `any` silenciosamente — o editor
acusava dezenas de erros (TS7016/TS7026) que o `tsc --noEmit` da CLI nao mostrava, porque o
projeto nao liga `noImplicitAny`.
**Custo:** nenhum erro estrutural novo apareceu ao instalar os tipos (o codigo ja era
consistente); o gate de lint passa a cobrir JSX de verdade dai em diante.
**Regra:** `@types/react`/`@types/react-dom` fixados no major do `react`/`react-dom` (19.x).

## 2026-09-21 — Nome de exibicao "Contas+ Fácil", slug tecnico inalterado

**Motivo:** o produto passou a se chamar Contas+ Fácil. O nome aparece na interface (header,
rodape), no `index.html`, no `metadata.json` e nas mensagens do bot do Telegram.
**Custo:** o nome de exibicao e o slug tecnico divergem. Nao unifiquei porque
`package.json` `name`, o diretorio local e o repositorio no GitHub formam um conjunto: o
`repository.url` do `package.json` e a fonte do `repositoryUrl` do semantic-release, entao
renomear so o `name` criaria inconsistencia sem ganho.
**Regra:** texto visivel ao usuario usa "Contas+ Fácil"; identificador tecnico continua
`gestor-financeiro`.

## 2026-09-21 — Layout fluido no lugar de container de largura fixa

**Motivo:** header, `main` e footer usavam `max-w-7xl mx-auto` (1280px), o que deixava grandes
faixas vazias nas laterais em monitor grande e desperdicava a tela.
**Custo:** em telas muito largas, linhas de texto corrido ficam mais longas que o ideal para
leitura. Aceitavel porque a interface e majoritariamente tabela, cartao e grafico — que se
beneficiam da largura — e nao texto longo.
**Regra:** a utility `page-shell` (`src/index.css`) da largura total com
`padding-inline: clamp(1rem, 2.5vw, 4rem)`, e o `html` tem
`font-size: clamp(16px, 0.15625vw + 14px, 18px)`, de modo que espacamento e tipografia
(medidos em `rem`) escalam junto com a viewport: 16px no celular, ~17px em 1920px, 18px a
partir de 2560px.
