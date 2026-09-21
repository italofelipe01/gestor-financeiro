# Versionamento e release

A versao do app nao e escolhida a mao. Ela sai das mensagens de commit, pelo
[semantic-release](https://semantic-release.gitbook.io/), rodando no GitHub Actions a cada
push para `main`.

## O fluxo

```text
PR para main ──► Quality Gate (quality.yml)
                   ├─ Tipos   tsc --noEmit
                   └─ Build   vite build + esbuild (bundle do servidor)

push para main ──► Release (release.yml)
                   ├─ quality: chama quality.yml (o mesmo gate do PR)
                   └─ release: needs quality
                        ├─ checkout com historico e tags, fixado no SHA do push
                        ├─ semantic-release calcula a versao desde a ultima tag
                        ├─ atualiza package.json e CHANGELOG.md
                        ├─ commit "chore(release): vX.Y.Z", tag vX.Y.Z, push
                        └─ publica a GitHub Release
```

O gate nao tem gatilho de push proprio. Um push para `main` o executa uma unica vez, dentro do
Release, e o release so roda se o gate daquele mesmo commit passou.

## Como o numero e decidido

O semantic-release encontra a ultima tag `vX.Y.Z` **alcancavel a partir da `main`** e aplica o
maior incremento encontrado nos commits posteriores a ela:

| Commit | Incremento | Exemplo |
| --- | --- | --- |
| `fix:` / `perf:` | patch | 1.0.0 → 1.0.1 |
| `feat:` | minor | 1.0.1 → 1.1.0 |
| `BREAKING CHANGE:` no rodape, ou `feat!:` | major | 1.1.0 → 2.0.0 |
| `docs`, `chore`, `test`, `ci`, `refactor`, `style`, `build` | nenhum | — |

A quantidade de commits nao soma: dez `fix` geram um unico patch. Commits fora do padrao
Conventional Commits sao ignorados no calculo e no changelog. Sem nenhuma tag anterior (por
exemplo, logo apos este setup), a primeira publicacao sai como `1.0.0`, independente dos tipos
de commit acumulados ate ali.

Num PR com squash merge, o **titulo do PR** vira o commit, e e ele que decide a versao.

## Regras

- **Nao edite `version` no `package.json` nem o `CHANGELOG.md` a mao.** O release escreve os
  dois.
- **Nao reescreva o historico da `main` depois de uma release** (rebase, amend, push forcado).
  A tag passa a apontar para um commit fora da branch, e o release para de publicar (veja
  abaixo).
- Actions sao pinadas por SHA completo, com a versao em comentario. O Dependabot
  (`.github/dependabot.yml`) propoe as atualizacoes num PR semanal.
- O token do workflow so recebe `contents: write` no job de release.
- O release so conhece `main`. Um disparo manual (`workflow_dispatch`) em outra branch nao faz
  nada.

## Conferir antes de empurrar

```bash
git fetch --tags
npx semantic-release --dry-run
```

A saida mostra a versao que sairia, sem publicar nada. `no new version is released` significa
que nenhum commit desde a ultima tag pede incremento.

## Quando a tag sai do historico da `main`

**Sintoma:** ha `fix`/`feat` novos, o workflow roda verde e nada e publicado. Localmente,
`npx semantic-release --dry-run` mostra que a ultima versao ja foi publicada, mesmo havendo
commits novos.

**Causa:** a tag existe, mas o commit dela nao e ancestral da `main` (geralmente por push
forcado ou por uma unificacao de historicos que sobrescreveu o commit de release).

**Diagnostico:**

```bash
git fetch --tags
git merge-base --is-ancestor "vX.Y.Z^{commit}" main; echo $?   # 1 = tag fora da main
```

**Correcao:** mover a tag para o commit da `main` com a mesma arvore da versao publicada
(compare com `git rev-parse <commit>^{tree}`), mantendo-a anotada se ja era:

```bash
git tag -f -a vX.Y.Z <commit> -m "vX.Y.Z"
git push --force origin vX.Y.Z
```

Isso e acao do usuario: o Claude so propoe, nunca move ou forca push de tag sem pedido
explicito.
