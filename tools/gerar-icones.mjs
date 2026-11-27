// Gera os ícones do app (public/) a partir de um desenho só: gota branca sobre azul do acento.
// Usa o Google Chrome já instalado, pelo playwright-core que o projeto já tem (o mesmo do e2e);
// não baixa navegador nem instala nada.
//   node tools/gerar-icones.mjs
// Saída (mesmos arquivos e tamanhos de antes):
//   favicon.svg                 aba do navegador (cantos arredondados)
//   pwa-192.png, pwa-512.png    ícone "any" do manifesto (cantos arredondados, fundo transparente fora)
//   pwa-maskable-512.png        ícone "maskable" (quadrado cheio; a gota cabe no círculo seguro de 80%)
//   apple-touch-icon.png 180    iPhone (quadrado cheio, sem transparência; o iOS arredonda sozinho)
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const AZUL = '#0B5FCC' // acento do tema (src/dominio/paleta.ts); branco sobre ele: 5,9:1
const BRANCO = '#FFFFFF'
const GOTA = 'M32 12 L44 34 A13 13 0 1 1 20 34 Z' // gota: ponta em y=12, base em y=52, centro x=32

/** Desenho em 64×64. `canto`: raio do fundo (0 = quadrado cheio). `escala`: tamanho da gota. */
const desenho = ({ canto, escala }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"${canto ? ` rx="${canto}"` : ''} fill="${AZUL}"/>` +
  `<path d="${GOTA}" fill="${BRANCO}"${escala === 1 ? '' : ` transform="translate(32 32) scale(${escala}) translate(-32 -32)"`}/></svg>`

const ARREDONDADO = desenho({ canto: 14, escala: 1 })
const SAIDAS = [
  { arquivo: 'pwa-192.png', tam: 192, svg: ARREDONDADO, transparente: true },
  { arquivo: 'pwa-512.png', tam: 512, svg: ARREDONDADO, transparente: true },
  { arquivo: 'pwa-maskable-512.png', tam: 512, svg: desenho({ canto: 0, escala: 0.8 }), transparente: false },
  { arquivo: 'apple-touch-icon.png', tam: 180, svg: desenho({ canto: 0, escala: 0.9 }), transparente: false },
]

const pasta = fileURLToPath(new URL('../public/', import.meta.url))
await writeFile(pasta + 'favicon.svg', ARREDONDADO + '\n')
const navegador = await chromium.launch({ channel: process.env.E2E_CANAL ?? 'chrome', headless: true })
try {
  for (const s of SAIDAS) {
    const page = await navegador.newPage({ viewport: { width: s.tam, height: s.tam }, deviceScaleFactor: 1 })
    const svg = s.svg.replace('<svg ', `<svg width="${s.tam}" height="${s.tam}" `)
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
    await page.screenshot({ path: pasta + s.arquivo, omitBackground: s.transparente, clip: { x: 0, y: 0, width: s.tam, height: s.tam } })
    await page.close()
    console.log(`ok ${s.arquivo} ${s.tam}x${s.tam}`)
  }
} finally {
  await navegador.close()
}
console.log('ok favicon.svg')
