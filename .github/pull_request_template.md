## O que muda

<!-- Uma ou duas frases. O porque importa mais que o que. -->

## Checklist

- [ ] O titulo segue Conventional Commits (`feat(financas): ...`, `fix(telegram): ...`).
      Num squash merge ele vira o commit e decide a proxima versao.
- [ ] `npm run lint` e `npm run build` passam localmente.
- [ ] Decisao de arquitetura nova? Registrada em `docs/DECISIONS.md`.

Nao edite a versao no `package.json` nem o `CHANGELOG.md`: o workflow de
release escreve os dois.
