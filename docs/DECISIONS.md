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
