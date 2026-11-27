# Peptide Tracker

Diário pessoal de protocolos, doses, peso, medidas, fotos e estoque de frascos. App web instalável (PWA) para celular.

- **Só registro**: não recomenda substância, dose ou protocolo, não vende nada. Uso para maiores de 18 anos.
- **Sem conta e sem servidor**: tudo fica no aparelho (IndexedDB). Backup é um arquivo que a pessoa envia para si mesma (compartilhar do celular: WhatsApp, e-mail, Drive) ou baixa, e importa depois; o app lembra de fazer.
- **Funciona sem internet** depois da primeira abertura.
- Avisos de dose: chegam com o app aberto ou aberto há pouco; com o app fechado, o app gera um arquivo de agenda (.ics) que o celular avisa sempre.

## Rodar no computador

Precisa de Node 22.22 ou mais novo (ver `.nvmrc`).

```bash
npm ci
npm test          # testes das contas, agenda, backup e dos bugs corrigidos
npm run build     # checa tipos e gera dist/
npm run pages     # serve o dist/ como o GitHub Pages: http://localhost:4180/peptide-tracker/
npm run e2e       # teste de ponta a ponta no dist/ (usa o Google Chrome instalado; perto da meia-noite: E2E_FUSO=America/Noronha)
npm run cores     # mede a regra 60-30-10 (fundo, superfícies, acento, status, protocolo) nas telas principais do dist/
npm run dev       # desenvolvimento (sem modo offline)
```

## Publicar (GitHub Pages)

O workflow `.github/workflows/pages.yml` roda testes, gera o build e publica a cada push na `main`
(ou à mão em Actions → Pages → Run workflow). Na primeira vez: Settings → Pages → Source = **GitHub Actions**.

O site fica em `https://<usuario>.github.io/<repositorio>/`. A pasta vem do nome do repositório
(`BASE_PATH`); o padrão local é `/peptide-tracker/`. Para domínio próprio na raiz, use `BASE_PATH=/`.
Os endereços internos usam `#` (ex.: `.../peptide-tracker/#/hoje`), então recarregar ou abrir um link nunca dá 404.

## Onde está cada coisa

- `src/dominio/` contas puras e testadas: agenda (frequência, ciclo, pausas), reconstituição, saldo e custo, datas, sugestões de nomes, `.ics`
- `src/dados/` única porta para o IndexedDB (Dexie), backup e a validação de arquivos importados
- `src/telas/` telas · `src/ui/` peças visuais · `src/sistema/` avisos, instalação, fotos
- Cores (um tema só, claro): `src/index.css` (`@theme` e `:root`), mesma tabela em `src/dominio/paleta.ts` (e tons dos protocolos em `src/dominio/cores.ts`) para os testes de contraste
- Ícones do app (`public/`): `node tools/gerar-icones.mjs` gera favicon, 192, 512, maskable 512 e apple-touch 180 a partir de um desenho só (usa o Chrome instalado via playwright-core, sem dependência nova)
- `src/sw.ts` service worker (offline e abrir o app ao tocar no aviso)
- `AUDITORIA.md` o que foi revisado, corrigido e o que ficou como limitação
