# Peptide Tracker

Diário pessoal de protocolos, doses, peso, medidas, fotos e estoque de frascos. App web instalável (PWA) para celular.

- **Só registro**: não recomenda substância, dose ou protocolo, não vende nada. Uso para maiores de 18 anos.
- **Sem conta e sem servidor**: tudo fica no aparelho (IndexedDB). Backup é um arquivo que a pessoa exporta e importa.
- **Funciona sem internet** depois da primeira abertura.
- Avisos de dose: chegam com o app aberto ou aberto há pouco; com o app fechado, o app gera um arquivo de agenda (.ics) que o celular avisa sempre.

## Rodar no computador

Precisa de Node 22.22 ou mais novo (ver `.nvmrc`).

```bash
npm ci
npm test          # testes das contas, agenda, backup e dos bugs corrigidos
npm run build     # checa tipos e gera dist/
npm run pages     # serve o dist/ como o GitHub Pages: http://localhost:4180/peptide-tracker/
npm run e2e       # teste de ponta a ponta no dist/ (usa o Google Chrome instalado)
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
- `src/sw.ts` service worker (offline e abrir o app ao tocar no aviso)
- `AUDITORIA.md` o que foi revisado, corrigido e o que ficou como limitação
