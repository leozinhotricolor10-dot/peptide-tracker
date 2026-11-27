// Mede a regra de cores 60-30-10 nas telas principais (390 × 844): quanto da área visível é fundo,
// superfície (cartões, linhas), texto neutro, acento azul, cores de status e cores de protocolo.
//   npm run build && node tools/medir-cores.mjs [--saida medida.json] [--comparar antes.json] [--capturas pasta --prefixo antes]
// Como mede: abre o build servido como no GitHub Pages, grava um aparelho de exemplo (3 protocolos,
// uma semana de registros, frasco acabando, dose de ontem sem registro, backup atrasado, pesos), tira a
// captura de cada tela e classifica cada pixel pela cor mais próxima da paleta do app (src/dominio/paleta.ts
// e src/dominio/cores.ts). É uma estimativa: a borda suavizada das letras cai na cor mais próxima.
// Não muda nada no projeto; usa o Chrome instalado (playwright-core, como o e2e).
import { writeFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { servir } from './servir-pages.mjs'
import { PALETA } from '../src/dominio/paleta.ts'
import { CORES_PROTOCOLO } from '../src/dominio/cores.ts'

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const SAIDA = arg('saida')
const COMPARAR = arg('comparar')
const CAPTURAS = arg('capturas')
const PREFIXO = arg('prefixo') ?? 'tela'
const FUSO = process.env.E2E_FUSO ?? 'America/Sao_Paulo'

/** Categoria de cada cor da paleta. */
const GRUPOS = {
  fundo: ['fundo'],
  superficie: ['sup', 'sup2', 'linha', 'borda'],
  texto: ['texto', 'fraco', 'suave', 'dica', 'veu'],
  acento: ['acento', 'selecionado', 'acento-escuro'],
  status: ['ok', 'ok-fundo', 'aviso', 'aviso-fundo', 'aviso-texto', 'erro'],
}
const CORES = [
  ...Object.entries(GRUPOS).flatMap(([g, tokens]) => tokens.filter((t) => PALETA[t]).map((t) => ({ g, hex: PALETA[t] }))),
  ...CORES_PROTOCOLO.map((c) => ({ g: 'protocolo', hex: c.hex })),
]
const CATEGORIAS = ['fundo', 'superficie', 'texto', 'acento', 'status', 'protocolo']

// ---------- aparelho de exemplo ----------
const pad = (n) => String(n).padStart(2, '0')
/** Instante (ISO) de um dia e hora no fuso do teste. */
function instante(dia, hora) {
  const palpite = Date.parse(`${dia}T${hora}:00Z`)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(palpite).map((x) => [x.type, x.value]))
  const visto = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)
  return new Date(palpite - (visto - palpite)).toISOString()
}
/** Hoje às 14:00 no fuso do teste (o relógio da página fica parado nesse instante). */
function agoraFixo() {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return { dia, iso: instante(dia, '14:00') }
}
const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const somaDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function aparelho(hoje, tudoFeito) {
  const criado = `${somaDias(hoje, -20)}T10:00:00.000Z`
  const sub = (id, nome) => ({ id, nome, tipo: 'simples', origem: 'usuario', arquivada: false, criadaEm: criado })
  const substancias = [sub('s-bpc', 'BPC-157'), sub('s-ipa', 'Ipamorelin'), sub('s-tb', 'TB-500')]
  const prot = (id, cor) => ({ id, inicio: somaDias(hoje, -20), estado: 'ativo', lembretes: false, criadoEm: criado, cor })
  const protocolos = [prot('p-bpc', 'azul'), prot('p-ipa', 'rosa'), prot('p-tb', 'amarelo')]
  const diasTb = [1, 4] // segunda e quinta
  const itens = [
    { id: 'i-bpc', protocoloId: 'p-bpc', substanciaId: 's-bpc', doseValor: 250, doseUnidade: 'mcg', frequencia: { tipo: 'diaria' }, horarios: ['08:00', '20:00'], frascoId: 'f-bpc', ordem: 0 },
    { id: 'i-ipa', protocoloId: 'p-ipa', substanciaId: 's-ipa', doseValor: 0.3, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['21:00'], frascoId: 'f-ipa', ordem: 0 },
    { id: 'i-tb', protocoloId: 'p-tb', substanciaId: 's-tb', doseValor: 2, doseUnidade: 'mg', frequencia: { tipo: 'semana', dias: diasTb }, horarios: ['09:00'], frascoId: 'f-tb', ordem: 0 },
  ]
  const frascos = [
    { id: 'f-bpc', substanciaId: 's-bpc', mgTotal: 10, status: 'reconstituido', reconstituidoEm: somaDias(hoje, -6), diluenteMl: 2, usarAte: somaDias(hoje, 22), criadoEm: criado, custo: 180 },
    { id: 'f-ipa', substanciaId: 's-ipa', mgTotal: 2, status: 'reconstituido', reconstituidoEm: somaDias(hoje, -5), diluenteMl: 1, usarAte: somaDias(hoje, 23), criadoEm: criado, custo: 120 },
    { id: 'f-tb', substanciaId: 's-tb', mgTotal: 20, status: 'reconstituido', reconstituidoEm: somaDias(hoje, -10), diluenteMl: 2, usarAte: somaDias(hoje, 18), criadoEm: criado, custo: 250 },
  ]
  const aplicacoes = []
  const feita = (it, dia, hora, frasco) => aplicacoes.push({
    id: `a-${it.id}-${dia}-${hora}`, protocoloId: it.protocoloId, itemId: it.id, substanciaId: it.substanciaId, previsto: `${dia} ${hora}`,
    dataHora: instante(dia, hora), doseValor: it.doseValor, doseUnidade: it.doseUnidade, status: 'feita', ...(frasco ? { frascoId: it.frascoId } : {}),
  })
  for (let k = 12; k >= 1; k--) {
    const dia = somaDias(hoje, -k)
    feita(itens[0], dia, '08:00', k <= 5)
    feita(itens[0], dia, '20:00', k <= 5)
    if (k !== 1) feita(itens[1], dia, '21:00', k <= 6) // ontem às 21:00 ficou sem registro
    if (diasTb.includes(diaDaSemana(dia))) feita(itens[2], dia, '09:00', k <= 7)
  }
  feita(itens[0], hoje, '08:00', true)
  if (diasTb.includes(diaDaSemana(hoje))) feita(itens[2], hoje, '09:00', true)
  if (tudoFeito) {
    feita(itens[0], hoje, '20:00', true)
    feita(itens[1], hoje, '21:00', true)
    aplicacoes.forEach((a) => { if (a.previsto?.startsWith(hoje)) a.dataHora = instante(hoje, a.itemId === 'i-ipa' ? '13:50' : '13:40') })
  }
  const medicoes = Array.from({ length: 8 }, (_, k) => ({ id: `m${k}`, data: somaDias(hoje, -28 + k * 4), pesoKg: 84.2 - k * 0.45, medidas: { cintura: 92 - k * 0.4, quadril: 101 - k * 0.2 } }))
  const config = [
    { chave: 'aceite', valor: { versao: '1', em: criado } },
    { chave: 'onboarding', valor: true },
    { chave: 'primeiroUso', valor: somaDias(hoje, -20) },
    { chave: 'ultimoBackup', valor: `${somaDias(hoje, -10)}T12:00:00.000Z` },
  ]
  return { substancias, protocolos, itens, aplicacoes, medicoes, frascos, config }
}

async function gravar(page, dados) {
  await page.evaluate(async (d) => {
    const r = indexedDB.open('peptide-tracker')
    const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
    await new Promise((ok, falha) => {
      const t = db.transaction(Object.keys(d), 'readwrite')
      for (const [tabela, linhas] of Object.entries(d)) {
        t.objectStore(tabela).clear()
        for (const l of linhas) t.objectStore(tabela).put(l)
      }
      t.oncomplete = ok
      t.onerror = () => falha(t.error)
    })
    db.close()
  }, dados)
}

// ---------- classificação dos pixels ----------
async function classificar(page, png) {
  return page.evaluate(async ([b64, cores, cats]) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const cv = new OffscreenCanvas(img.width, img.height)
    const cx = cv.getContext('2d', { willReadFrequently: true })
    cx.drawImage(img, 0, 0)
    const px = cx.getImageData(0, 0, img.width, img.height).data
    const tabela = cores.map((c) => ({ g: c.g, r: parseInt(c.hex.slice(1, 3), 16), v: parseInt(c.hex.slice(3, 5), 16), b: parseInt(c.hex.slice(5, 7), 16) }))
    const conta = Object.fromEntries(cats.map((c) => [c, 0]))
    const cache = new Map()
    let total = 0
    for (let i = 0; i < px.length; i += 4) {
      const chave = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
      let g = cache.get(chave)
      if (!g) {
        let melhor = Infinity
        for (const c of tabela) {
          const d = (c.r - px[i]) ** 2 + (c.v - px[i + 1]) ** 2 + (c.b - px[i + 2]) ** 2
          if (d < melhor) { melhor = d; g = c.g }
        }
        cache.set(chave, g)
      }
      conta[g]++
      total++
    }
    return Object.fromEntries(cats.map((c) => [c, (100 * conta[c]) / total]))
  }, [png.toString('base64'), CORES, CATEGORIAS])
}

// ---------- telas ----------
const { url: BASE, fechar } = await servir(4198)
const navegador = await chromium.launch({ channel: process.env.E2E_CANAL ?? 'chrome', headless: true })
const resultado = { quando: new Date().toISOString(), telas: {} }

async function abrirAparelho(tudoFeito) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: FUSO, reducedMotion: 'reduce', serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const { dia, iso } = agoraFixo()
  await page.clock.setFixedTime(new Date(iso))
  await page.goto(BASE)
  await page.waitForURL(/#\/boas-vindas$/)
  await gravar(page, aparelho(dia, tudoFeito))
  await page.goto(BASE + '#/hoje')
  await page.reload()
  return { ctx, page }
}

async function medir(page, nome, { clip, arquivo } = {}) {
  await page.waitForTimeout(400)
  const png = await page.screenshot(clip ? { clip } : {})
  const pagina = clip ? null : await page.screenshot({ fullPage: true })
  if (CAPTURAS && arquivo) writeFileSync(`${CAPTURAS}/${PREFIXO}-${arquivo}.png`, png)
  resultado.telas[nome] = { tela: await classificar(page, png), pagina: pagina ? await classificar(page, pagina) : undefined }
}

const ir = async (page, rota) => {
  await page.goto(BASE + rota)
  await page.locator('h1').first().waitFor()
  await page.waitForTimeout(300)
}

{
  const { ctx, page } = await abrirAparelho(false)
  await ir(page, '#/hoje')
  await page.getByRole("heading", { name: "Atenção" }).waitFor()
  await medir(page, 'Hoje', { arquivo: 'hoje' })
  await page.locator('main').getByRole('button', { name: 'Registrar dose', exact: true }).click()
  const folha = page.getByRole('dialog')
  await folha.waitFor()
  await page.waitForTimeout(300)
  const caixa = await folha.boundingBox()
  await medir(page, 'Folha de dose', { clip: caixa })
  if (CAPTURAS) writeFileSync(`${CAPTURAS}/${PREFIXO}-folha-de-dose.png`, await page.screenshot())
  await page.keyboard.press('Escape')
  await folha.waitFor({ state: 'detached' })
  await ir(page, '#/protocolos')
  await medir(page, 'Protocolos', { arquivo: 'protocolos' })
  await ir(page, '#/protocolos/p-bpc')
  await medir(page, 'Detalhe', { arquivo: 'detalhe' })
  await ir(page, '#/estoque')
  await medir(page, 'Estoque', { arquivo: 'estoque' })
  await ir(page, '#/peso')
  await medir(page, 'Peso', { arquivo: 'peso' })
  await ctx.close()
}
{
  const { ctx, page } = await abrirAparelho(true)
  await ir(page, '#/hoje')
  await page.getByText('Tudo feito hoje').waitFor()
  await medir(page, 'Hoje (tudo feito)', { arquivo: 'hoje-tudo-feito' })
  await ctx.close()
}
await navegador.close()
fechar()

// ---------- relatório ----------
const f = (v) => (v === undefined ? '–' : `${v.toFixed(1)}%`)
const neutro = (m) => m.fundo + m.superficie + m.texto
function tabela(titulo, chave, antes) {
  console.log(`\n${titulo}\n`)
  console.log('| Tela | Fundo | Superfícies | Texto neutro | Neutros (60+30) | Acento (10) | Status | Protocolo | Status+protocolo |')
  console.log('|---|---|---|---|---|---|---|---|---|')
  for (const [nome, r] of Object.entries(resultado.telas)) {
    const m = r[chave]
    if (!m) continue
    const a = antes?.telas?.[nome]?.[chave]
    const c = (v, va) => (a ? `${f(va)} → ${f(v)}` : f(v))
    console.log(`| ${nome} | ${c(m.fundo, a?.fundo)} | ${c(m.superficie, a?.superficie)} | ${c(m.texto, a?.texto)} | ${c(neutro(m), a && neutro(a))} | ${c(m.acento, a?.acento)} | ${c(m.status, a?.status)} | ${c(m.protocolo, a?.protocolo)} | ${c(m.status + m.protocolo, a && a.status + a.protocolo)} |`)
  }
}
const antes = COMPARAR ? JSON.parse(readFileSync(COMPARAR, 'utf8')) : undefined
tabela(antes ? 'Primeira tela (390 × 844), antes → depois' : 'Primeira tela (390 × 844)', 'tela', antes)
tabela(antes ? 'Página inteira (rolando), antes → depois' : 'Página inteira (rolando)', 'pagina', antes)
const hoje = resultado.telas.Hoje.tela
const metas = [
  ['Hoje: fundo + superfícies (com texto neutro) >= 85%', neutro(hoje) >= 85],
  ['Hoje: acento <= 10%', hoje.acento <= 10],
  ['Hoje: status + protocolo <= 5%', hoje.status + hoje.protocolo <= 5],
]
console.log('\nMetas (primeira tela da Hoje):')
for (const [t, ok] of metas) console.log(`  ${ok ? 'ok ' : 'NÃO'} ${t}`)
if (SAIDA) writeFileSync(SAIDA, JSON.stringify(resultado, null, 2))
