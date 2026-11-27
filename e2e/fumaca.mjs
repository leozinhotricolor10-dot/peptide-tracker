// Teste de fumaça de ponta a ponta no build de produção, servido como no GitHub Pages
// (subpasta /peptide-tracker/). Usa o Google Chrome já instalado (não baixa navegador).
//   npm run build && npm run e2e
// Falha (código 1) se algum passo não acontecer ou se aparecer erro/aviso no console.
import { chromium } from 'playwright-core'
import { servir } from '../tools/servir-pages.mjs'
import { PALETA } from '../src/dominio/paleta.ts'
import { CORES_PROTOCOLO } from '../src/dominio/cores.ts'

const { url: BASE, fechar } = await servir(4199)
// Fuso do navegador do teste. Perto da meia-noite a dose das 00:00 ainda não está atrasada: use outro fuso (ex.: E2E_FUSO=America/Noronha).
const FUSO = process.env.E2E_FUSO ?? 'America/Sao_Paulo'
const navegador = await chromium.launch({ channel: process.env.E2E_CANAL ?? 'chrome', headless: true })
const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: FUSO })
let page = await contexto.newPage()
const problemas = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problemas.push(`console ${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => problemas.push(`erro na página: ${e.message}`))
page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/peptide-tracker/estoque') && problemas.push(`HTTP ${r.status()} ${r.url()}`))

let n = 0
async function passo(nome, fn) {
  n++
  try {
    await fn()
    console.log(`ok ${n} - ${nome}`)
  } catch (e) {
    console.log(`FALHOU ${n} - ${nome}\n  ${e.message.split('\n')[0]}`)
    await navegador.close()
    fechar()
    process.exit(1)
  }
}
const CAPTURAS = process.env.E2E_CAPTURAS // pasta opcional para salvar capturas de tela
const capturar = async (nome) => { if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/${nome}.png` }) }
const B = (nome) => page.getByRole('button', { name: nome, exact: true })
const L = (nome) => page.getByRole('link', { name: nome, exact: true })
const h1 = () => page.locator('h1').first().textContent()
const igual = (a, b, msg) => {
  if (a !== b) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`)
}
const lerConfig = (chave) => page.evaluate(async (k) => {
  const r = indexedDB.open('peptide-tracker')
  const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
  const v = await new Promise((ok) => { const q = db.transaction('config').objectStore('config').get(k); q.onsuccess = () => ok(q.result?.valor) })
  db.close()
  return v
}, chave)
const gravarConfig = (chave, valor) => page.evaluate(async ([k, v]) => {
  const r = indexedDB.open('peptide-tracker')
  const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
  await new Promise((ok) => { const t = db.transaction('config', 'readwrite'); t.objectStore('config').put({ chave: k, valor: v }); t.oncomplete = ok })
  db.close()
}, [chave, valor])
/** Tela sem rolagem lateral, sem alvo < 44 px (checkbox e opção contam pela linha inteira) e sem texto em inglês. */
const conferirTela = async (onde, raiz = '#root') => {
  const larg = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  if (larg[0] > larg[1]) throw new Error(`${onde}: rolagem lateral ${larg.join(' > ')}`)
  const pequenos = await page.evaluate((r) =>
    [...document.querySelectorAll(`${r} a, ${r} button, ${r} select, ${r} input`)]
      .filter((el) => el.offsetParent !== null || el.closest('label')?.offsetParent)
      .map((el) => (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) || el)
      .map((el) => ({ t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.height < 43.5 || x.r.width < 43.5)
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`), raiz)
  if (pequenos.length) throw new Error(`${onde}: alvo pequeno ${pequenos.join(', ')}`)
  const ingles = (await page.locator(raiz).first().innerText()).match(/\b(Share|Cancel|Download|Error|undefined|NaN|null|Storage|Send|Backup saved)\b/g)
  if (ingles) throw new Error(`${onde}: texto em inglês ${ingles.join(', ')}`)
}

const rgbDe = (hex) => `rgb(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(', ')})`
/**
 * Contraste de todo texto visível da tela contra o fundo real (camadas de fundo somadas, inclusive
 * as semitransparentes). Devolve os trechos abaixo de 4,5:1. Texto desativado (opacidade < 1) não conta.
 */
const textosFracos = (p = page, raiz = '#root') => p.evaluate((r) => {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const cor = (c) => {
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = '#000'
    cx.fillStyle = c
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const lum = ([a, b, c]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(a) + 0.7152 * f(b) + 0.0722 * f(c) }
  const sobre = (cima, baixo) => [0, 1, 2].map((k) => cima[k] * cima[3] + baixo[k] * (1 - cima[3])).concat(1)
  const fundoDe = (el) => {
    const camadas = []
    for (let e = el; e; e = e.parentElement) {
      const c = cor(getComputedStyle(e).backgroundColor)
      if (c[3] > 0) camadas.push(c)
      if (c[3] >= 1) break
    }
    let f = cor(getComputedStyle(document.documentElement).backgroundColor)
    if (f[3] < 1) f = [255, 255, 255, 1]
    for (const c of camadas.reverse()) f = sobre(c, f)
    return f
  }
  const ruins = []
  const raizEl = document.querySelector(r)
  if (!raizEl) return ruins
  const andar = document.createTreeWalker(raizEl, NodeFilter.SHOW_TEXT)
  const vistos = new Set()
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    const el = n.parentElement
    if (!n.textContent.trim() || !el || vistos.has(el)) continue
    vistos.add(el)
    if (!el.getClientRects().length) continue
    const st = getComputedStyle(el)
    if (st.visibility === 'hidden' || el.closest('.sr-only,[aria-hidden=true]')) continue
    let apagado = false
    for (let e = el; e; e = e.parentElement) if (Number(getComputedStyle(e).opacity) < 1) apagado = true
    if (apagado || el.closest(':disabled,[aria-disabled=true]')) continue
    let t = cor(el instanceof SVGElement ? st.fill : st.color)
    const f = fundoDe(el)
    if (t[3] < 1) t = sobre(t, f)
    const [a, b] = [lum(t), lum(f)]
    const c = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    if (c < 4.5) ruins.push(`"${n.textContent.trim().slice(0, 30)}" ${c.toFixed(2)}`)
  }
  return ruins
}, raiz)
const conferirContraste = async (onde, p = page, raiz = '#root') => {
  await p.waitForTimeout(500) // animações de entrada (opacidade) terminam
  const r = await textosFracos(p, raiz)
  if (r.length) throw new Error(`${onde}: texto com contraste baixo ${r.join(' | ')}`)
}

/** Tudo o que o app gravou no aparelho (tabelas do IndexedDB). */
const tudoNoBanco = (p = page) => p.evaluate(async () => {
  const r = indexedDB.open('peptide-tracker')
  const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
  const out = {}
  for (const t of db.objectStoreNames) out[t] = await new Promise((ok) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => ok(q.result) })
  db.close()
  return out
})
const PEDIDO_AVISOS = 'Quer ser avisado na hora da dose?'
const pedidoAvisos = (p = page) => p.getByRole('alertdialog', { name: PEDIDO_AVISOS })
const salvarProtocolo = (p = page) => p.locator('[data-salvar]').click()

await passo('abre na subpasta e cai nas boas-vindas (boas-vindas e aviso 18+ na mesma tela)', async () => {
  await page.goto(BASE)
  await page.waitForURL(/#\/boas-vindas$/)
  igual(await h1(), 'Seu diário de protocolos', 'título')
  await page.getByText('só um registro pessoal', { exact: true }).waitFor()
  await L('Privacidade').waitFor()
  await L('Termos de uso').waitFor()
  await conferirTela('boas-vindas (390)')
  await conferirContraste('boas-vindas (390)')
  await capturar('boas-vindas-390')
})
await passo('recusar o aviso 18+ leva à saída sem gravar nada', async () => {
  igual(await B('Começar').isDisabled(), true, 'botão Começar inativo sem as duas caixas')
  igual(await B('Pular, ver o app primeiro').isDisabled(), true, 'Pular inativo sem as duas caixas')
  await page.getByLabel('Tenho 18 anos ou mais').check() // marcar só uma não grava nada
  await L('Não aceito').click()
  await page.getByRole('heading', { name: 'Tudo bem', level: 1 }).waitFor() // espera a troca de tela (antes lia o título cedo demais)
  await conferirTela('saída do 18+ (390)')
  await conferirContraste('saída do 18+ (390)')
  await capturar('saida-18-390')
  const b = await tudoNoBanco()
  const gravado = Object.entries(b).filter(([, v]) => v.length).map(([k]) => k)
  igual(gravado.join(','), '', 'nenhuma tabela com dado depois de recusar')
  await page.goto(BASE + '#/hoje')
  await page.waitForURL(/#\/boas-vindas$/)
  await page.goto(BASE + '#/aviso') // endereço antigo do aviso
  await page.waitForURL(/#\/boas-vindas$/)
})
await passo('aceitar e criar o 1º protocolo em 2 passos (dose 1.000 é recusada, 250 mcg aceita); salvo, vai para a Hoje', async () => {
  await page.getByLabel('Tenho 18 anos ou mais').check()
  await page.getByLabel('Entendi que o app é só um registro pessoal').check()
  await B('Começar').click()
  await page.waitForURL(/#\/novo\/substancia$/)
  await page.getByText('Passo 1 de 2').waitFor()
  const aceite = (await tudoNoBanco()).config.find((c) => c.chave === 'aceite')?.valor
  igual(aceite?.versao, '1', 'aceite gravado com a versão do aviso')
  if (!aceite || Number.isNaN(new Date(aceite.em).getTime())) throw new Error('aceite sem data')
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await page.getByRole('option', { name: /BPC-157/ }).first().click()
  igual(await B('mg').getAttribute('aria-pressed'), 'true', 'unidade mg já marcada')
  await page.getByPlaceholder('Digite o número').fill('1.000')
  await B('mcg').click()
  await B('Continuar').click()
  if (!/vírgula/.test((await page.getByRole('alert').textContent()) ?? '')) throw new Error('faltou o aviso do número ambíguo')
  await page.getByPlaceholder('Digite o número').fill('250')
  await B('Continuar').click()
  await page.waitForURL(/#\/novo\/frequencia$/)
  await page.getByText('Passo 2 de 2').waitFor()
  igual(await page.getByRole('button', { name: /^Mais opções/ }).getAttribute('aria-expanded'), 'false', 'Mais opções fechado no cadastro novo')
  // padrão do cadastro: 08:00 (o teste troca para 00:00 de propósito, para ter uma dose atrasada)
  igual(await page.getByLabel('Horário', { exact: true }).inputValue(), '08:00', 'horário padrão')
  igual((await page.locator('[data-salvar]').textContent()).trim(), 'Salvar · 250 mcg, todo dia às 08:00', 'resumo no botão com o padrão')
  await page.getByLabel('Horário', { exact: true }).fill('00:00')
  igual((await page.locator('[data-salvar]').textContent()).trim(), 'Salvar · 250 mcg, todo dia às 00:00', 'resumo no botão')
  await salvarProtocolo()
  await page.waitForURL(/#\/hoje$/)
  igual(await page.getByText('Escolha a unidade.').count(), 0, 'sem erro de unidade')
})
await passo('pedido de avisos aparece logo depois do 1º protocolo; "Agora não" grava e não repete (nem após F5)', async () => {
  await pedidoAvisos().waitFor()
  await page.waitForTimeout(400) // fim da animação de entrada do diálogo
  await conferirTela('pedido de avisos', '[role=alertdialog]')
  await capturar('pedido-avisos-390')
  await pedidoAvisos().getByRole('button', { name: 'Agora não', exact: true }).click()
  await pedidoAvisos().waitFor({ state: 'detached' })
  igual(await lerConfig('pedidoAvisos'), 'respondido', 'resposta gravada')
  await page.reload()
  await page.getByRole('heading', { name: 'Hoje', level: 1 }).waitFor()
  await page.waitForTimeout(500)
  igual(await pedidoAvisos().count(), 0, 'não repete depois do F5')
})
await passo('registrar a dose atrasada, desfazer e registrar de novo', async () => {
  await page.goto(BASE + '#/hoje')
  const linha = page.locator('main button', { hasText: '00:00' })
  await linha.click()
  await B('Fiz agora').click()
  await B('Salvar registro').click()
  await B('Desfazer').click()
  await page.locator('main button', { hasText: 'atrasada' }).waitFor()
  await linha.click()
  await B('Fiz agora').click()
  await B('Salvar registro').click()
  await page.locator('main', { hasText: 'Tomada às' }).waitFor()
})
await passo('calculadora do passo 1: 5 mg em 2 mL, 250 mcg = 10 unidades, 20 doses; arredondamento à mostra; o frasco vai sozinho para o Estoque', async () => {
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await page.getByRole('option', { name: /BPC-157/ }).first().click()
  await page.getByPlaceholder('Digite o número').fill('250')
  await B('mcg').click()
  const calc = page.locator('section', { has: page.getByRole('heading', { name: 'Calculadora da seringa' }) })
  await page.getByLabel('No frasco (mg)').fill('1.000')
  if (!/vírgula/.test((await calc.getByRole('alert').textContent()) ?? '')) throw new Error('faltou o aviso do número ambíguo na calculadora')
  await page.getByLabel('No frasco (mg)').fill('10')
  await page.getByLabel('Água que você pôs (mL)').fill('3')
  await calc.getByText('7,5 unidades').waitFor()
  await calc.getByText(/Na marca mais próxima, de 8 unidades, ficam 266,6\d*\s*mcg \(e não 250\s*mcg\)/).waitFor()
  await page.getByLabel('No frasco (mg)').fill('5')
  await page.getByLabel('Água que você pôs (mL)').fill('2')
  for (const t of ['2,5 mg/mL', '10 unidades', '20 doses']) await calc.getByText(t, { exact: true }).waitFor()
  // tom descritivo: equivalência, nunca "Puxe"; e a linha fixa de que o app só converte
  await calc.getByText(/^250\s*mcg equivalem a$/).waitFor()
  await calc.getByText(/^na seringa \(0,1 mL\)/).waitFor()
  await calc.getByText('O app só converte os números que você digitou. Ele não indica dose.', { exact: true }).waitFor()
  igual(await page.getByText(/\b(Puxe|puxar|Aplique|Injete|Tome)\b/).count(), 0, 'nenhum verbo de instrução de dose')
  await capturar('calculadora-descritiva-390')
  // sem interruptor: o frasco informado sempre vai para o Estoque
  igual(await page.getByRole('switch').count(), 0, 'interruptor de guardar frasco removido')
  await calc.getByText('O frasco entra no Estoque para você acompanhar o saldo').waitFor()
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('09:00')
  await page.getByText('Frasco novo: 5 mg + 2 mL').waitFor()
  await salvarProtocolo()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  igual(await pedidoAvisos().count(), 0, 'pedido de avisos só no 1º protocolo')
})
await passo('depois de salvar: voltar, fechar, voltar de novo, avançar e F5 nunca reabrem passos nem travam em Carregando', async () => {
  const conferir = async (onde) => {
    await page.waitForTimeout(700)
    if (/#\/novo/.test(page.url())) throw new Error(`${onde}: reabriu um passo (${page.url()})`)
    if (await page.getByText('Carregando…').count()) throw new Error(`${onde}: ficou em Carregando`)
    if (!(await page.locator('h1').count())) throw new Error(`${onde}: tela sem título`)
  }
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.waitForURL(/#\/protocolos$/)
  await conferir('voltar do app')
  for (const [onde, fn] of [
    ['voltar do celular', () => page.goBack()],
    ['avançar', () => page.goForward()],
    ['avançar de novo', () => page.goForward()],
    ['F5', () => page.reload()],
  ]) {
    await fn()
    await conferir(onde)
  }
  await page.goto(BASE + '#/novo/dose')
  await page.waitForURL(/#\/protocolos(\/[\w-]+)?$/)
  await conferir('link antigo para um passo')
  await page.reload()
  await conferir('F5 depois do link antigo')
  await page.goto(BASE + '#/estoque')
  await page.getByText(/Reconstituído em .* · 2 mL/).waitFor()
})
await passo('cancelar um cadastro (X) e voltar de novo não reabre o passo', async () => {
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.waitForURL(/#\/novo\/substancia$/)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.waitForURL(/#\/protocolos$/)
  await page.goForward()
  await page.waitForTimeout(700)
  if (/#\/novo/.test(page.url()) || (await page.getByText('Carregando…').count())) throw new Error(`reabriu ou travou: ${page.url()}`)
})
await passo('F5 numa tela interna continua na mesma tela', async () => {
  await page.goto(BASE + '#/estoque')
  await page.reload()
  igual(await h1(), 'Estoque', 'título após recarregar')
})
await passo('endereço antigo sem # (404 do Pages) leva para a tela certa', async () => {
  await page.goto(BASE + 'estoque')
  await page.waitForURL(/#\/estoque$/)
})
await passo('endereços inexistentes mostram mensagem, não tela branca', async () => {
  for (const [rota, titulo] of [['#/estoque/frasco/nao-existe', 'Frasco não encontrado'], ['#/protocolos/nao-existe', 'Protocolo não encontrado'], ['#/qualquer', 'Página não encontrada']]) {
    await page.goto(BASE + rota)
    await page.reload()
    await page.getByRole('heading', { name: titulo, level: 1 }).waitFor()
    await conferirTela(titulo)
    await conferirContraste(titulo)
  }
  await capturar('pagina-nao-encontrada-390')
})
await passo('service worker ativo com escopo da subpasta e manifest certo', async () => {
  await page.goto(BASE + '#/hoje')
  const escopo = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  igual(escopo, BASE, 'escopo do service worker')
  const m = await (await page.request.get(BASE + 'manifest.webmanifest')).json()
  igual([m.start_url, m.scope, m.id].join(' '), '/peptide-tracker/ /peptide-tracker/ /peptide-tracker/', 'manifest')
  igual([m.background_color, m.theme_color].join(' '), `${PALETA.fundo} ${PALETA.fundo}`, 'tela de abertura e barra do sistema no fundo claro')
  const p404 = await (await page.request.get(BASE + '404.html')).text()
  if (!p404.includes(`background:${PALETA.fundo};color:${PALETA.texto}`)) throw new Error('404.html fora do tema claro')
})
await passo('sem internet: recarrega e mostra os dados', async () => {
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await contexto.setOffline(true)
  await page.goto(BASE + '#/hoje')
  await page.getByText('Sem internet.').waitFor()
  await page.locator('main', { hasText: 'Tomada às' }).waitFor()
  await conferirContraste('sem internet')
  await capturar('sem-internet-390')
  await contexto.setOffline(false)
})
await passo('apagar frasco com dose ligada: some do Estoque, a dose fica no histórico; desfazer devolve', async () => {
  const banco = () => page.evaluate(async () => {
    const r = indexedDB.open('peptide-tracker')
    const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
    const ler = (t) => new Promise((ok) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => ok(q.result) })
    const out = { frascos: await ler('frascos'), aplicacoes: await ler('aplicacoes') }
    db.close()
    return out
  })
  const antes = new Set((await banco()).frascos.map((f) => f.id))
  await page.goto(BASE + '#/estoque/frasco/novo')
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await page.getByRole('option', { name: /BPC-157/ }).first().click()
  await page.getByPlaceholder('Do rótulo').fill('12')
  await B('Salvar fechado').click()
  await page.waitForURL(/#\/estoque$/)
  const frasco = (await banco()).frascos.find((f) => !antes.has(f.id))
  if (!frasco) throw new Error('frasco novo não foi salvo')
  // vincula uma dose a este frasco (editando a dose já registrada no protocolo)
  const dosesAntes = (await banco()).aplicacoes.filter((a) => a.status === 'feita').length
  await page.goto(BASE + '#/hoje')
  await page.locator('main button', { hasText: 'Tomada às' }).first().click()
  await B('Editar').click()
  await page.getByLabel('Frasco usado').selectOption(frasco.id)
  await B('Salvar registro').click()
  await page.getByRole('status').filter({ hasText: 'Registro atualizado' }).waitFor()
  const ligada = (await banco()).aplicacoes.find((a) => a.frascoId === frasco.id)
  if (!ligada) throw new Error('a dose não ficou ligada ao frasco')
  const apagar = async () => {
    await page.goto(BASE + '#/estoque/frasco/' + frasco.id)
    await page.getByRole('heading', { name: 'Frasco', level: 1 }).waitFor()
    await B('Apagar frasco').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Apagar', exact: true }).click()
    await page.waitForURL(/#\/estoque$/)
    await page.getByRole('status').filter({ hasText: 'Frasco apagado' }).waitFor()
    igual(await page.getByRole('alertdialog').count(), 0, 'diálogo fechado')
    igual(await page.locator(`a[href$="/estoque/frasco/${frasco.id}"]`).count(), 0, 'frasco fora do Estoque')
    const b = await banco()
    igual(b.frascos.some((f) => f.id === frasco.id), false, 'frasco apagado do banco')
    const dose = b.aplicacoes.find((a) => a.id === ligada.id)
    igual(!!dose && dose.status === 'feita' && dose.frascoId === undefined, true, 'dose continua no histórico, sem frasco')
    igual(b.aplicacoes.filter((a) => a.status === 'feita').length, dosesAntes, 'nenhuma dose sumiu')
  }
  await apagar()
  await B('Desfazer').click()
  await page.locator(`a[href$="/estoque/frasco/${frasco.id}"]`).first().waitFor()
  igual((await banco()).aplicacoes.find((a) => a.id === ligada.id)?.frascoId, frasco.id, 'desfazer religa a dose')
  await apagar()
})
// ---------- cor de cada protocolo + todo frasco no Estoque ----------
const lerBanco = () => page.evaluate(async () => {
  const r = indexedDB.open('peptide-tracker')
  const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
  const ler = (t) => new Promise((ok) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => ok(q.result) })
  const out = { protocolos: await ler('protocolos'), itens: await ler('itens'), frascos: await ler('frascos'), aplicacoes: await ler('aplicacoes') }
  db.close()
  return out
})
let tesa
await passo('protocolo com a calculadora: o frasco aparece no Estoque ligado ao protocolo e com saldo', async () => {
  const antes = new Set((await lerBanco()).frascos.map((f) => f.id))
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('tesamo')
  await page.getByRole('option', { name: /Tesamorelina/ }).first().click()
  await page.getByPlaceholder('Digite o número').fill('2')
  await B('mg').click()
  await page.getByLabel('No frasco (mg)').fill('10')
  await page.getByLabel('Água que você pôs (mL)').fill('2')
  await page.getByText('O frasco entra no Estoque para você acompanhar o saldo').waitFor()
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('00:00')
  await page.getByText('Frasco novo: 10 mg + 2 mL').waitFor()
  await salvarProtocolo()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  await page.getByRole('status').filter({ hasText: 'frasco no Estoque' }).waitFor()
  const b = await lerBanco()
  const novo = b.frascos.filter((f) => !antes.has(f.id))
  igual(novo.length, 1, 'um frasco novo no Estoque')
  tesa = b.protocolos.find((p) => page.url().endsWith(p.id))
  const linha = b.itens.find((i) => i.protocoloId === tesa.id)
  igual(linha.frascoId, novo[0].id, 'frasco ligado à linha do protocolo')
  await page.getByText('Frasco: 5 doses restantes').waitFor()
  await page.goto(BASE + '#/estoque')
  const card = page.locator('div.card', { has: page.locator(`a[href$="/estoque/frasco/${novo[0].id}"]`) })
  await card.getByText('Protocolo:').waitFor()
  await card.getByText('Tesamorelina', { exact: true }).waitFor()
  await card.getByText('2 mL de 2 mL').waitFor()
  await card.getByText(/≈ 5 doses restantes/).waitFor()
})
await passo('registrar dose reduz o saldo do frasco (Estoque e cartão do protocolo)', async () => {
  await page.goto(BASE + '#/protocolos/' + tesa.id)
  await B('Registrar dose agora').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
  await page.getByText('Frasco: 4 doses restantes').waitFor()
  const b = await lerBanco()
  const linha = b.itens.find((i) => i.protocoloId === tesa.id)
  igual(b.aplicacoes.some((a) => a.itemId === linha.id && a.frascoId === linha.frascoId && a.status === 'feita'), true, 'dose ligada ao frasco do protocolo')
  await page.goto(BASE + '#/estoque')
  const card = page.locator('div.card', { has: page.locator(`a[href$="/estoque/frasco/${linha.frascoId}"]`) })
  await card.getByText('1,6 mL de 2 mL').waitFor()
  await card.getByText(/≈ 4 doses restantes/).waitFor()
})
let reta
await passo('protocolo sem dados do frasco: selo "Sem frasco no estoque", atalho cria o frasco já ligado; cor escolhida', async () => {
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('retatru')
  await page.getByRole('option', { name: /Retatrutida/ }).first().click()
  await page.getByPlaceholder('Digite o número').fill('2')
  await B('mg').click()
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('23:59')
  await page.getByRole('button', { name: /^Mais opções/ }).click()
  const violeta = page.getByRole('radio', { name: 'Violeta' })
  await violeta.click()
  igual(await violeta.getAttribute('aria-checked'), 'true', 'cor escolhida marcada')
  await salvarProtocolo()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  reta = (await lerBanco()).protocolos.find((p) => page.url().endsWith(p.id))
  igual(reta.cor, 'violeta', 'cor gravada')
  await page.getByText('Sem frasco no estoque', { exact: true }).waitFor()
  await page.goto(BASE + '#/hoje')
  await page.getByRole('link', { name: /Adicione o frasco para acompanhar o estoque.*Retatrutida/ }).waitFor()
  await page.goto(BASE + '#/protocolos/' + reta.id)
  await page.getByRole('link', { name: /Adicione o frasco para acompanhar o estoque/ }).click()
  await page.getByText(/Vai ficar ligado ao protocolo/).waitFor()
  await page.getByPlaceholder('Do rótulo').fill('12')
  await B('Salvar fechado').click()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  await page.getByText('Frasco: 6 doses restantes').waitFor()
  const b = await lerBanco()
  const linha = b.itens.find((i) => i.protocoloId === reta.id)
  const fr = b.frascos.find((f) => f.id === linha.frascoId)
  igual(!!fr && fr.mgTotal === 12 && fr.status === 'fechado', true, 'frasco novo ligado ao protocolo')
})
await passo('cores distintas entre os protocolos e F5 mantém cores e frascos', async () => {
  const conferir = async () => {
    await page.getByRole('heading', { name: 'Protocolos', level: 1 }).waitFor()
    const cartoes = page.locator('a.card[href*="/protocolos/"]')
    await cartoes.first().waitFor()
    const cor = async (id) => page.locator(`a.card[href$="/protocolos/${id}"]`).evaluate((el) => getComputedStyle(el).borderLeftColor)
    const ct = await cor(tesa.id)
    const cr = await cor(reta.id)
    if (ct === cr) throw new Error(`mesma cor nos dois protocolos: ${ct}`)
    igual(cr, 'rgb(123, 63, 196)', 'violeta na borda da Retatrutida')
    const todas = await cartoes.evaluateAll((els) => els.map((el) => getComputedStyle(el).borderLeftColor))
    igual(new Set(todas).size, todas.length, 'cada protocolo ativo com uma cor')
    await page.locator(`a.card[href$="/protocolos/${tesa.id}"]`).getByText('Frasco: 4 doses restantes').waitFor()
  }
  await page.goto(BASE + '#/protocolos')
  await conferir()
  await page.reload()
  await conferir()
  const b = await lerBanco()
  igual(new Set(b.protocolos.map((p) => p.cor)).size, b.protocolos.length, 'cores distintas no banco')
})
// ---------- movimento: celebração da dose, aviso novo, desfazer, reduzir movimento ----------
/** Animações rodando agora, sem a barrinha de tempo do aviso (essa dura os 6 s de propósito). */
const animando = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.animationName !== 'pt-tempo').map((a) => a.animationName || a.constructor.name))
const contraste = (seletor) => page.locator(seletor).first().evaluate((el) => {
  const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number)
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let fundo = el
  while (fundo && getComputedStyle(fundo).backgroundColor.replace(/\s/g, '').match(/rgba\(0,0,0,0\)|transparent/)) fundo = fundo.parentElement
  const a = lum(rgb(getComputedStyle(el).color))
  const b = lum(rgb(getComputedStyle(fundo).backgroundColor))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
})
await passo('registrar dose: celebração aparece e termina, aviso (cinza-claro, com borda) com tempo e Desfazer, frasco conta 4 → 3', async () => {
  await page.goto(BASE + '#/protocolos/' + tesa.id)
  await page.getByText('Frasco: 4 doses restantes').waitFor()
  const antes = (await lerBanco()).aplicacoes.length
  await B('Registrar dose agora').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' }).click()
  const aviso = page.getByRole('status').filter({ hasText: 'Dose registrada' })
  await aviso.waitFor()
  igual(await aviso.getAttribute('data-festa'), 'true', 'aviso com celebração')
  await aviso.locator('[data-celebracao] .onda').first().waitFor({ state: 'attached' })
  await page.locator('main .anima-nova').first().waitFor() // linha nova em "Últimos registros"
  igual(await aviso.evaluate((el) => getComputedStyle(el).backgroundColor), rgbDe(PALETA.sup2), 'aviso no cartão 2 do tema')
  igual(await aviso.locator('.tempo-anima').evaluate((el) => getComputedStyle(el).animationDuration), '6s', 'barrinha de tempo de 6 s')
  const c = await contraste('[role=status] >> text=Desfazer')
  if (c < 4.5) throw new Error(`contraste do Desfazer ${c.toFixed(2)}:1`)
  const ct = await contraste('[role=status] >> text=Dose registrada')
  if (ct < 4.5) throw new Error(`contraste do título do aviso ${ct.toFixed(2)}:1`)
  await page.getByText('Frasco: 3 doses restantes').waitFor()
  await page.waitForTimeout(1200)
  const presas = await animando()
  if (presas.length) throw new Error(`animação ainda rodando 1,2 s depois: ${presas.join(', ')}`)
  igual(await page.locator('[data-fantasma]').count(), 0, 'cópia de saída da folha removida')
  igual((await lerBanco()).aplicacoes.length, antes + 1, 'gravou na hora')
})
await passo('Desfazer: o registro sai da lista com animação e o frasco volta a 4', async () => {
  const antes = (await lerBanco()).aplicacoes.length
  await B('Desfazer').click()
  await page.getByText('Frasco: 4 doses restantes').waitFor()
  await page.waitForTimeout(500)
  igual(await page.locator('main .anima-sai').count(), 0, 'linha que saiu foi removida')
  igual((await lerBanco()).aplicacoes.length, antes - 1, 'registro apagado')
  igual(await page.getByRole('status').filter({ hasText: 'Dose registrada' }).count(), 0, 'aviso fechou')
})
await passo('toques rápidos (registrar, desfazer, registrar) não quebram o estado', async () => {
  const antes = (await lerBanco()).aplicacoes.length
  for (let i = 0; i < 2; i++) {
    await B('Registrar dose agora').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' }).click()
    if (i === 0) await B('Desfazer').click()
  }
  await page.getByText('Frasco: 3 doses restantes').waitFor()
  await page.waitForTimeout(1300)
  igual((await lerBanco()).aplicacoes.length, antes + 1, 'um registro só no fim')
  igual(await page.getByRole('dialog').count(), 0, 'nenhuma folha aberta')
  igual(await page.locator('[data-fantasma]').count(), 0, 'nenhuma cópia de saída sobrando')
  const presas = await animando()
  if (presas.length) throw new Error(`animação presa: ${presas.join(', ')}`)
})
await passo('gravação falha: a celebração volta atrás, aviso de erro, folha continua aberta com o motivo; depois salva', async () => {
  const antes = (await lerBanco()).aplicacoes.length
  await page.evaluate(() => {
    window.__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('falha simulada', 'UnknownError')
    }
  })
  await B('Registrar dose agora').click()
  const folha = page.getByRole('dialog')
  await folha.getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByRole('status').filter({ hasText: 'Não deu para registrar a dose' }).waitFor()
  await folha.getByRole('alert').waitFor()
  igual(await folha.count(), 1, 'folha continua aberta')
  igual(await page.getByRole('status').filter({ hasText: 'Dose registrada' }).count(), 0, 'aviso de sucesso saiu')
  await page.getByText('Frasco: 3 doses restantes').waitFor()
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.__put
  })
  await folha.getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
  await page.getByText('Frasco: 2 doses restantes').waitFor()
  igual((await lerBanco()).aplicacoes.length, antes + 1, 'salvou na segunda tentativa')
  await B('Desfazer').click()
  await page.getByText('Frasco: 3 doses restantes').waitFor()
})
await passo('Hoje: registrar todas as doses do dia mostra "Tudo feito hoje"; desfazer volta', async () => {
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
  for (let i = 0; i < 8 && !(await page.getByText('Tudo feito hoje').count()); i++) {
    await page.locator('main').getByRole('button', { name: 'Registrar dose', exact: true }).click()
    const fiz = page.getByRole('dialog').getByRole('button', { name: 'Fiz agora' })
    const salvar = page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' })
    await fiz.or(salvar).first().waitFor()
    if (await fiz.count()) await fiz.click()
    await salvar.click()
    await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
    await page.waitForTimeout(300)
  }
  const tudo = page.getByRole('status').filter({ hasText: 'Tudo feito hoje' })
  await tudo.waitFor()
  await tudo.locator('[data-celebracao]').waitFor() // celebração maior só quando acabou de acontecer
  const [feitas, total] = (await page.getByRole('heading', { name: 'Doses de hoje' }).locator('xpath=..').textContent()).match(/(\d+) de (\d+)/).slice(1)
  igual(feitas, total, 'contador de hoje completo')
  await page.waitForTimeout(1200)
  const presas = await animando()
  if (presas.length) throw new Error(`animação presa: ${presas.join(', ')}`)
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).getByRole('button', { name: 'Desfazer' }).click()
  await page.locator('main').getByRole('button', { name: 'Registrar dose', exact: true }).waitFor()
  igual(await page.getByText('Tudo feito hoje').count(), 0, 'saiu do "Tudo feito"')
})
await passo('transição entre telas: direção certa, barra de baixo desliza, voltar/avançar sem piscar', async () => {
  igual(await page.evaluate(() => typeof document.startViewTransition), 'function', 'navegador com View Transitions')
  const indicador = () => page.locator('nav .aba-indicador').evaluate((el) => getComputedStyle(el).transform)
  const t0 = await indicador()
  await page.getByRole('navigation').getByRole('link', { name: 'Estoque' }).click()
  await page.waitForURL(/#\/estoque$/)
  igual(await page.evaluate(() => document.documentElement.dataset.direcao), 'aba', 'troca de aba esmaece')
  await page.waitForTimeout(400)
  if ((await indicador()) === t0) throw new Error('indicador da aba não andou')
  await page.getByRole('navigation').getByRole('link', { name: 'Protocolos' }).click()
  await page.locator(`a.card[href$="/protocolos/${tesa.id}"]`).click()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  igual(await page.evaluate(() => document.documentElement.dataset.direcao), 'avancar', 'abrir detalhe avança')
  await page.goBack()
  await page.waitForURL(/#\/protocolos$/)
  igual(await page.evaluate(() => document.documentElement.dataset.direcao), 'voltar', 'voltar do celular volta')
  await page.goForward()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.waitForTimeout(500)
  igual(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), 0, 'nada animando depois da troca')
})
await passo('com "reduzir movimento": registrar e desfazer funcionam sem nenhuma animação', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(BASE + '#/protocolos/' + tesa.id)
  await page.getByText('Frasco: 3 doses restantes').waitFor()
  await B('Registrar dose agora').click()
  igual((await page.evaluate(() => document.getAnimations().length)), 0, 'folha abre sem animação')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
  igual(await page.getByRole('dialog').count(), 0, 'folha fechou')
  igual(await page.locator('[data-fantasma]').count(), 0, 'sem cópia de saída')
  igual(await page.evaluate(() => document.getAnimations().length), 0, 'nenhuma animação')
  await page.getByText('Frasco: 2 doses restantes').waitFor()
  await B('Desfazer').click()
  await page.getByText('Frasco: 3 doses restantes').waitFor()
  igual(await page.evaluate(() => document.getAnimations().length), 0, 'desfazer sem animação')
  await page.goto(BASE + '#/hoje')
  await page.getByRole('navigation').getByRole('link', { name: 'Peso' }).click()
  await page.waitForURL(/#\/peso$/)
  igual(await page.evaluate(() => document.getAnimations().length), 0, 'troca de tela sem animação')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
})
// ---------- painel da tela Hoje: semana, próximas doses, avisos ----------
const semana = () => page.locator('section[aria-labelledby="t-semana"]')
const numerosSemana = async () => {
  const t = (await semana().locator('p').textContent()) ?? ''
  const m = t.match(/(\d+) de (\d+)/)
  if (!m) throw new Error(`resumo da semana sem números: ${t}`)
  return [Number(m[1]), Number(m[2])]
}
await passo('Hoje mostra a semana (7 dias, hoje destacado) e as próximas doses agrupadas por dia', async () => {
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  igual(await semana().getByRole('button').count(), 7, 'sete dias na faixa')
  const hojeCel = semana().locator('[aria-current="date"]')
  igual(await hojeCel.count(), 1, 'um dia destacado como hoje')
  igual((await hojeCel.textContent()).startsWith('hoje'), true, 'rótulo "hoje" na célula')
  if (!/prevista/.test(await hojeCel.getAttribute('aria-label'))) throw new Error('célula sem descrição em texto')
  const [feitas, previstas] = await numerosSemana()
  if (!(previstas >= 4 && feitas <= previstas)) throw new Error(`números da semana estranhos: ${feitas} de ${previstas}`)
  const proximas = page.locator('section[aria-labelledby="t-proximas"]')
  await proximas.getByText(/^Amanhã · \d\d\/\d\d$/).waitFor()
  const linhas = proximas.locator('a[href*="/protocolos/"]')
  igual(await linhas.count(), 5, 'cinco próximas doses')
  igual(await proximas.getByRole('link', { name: 'Ver tudo' }).getAttribute('href'), '#/protocolos', 'Ver tudo leva a Protocolos')
})
await passo('registrar a dose de hoje atualiza a faixa da semana e o resumo', async () => {
  await page.goto(BASE + '#/hoje')
  const [feitas, previstas] = await numerosSemana()
  const rotuloAntes = await semana().locator('[aria-current="date"]').getAttribute('aria-label')
  await page.locator('main').getByRole('button', { name: 'Registrar dose', exact: true }).click()
  const fiz = page.getByRole('dialog').getByRole('button', { name: 'Fiz agora' })
  const salvar = page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' })
  await fiz.or(salvar).first().waitFor()
  if (await fiz.count()) await fiz.click()
  await salvar.click()
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
  await semana().locator('p').filter({ hasText: `${feitas + 1} de ${previstas}` }).waitFor()
  const rotuloDepois = await semana().locator('[aria-current="date"]').getAttribute('aria-label')
  if (rotuloAntes === rotuloDepois) throw new Error(`célula de hoje não mudou: ${rotuloDepois}`)
})
await passo('tocar num dia abre a lista do dia com o estado de cada dose; dose futura não é botão', async () => {
  await semana().locator('[aria-current="date"]').click()
  const folha = page.getByRole('dialog')
  await folha.getByRole('heading', { name: /^Hoje, \d\d\/\d\d$/ }).waitFor()
  await folha.getByText(/Tomada às/).first().waitFor()
  if ((await folha.locator('li').count()) < 4) throw new Error('lista do dia incompleta')
  await folha.getByRole('button', { name: 'Fechar' }).click()
  await folha.waitFor({ state: 'detached' })
  const depois = semana().locator('[aria-current="date"] ~ button')
  if (await depois.count()) {
    await depois.first().click()
    await page.getByRole('dialog').getByText('prevista', { exact: false }).first().waitFor()
    igual(await page.getByRole('dialog').locator('li button').count(), 0, 'dose futura sem botão de registrar')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
  }
})
await passo('dose de ontem sem registro: aviso em Atenção registra pelo fluxo de dose atrasada', async () => {
  // simula um protocolo que começou dois dias atrás (escrita direta no banco + recarregar)
  const b = await lerBanco()
  const linha00 = b.itens.find((i) => i.horarios.includes('00:00') && b.protocolos.find((p) => p.id === i.protocoloId)?.id !== tesa.id)
  const ontem = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  await page.evaluate(async ({ id, ontem }) => {
    const r = indexedDB.open('peptide-tracker')
    const db = await new Promise((ok) => { r.onsuccess = () => ok(r.result) })
    await new Promise((ok) => {
      const t = db.transaction('protocolos', 'readwrite')
      const s = t.objectStore('protocolos')
      const q = s.get(id)
      q.onsuccess = () => { s.put({ ...q.result, inicio: ontem }) }
      t.oncomplete = ok
    })
    db.close()
  }, { id: linha00.protocoloId, ontem })
  await page.reload()
  const aviso = page.locator('section[aria-labelledby="t-atencao"]').getByRole('button', { name: /Ontem às 00:00/ })
  await aviso.click()
  await page.getByRole('dialog').getByText(/prevista ontem às 00:00/).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Fiz agora' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
  await aviso.waitFor({ state: 'detached' })
  const reg = (await lerBanco()).aplicacoes.find((a) => a.itemId === linha00.id && a.previsto === `${ontem} 00:00`)
  igual(reg?.status, 'feita', 'registro ligado à dose de ontem')
})
let hrefFrasco
await passo('frasco acabando: aviso em Atenção aparece e leva ao Novo frasco já ligado à linha', async () => {
  await page.goto(BASE + '#/protocolos/' + tesa.id)
  await page.getByText('Frasco: 3 doses restantes').waitFor()
  await B('Registrar dose agora').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByText('Frasco: 2 doses restantes').waitFor()
  await page.goto(BASE + '#/hoje')
  const aviso = page.locator('section[aria-labelledby="t-atencao"]').getByRole('link', { name: /Frasco de Tesamorelina: 2 doses restantes/ })
  await aviso.waitFor()
  hrefFrasco = await aviso.getAttribute('href')
  await aviso.click()
  await page.waitForURL(/#\/estoque\/frasco\/novo\?sub=.+&item=.+$/)
  await page.getByText(/Vai ficar ligado ao protocolo/).waitFor()
  const linha = (await lerBanco()).itens.find((i) => i.protocoloId === tesa.id)
  if (!page.url().includes(`item=${linha.id}`)) throw new Error(`levou para a linha errada: ${page.url()}`)
})
await passo('F5 mantém a semana, os números e os avisos', async () => {
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  const antes = await numerosSemana()
  const rotulos = await semana().getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  await page.reload()
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  igual((await numerosSemana()).join(' de '), antes.join(' de '), 'resumo da semana depois do F5')
  igual(JSON.stringify(await semana().getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))), JSON.stringify(rotulos), 'dias depois do F5')
  igual(await page.locator(`section[aria-labelledby="t-atencao"] a[href="${hrefFrasco}"]`).count(), 1, 'aviso do frasco depois do F5')
  igual(await page.getByRole('button', { name: /Ontem às 00:00/ }).count(), 0, 'aviso de ontem continua resolvido')
})
await passo('Hoje em 360 × 640 e com "reduzir movimento": sem rolagem lateral, sem alvo pequeno, folha do dia sem animação', async () => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  const larg = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  if (larg[0] > larg[1]) throw new Error(`rolagem lateral: ${larg.join(' > ')}`)
  const menor = await semana().getByRole('button').evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().width)))
  if (menor < 43.5) throw new Error(`dia da semana com ${menor}px de largura`)
  await semana().locator('[aria-current="date"]').click()
  await page.getByRole('dialog').waitFor()
  igual(await page.evaluate(() => document.getAnimations().length), 0, 'nada animando')
  await page.keyboard.press('Escape')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 390, height: 844 })
})
await passo('nenhum alvo de toque menor que 44 px nas telas novas', async () => {
  for (const rota of ['#/protocolos', '#/hoje', '#/estoque', '#/protocolos/' + reta.id, '#/historico']) {
    await page.goto(BASE + rota)
    await page.locator('h1').first().waitFor()
    await page.waitForTimeout(400)
    const pequenos = await page.evaluate(() =>
      [...document.querySelectorAll('#root a, #root button, #root [role=radio], #root select, #root input')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), r: el.getBoundingClientRect() }))
        .filter((x) => x.r.height < 43.5 || x.r.width < 43.5)
        .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
    )
    if (pequenos.length) throw new Error(`${rota}: ${pequenos.join(', ')}`)
  }
})
// ---------- dose também em unidades da seringa ("2 mg · 10 un") ----------
const DOSE_10 = /2\s*mg · 10\s*un/
const DOSE_20 = /2\s*mg · 20\s*un/
let ipa
await passo('unidades: cadastro com a calculadora (10 mg em 0,5 mL, dose 2 mg) mostra "2 mg · 10 un" no passo 2, no detalhe, em Protocolos e em Hoje', async () => {
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('ipamo')
  await page.getByRole('option', { name: /Ipamorelina/ }).first().click()
  await page.getByPlaceholder('Digite o número').fill('2')
  await B('mg').click()
  const calc = page.locator('section', { has: page.getByRole('heading', { name: 'Calculadora da seringa' }) })
  await page.getByLabel('No frasco (mg)').fill('10')
  await page.getByLabel('Água que você pôs (mL)').fill('0,5')
  await calc.getByText('10 unidades', { exact: true }).waitFor() // a calculadora e o resto do app dão o mesmo número
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('00:01')
  await page.getByText(/Ipamorelina · 2\s*mg · 10\s*un/).waitFor()
  await salvarProtocolo()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  ipa = (await lerBanco()).protocolos.find((p) => page.url().endsWith(p.id))
  await page.locator('main').getByText(/2\s*mg · 10\s*un · todo dia/i).waitFor()
  const proximas = page.locator('section', { has: page.getByRole('heading', { name: 'Próximas doses' }) })
  igual(await proximas.getByText(DOSE_10).count() > 0, true, 'Próximas doses do detalhe com as unidades')
  await page.goto(BASE + '#/protocolos')
  await page.locator(`a.card[href$="/protocolos/${ipa.id}"]`).getByText(DOSE_10).waitFor()
  await page.goto(BASE + '#/hoje')
  await page.locator('main button', { hasText: 'Ipamorelina' }).getByText(/2\s*mg · 10\s*un · atrasada/).waitFor()
})
await passo('unidades: folha de dose mostra as unidades grandes e o mL; o registro grava as unidades e o histórico mostra', async () => {
  await page.goto(BASE + '#/protocolos/' + ipa.id)
  await B('Registrar dose agora').click()
  const folha = page.getByRole('dialog')
  const seringa = folha.locator('[data-seringa]')
  await seringa.getByText('10 unidades', { exact: true }).waitFor()
  await seringa.getByText(/^2\s*mg equivalem a$/).waitFor()
  await seringa.getByText(/na seringa \(0,1 mL\)/).waitFor()
  const c = await contraste('[data-seringa] b')
  if (c < 4.5) throw new Error(`contraste das unidades ${c.toFixed(2)}`)
  // digitar outra dose recalcula na hora (sem salvar)
  await folha.getByLabel('Dose aplicada').fill('0,05')
  await seringa.getByText('Menos de meia unidade', { exact: false }).waitFor()
  await folha.getByLabel('Dose aplicada').fill('25')
  await seringa.getByText(/Passa de 100 unidades/).waitFor()
  await folha.getByLabel('Dose aplicada').fill('2')
  await seringa.getByText('10 unidades', { exact: true }).waitFor()
  await capturar('folha-de-dose-390')
  await folha.getByRole('button', { name: 'Salvar registro' }).click()
  await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
  const b = await lerBanco()
  const linha = b.itens.find((i) => i.protocoloId === ipa.id)
  const reg = b.aplicacoes.find((a) => a.itemId === linha.id && a.status === 'feita')
  igual(reg.unidadesSeringa, 10, 'unidades gravadas no registro')
  await page.getByRole('button', { name: /Ipamorelina · 2\s*mg · 10\s*un/ }).waitFor() // Últimos registros
  await page.goto(BASE + '#/historico?p=' + ipa.id)
  await page.locator('main').getByText(DOSE_10).first().waitFor()
})
await passo('unidades: mudar a diluição do frasco muda as próximas doses e não muda o histórico', async () => {
  const linha = (await lerBanco()).itens.find((i) => i.protocoloId === ipa.id)
  await page.goto(BASE + `#/estoque/frasco/${linha.frascoId}/reconstituir`)
  await page.getByLabel('Diluente (mL)').fill('1')
  await B('Salvar').click()
  await page.getByRole('status').filter({ hasText: 'Reconstituição salva' }).waitFor()
  await page.goto(BASE + '#/estoque')
  await page.locator('div.card', { has: page.locator(`a[href$="/estoque/frasco/${linha.frascoId}"]`) }).getByText(/Cada dose de 2\s*mg equivale a 20\s*un na seringa/).waitFor()
  await page.goto(BASE + '#/protocolos/' + ipa.id)
  await page.locator('main').getByText(/2\s*mg · 20\s*un · todo dia/i).waitFor()
  await page.getByRole('button', { name: /Ipamorelina · 2\s*mg · 10\s*un/ }).waitFor() // o registro feito continua com 10
  await B('Registrar dose agora').click()
  const seringa = page.getByRole('dialog').locator('[data-seringa]')
  await seringa.getByText('20 unidades', { exact: true }).waitFor()
  await seringa.getByText(/A diluição do frasco mudou: agora a mesma dose equivale a 20\s*unidades \(antes 10\)/).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.goto(BASE + '#/historico?p=' + ipa.id)
  await page.locator('main').getByText(DOSE_10).first().waitFor()
  igual(await page.locator('main').getByText(DOSE_20).count(), 0, 'histórico não muda com a diluição nova')
  await page.goto(BASE + '#/hoje')
  await page.locator('main button', { hasText: 'Ipamorelina' }).getByText(/Tomada às .* · 2\s*mg · 10\s*un/).waitFor()
})
await passo('unidades: frasco lacrado e protocolo sem frasco mostram só mg (com atalho para informar a diluição)', async () => {
  // Retatrutida: frasco de 12 mg lacrado (sem água informada)
  await page.goto(BASE + '#/protocolos/' + reta.id)
  await page.locator('main').getByText(/^2\s*mg · todo dia/i).waitFor()
  await L('Informe a diluição para ver as unidades').waitFor()
  await B('Registrar dose agora').click()
  const folha = page.getByRole('dialog')
  await folha.getByRole('link', { name: 'Informe a diluição para ver as unidades' }).waitFor()
  igual(await folha.locator('[data-seringa]').count(), 0, 'sem bloco de unidades sem diluição')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  // protocolo novo sem frasco nenhum
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('semag')
  await page.getByRole('option', { name: /Semaglutida/ }).first().click()
  await page.getByPlaceholder('Digite o número').fill('0,25')
  await B('mg').click()
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('23:58')
  await salvarProtocolo()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  await page.locator('main').getByText(/^0,25\s*mg · todo dia/i).waitFor()
  igual(await page.locator('main').getByText(/0,25\s*mg · [\d,]+\s*un/).count(), 0, 'sem frasco: sem unidades')
})
await passo('unidades em 360 × 640: sem rolagem lateral, sem alvo pequeno, número inteiro (sem cortar)', async () => {
  await page.setViewportSize({ width: 360, height: 640 })
  for (const rota of ['#/hoje', '#/protocolos', '#/protocolos/' + ipa.id, '#/historico?p=' + ipa.id, '#/estoque']) {
    await page.goto(BASE + rota)
    await page.locator('h1').first().waitFor()
    await page.waitForTimeout(300)
    const larg = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    if (larg[0] > larg[1]) throw new Error(`${rota}: rolagem lateral ${larg.join(' > ')}`)
    // nenhum texto com unidades cortado por reticências/overflow
    const cortados = await page.evaluate(() =>
      [...document.querySelectorAll('#root *')]
        .filter((el) => el.children.length === 0 && /\d\s*un\b/.test(el.textContent ?? '') && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    )
    if (cortados.length) throw new Error(`${rota}: texto cortado: ${cortados.join(' | ')}`)
    if (rota === '#/hoje') await capturar('hoje-360')
    if (rota === '#/protocolos/' + ipa.id) await capturar('detalhe-360')
  }
  await page.goto(BASE + '#/protocolos/' + ipa.id)
  await B('Registrar dose agora').click()
  await page.getByRole('dialog').locator('[data-seringa]').waitFor()
  await page.waitForTimeout(400)
  const pequenos = await page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog] a, [role=dialog] button, [role=dialog] select, [role=dialog] input')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.height < 43.5 || x.r.width < 43.5)
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
  )
  if (pequenos.length) throw new Error(`folha de dose: ${pequenos.join(', ')}`)
  const larg = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  if (larg[0] > larg[1]) throw new Error(`folha de dose: rolagem lateral ${larg.join(' > ')}`)
  await capturar('folha-de-dose-360')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
})
// ---------- backup assistido ----------
const lembrete = () => page.locator('[data-lembrete-backup]')
const RISCO = 'Seus dados ficam só neste aparelho. Se trocar de celular, limpar o navegador ou desinstalar o app, só o backup traz tudo de volta.'
await passo('backup: depois dos registros de dose, o lembrete aparece em Atenção na Hoje, com o aviso de risco (390 e 360)', async () => {
  igual(await lerConfig('ultimoBackup'), undefined, 'ainda sem backup')
  await page.goto(BASE + '#/hoje')
  await lembrete().waitFor()
  igual(await page.locator('section[aria-labelledby="t-atencao"] [data-lembrete-backup]').count(), 1, 'lembrete dentro de Atenção')
  await lembrete().getByText('Você ainda não tem backup', { exact: true }).waitFor()
  await lembrete().getByText(RISCO, { exact: true }).waitFor()
  await lembrete().getByRole('button', { name: 'Enviar backup agora' }).waitFor()
  await lembrete().getByRole('button', { name: 'Lembrar depois' }).waitFor()
  await lembrete().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await conferirTela('Hoje com lembrete (390)')
  await capturar('hoje-lembrete-backup-390')
  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(300)
  await lembrete().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await conferirTela('Hoje com lembrete (360)')
  await capturar('hoje-lembrete-backup-360')
  await page.setViewportSize({ width: 390, height: 844 })
})
await passo('backup: "Enviar backup agora" sem compartilhar no navegador baixa o arquivo com a data, explica onde ficou, grava a data e o lembrete some (F5 mantém)', async () => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
  const [baixado] = await Promise.all([page.waitForEvent('download'), lembrete().getByRole('button', { name: 'Enviar backup agora' }).click()])
  if (!/^peptide-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/.test(baixado.suggestedFilename())) throw new Error(`nome do arquivo: ${baixado.suggestedFilename()}`)
  const conteudo = JSON.parse(await (await import('node:fs/promises')).readFile(await baixado.path(), 'utf8'))
  igual(conteudo.app, 'peptide-tracker', 'arquivo é o backup do app')
  igual(conteudo.tabelas.aplicacoes.length > 0, true, 'arquivo com os registros')
  const dlg = page.getByRole('alertdialog', { name: 'Backup salvo no aparelho' })
  await dlg.getByText(/Downloads/).first().waitFor()
  await dlg.getByText(baixado.suggestedFilename()).waitFor()
  await B('Entendi').click()
  await lembrete().waitFor({ state: 'detached' })
  if (!(await lerConfig('ultimoBackup'))) throw new Error('data do último backup não foi gravada')
  await page.reload()
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  await page.waitForTimeout(500)
  igual(await lembrete().count(), 0, 'lembrete continua fora depois do F5')
  await page.goto(BASE + '#/ajustes/backup')
  await page.locator('[data-ultimo-backup]').getByText(/^Último backup: hoje \(\d{2}\/\d{2}\)$/).waitFor()
})
await passo('backup: 7 dias sem backup e com registro novo, o lembrete volta; "Enviar backup agora" usa o compartilhar do sistema e o lembrete some (F5 mantém)', async () => {
  const oitoDias = new Date(Date.now() - 8 * 86400000).toISOString()
  await gravarConfig('ultimoBackup', oitoDias)
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  await page.waitForTimeout(500)
  igual(await lembrete().count(), 0, 'sem dado novo desde o backup: sem lembrete, mesmo 8 dias depois')
  // dado novo: um registro avulso
  await page.goto(BASE + '#/protocolos/' + ipa.id)
  await B('Registrar dose agora').click()
  await B('Salvar registro').click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.goto(BASE + '#/hoje')
  await lembrete().getByText('Último backup há 8 dias', { exact: true }).waitFor()
  await page.evaluate(() => {
    window.__enviados = []
    Object.defineProperty(navigator, 'canShare', { value: (d) => !!d?.files?.length, configurable: true })
    Object.defineProperty(navigator, 'share', { value: async (d) => { window.__enviados.push(d.files.map((f) => `${f.name}|${f.type}|${f.size}`)) }, configurable: true })
  })
  await lembrete().getByRole('button', { name: 'Enviar backup agora' }).click()
  await page.getByRole('status').filter({ hasText: 'Backup enviado' }).waitFor()
  const enviados = await page.evaluate(() => window.__enviados)
  igual(enviados.length, 1, 'um compartilhamento')
  if (!/^peptide-tracker-backup-\d{4}-\d{2}-\d{2}\.json\|application\/json\|\d+$/.test(enviados[0][0])) throw new Error(`arquivo compartilhado: ${enviados[0][0]}`)
  await lembrete().waitFor({ state: 'detached' })
  const novo = await lerConfig('ultimoBackup')
  if (!novo || novo <= oitoDias) throw new Error('data do último backup não atualizou')
  await page.reload()
  await page.getByRole('heading', { name: 'Sua semana' }).waitFor()
  await page.waitForTimeout(500)
  igual(await lembrete().count(), 0, 'lembrete continua fora depois do F5')
})
await passo('backup: tela Backup mostra último backup, armazenamento e tamanho; cancelar o envio não é erro e não muda a data (360 × 640)', async () => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto(BASE + '#/ajustes/backup')
  await page.getByText(RISCO, { exact: true }).waitFor()
  await page.locator('[data-ultimo-backup]').getByText(/^Último backup: hoje/).waitFor()
  await page.getByText(/^(Armazenamento protegido|Não protegido|Este navegador não informa)/).waitFor()
  await page.locator('[data-tamanho-backup]').getByText(/\d+(,\d)?\s*(B|KB|MB) · \d+ fotos?/).waitFor()
  await conferirTela('Backup (360)')
  await capturar('backup-360')
  await B('Enviar backup para mim').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await capturar('backup-botoes-360')
  const antes = await lerConfig('ultimoBackup')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('cancelado', 'AbortError') }, configurable: true })
  })
  await B('Enviar backup para mim').click()
  await page.getByRole('status').filter({ hasText: 'Envio cancelado' }).waitFor()
  igual(await page.getByRole('alertdialog').count(), 0, 'cancelar não abre erro')
  igual(await lerConfig('ultimoBackup'), antes, 'cancelar não conta como backup')
  // falha do sistema: mensagem clara com a opção de baixar
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: async () => { throw new TypeError('falhou') }, configurable: true }))
  await B('Enviar backup para mim').click()
  const erro = page.getByRole('alertdialog', { name: 'Não deu para enviar' })
  await erro.getByText(/não conseguiu abrir o envio/).waitFor()
  await page.waitForTimeout(400) // fim da animação de entrada do diálogo
  await conferirTela('erro do envio (360)', '[role=alertdialog]')
  await erro.getByRole('button', { name: 'Fechar' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
})
// ---------- primeiro acesso curto: convite para instalar, contagem, Pular, editar, usuário antigo ----------
await passo('editar protocolo sem campos avançados: as mesmas 2 telas, "Mais opções" fechado; com nome/fim: abre sozinho', async () => {
  await page.goto(BASE + '#/protocolos/' + reta.id + '/editar')
  await page.waitForURL(/#\/novo\/substancia$/)
  await page.getByText('Passo 1 de 2').waitFor()
  igual(await page.getByPlaceholder('Digite o número').inputValue(), '2', 'dose do protocolo')
  igual(await B('mg').getAttribute('aria-pressed'), 'true', 'unidade gravada')
  await B('Continuar').click()
  await page.waitForURL(/#\/novo\/frequencia$/)
  const mais = page.getByRole('button', { name: /^Mais opções/ })
  igual(await mais.getAttribute('aria-expanded'), 'false', 'fechado: só a cor (automática ou escolhida) não abre')
  await mais.click()
  await page.getByPlaceholder('Ex.: meu protocolo da pele').fill('Ciclo de teste')
  await page.getByLabel('Unidade da duração').selectOption('semanas')
  await page.getByLabel('Duração', { exact: true }).fill('6')
  await salvarProtocolo()
  await page.getByRole('alertdialog', { name: 'Salvar a alteração?' }).getByRole('button', { name: 'Salvar a partir de hoje' }).click()
  await page.waitForURL(new RegExp(`#/protocolos/${reta.id}$`))
  igual(await h1(), 'Ciclo de teste', 'nome novo no detalhe')
  await page.goto(BASE + '#/protocolos/' + reta.id + '/editar')
  await page.waitForURL(/#\/novo\/substancia$/)
  await B('Continuar').click()
  igual(await page.getByRole('button', { name: /^Mais opções/ }).getAttribute('aria-expanded'), 'true', 'aberto com nome e fim preenchidos')
  igual(await page.getByPlaceholder('Ex.: meu protocolo da pele').inputValue(), 'Ciclo de teste', 'nome no campo')
  await conferirTela('editar, passo 2 com Mais opções')
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.waitForURL(/#\/novo\/substancia$/)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.waitForURL(new RegExp(`#/protocolos/${reta.id}$`))
  igual(await pedidoAvisos().count(), 0, 'pedido de avisos não volta em outros protocolos')
})

/** Abre um aparelho novo (perfil limpo) no tamanho pedido, com a mesma checagem de console. */
async function aparelhoNovo(largura, altura, extra = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR', timezoneId: FUSO, ...extra })
  const p = await ctx.newPage()
  p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problemas.push(`console ${m.type()}: ${m.text()}`))
  p.on('pageerror', (e) => problemas.push(`erro na página: ${e.message}`))
  return { ctx, p }
}
/** Mesma checagem de tela (alvo >= 44 px, sem rolagem lateral, sem inglês) numa página qualquer. */
async function conferirEm(p, onde, raiz = '#root') {
  const antes = page
  page = p
  try { await conferirTela(onde, raiz) } finally { page = antes }
}

await passo('primeiro acesso mínimo (360 × 640): Boas-vindas+18+ → O quê e quanto → Quando → Hoje = 3 telas e 6 toques, unidade já marcada', async () => {
  const { ctx, p } = await aparelhoNovo(360, 640)
  let toques = 0
  const toque = async (loc) => { toques++; await loc.click() }
  const telas = []
  const tela = async (nome) => {
    await p.locator('h1').first().waitFor()
    await p.waitForTimeout(350)
    telas.push((await p.locator('h1').first().textContent()).trim())
    await conferirEm(p, nome)
    await conferirContraste(nome, p)
    if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/primeiro-acesso-${nome.replace(/\s+/g, '-')}.png` })
  }
  await p.goto(BASE)
  await p.waitForURL(/#\/boas-vindas$/)
  await tela('boas-vindas 360')
  await toque(p.getByLabel('Tenho 18 anos ou mais'))
  await toque(p.getByLabel('Entendi que o app é só um registro pessoal'))
  await toque(p.getByRole('button', { name: 'Começar', exact: true }))
  await p.waitForURL(/#\/novo\/substancia$/)
  await tela('passo 1 busca 360')
  await p.getByPlaceholder('Buscar ou digitar o nome').fill('tirze') // digitar (teclado), não conta como toque de botão
  await toque(p.getByRole('option', { name: /Tirzepatida/ }).first())
  igual(await p.getByRole('button', { name: 'mg', exact: true }).getAttribute('aria-pressed'), 'true', 'mg já marcado')
  await p.getByPlaceholder('Digite o número').fill('2,5') // o campo da dose já vem com o cursor
  await conferirEm(p, 'passo 1 dose 360')
  await toque(p.getByRole('button', { name: 'Continuar', exact: true }))
  await p.waitForURL(/#\/novo\/frequencia$/)
  await tela('passo 2 360')
  await toque(p.locator('[data-salvar]'))
  await p.waitForURL(/#\/hoje$/)
  igual(await p.getByText('Escolha a unidade.').count(), 0, 'sem "Escolha a unidade." no caminho padrão')
  await p.getByRole('alertdialog', { name: PEDIDO_AVISOS }).waitFor()
  await p.waitForTimeout(400) // fim da animação de entrada
  await conferirEm(p, 'pedido de avisos 360', '[role=alertdialog]') // botões não encolhem no diálogo alto
  await conferirContraste('pedido de avisos 360', p, '[role=alertdialog]')
  igual(telas.length, 3, `telas antes da Hoje (${telas.join(' → ')})`)
  igual(telas.join(' → '), 'Seu diário de protocolos → O quê e quanto → Quando', 'caminho')
  if (toques > 6) throw new Error(`${toques} toques`)
  const b = await tudoNoBanco(p)
  igual(b.protocolos.length, 1, 'protocolo salvo')
  igual(b.itens[0].doseUnidade, 'mg', 'unidade salva')
  igual(b.itens[0].horarios.join(','), '08:00', 'horário padrão')
  igual(b.protocolos[0].fim, undefined, 'sem data de fim por padrão')
  console.log(`   ${telas.length} telas, ${toques} toques + a dose digitada`)
  await ctx.close()
})

await passo('"Pular, ver o app primeiro" (boas-vindas e passo 1) leva à Hoje vazia; com permissão, "Sim" ativa os avisos', async () => {
  const { ctx, p } = await aparelhoNovo(390, 844, { permissions: ['notifications'] })
  await p.goto(BASE)
  await p.waitForURL(/#\/boas-vindas$/)
  await p.getByLabel('Tenho 18 anos ou mais').check()
  await p.getByLabel('Entendi que o app é só um registro pessoal').check()
  await p.getByRole('button', { name: 'Pular, ver o app primeiro', exact: true }).click()
  await p.waitForURL(/#\/hoje$/)
  await p.getByRole('heading', { name: 'Nada para hoje ainda' }).waitFor()
  igual((await tudoNoBanco(p)).config.find((c) => c.chave === 'aceite')?.valor?.versao, '1', 'Pular também grava o aceite')
  // Pular no passo 1 do primeiro acesso
  await p.goto(BASE + '#/novo?saida=/hoje')
  await p.waitForURL(/#\/novo\/substancia$/)
  await p.getByRole('button', { name: 'Pular, ver o app primeiro', exact: true }).click()
  await p.waitForURL(/#\/hoje$/)
  await p.getByRole('heading', { name: 'Nada para hoje ainda' }).waitFor()
  // criar pela Hoje vazia: o pedido aparece também aqui (é o 1º protocolo) e "Sim" ativa
  await p.getByRole('link', { name: 'Criar protocolo', exact: true }).click()
  await p.getByPlaceholder('Buscar ou digitar o nome').fill('semag')
  await p.getByRole('option', { name: /Semaglutida/ }).first().click()
  await p.getByPlaceholder('Digite o número').fill('0,25')
  await p.getByRole('button', { name: 'Continuar', exact: true }).click()
  await p.locator('[data-salvar]').click()
  await p.waitForURL(/#\/hoje$/)
  const dlg = p.getByRole('alertdialog', { name: PEDIDO_AVISOS })
  await dlg.getByRole('button', { name: 'Sim', exact: true }).click()
  await p.getByRole('status').filter({ hasText: 'Avisos ativados' }).waitFor()
  const cfg = (await tudoNoBanco(p)).config
  igual(cfg.find((c) => c.chave === 'canais')?.valor?.notificacao, true, 'canal de notificação ligado')
  igual(cfg.find((c) => c.chave === 'pedidoAvisos')?.valor, 'respondido', 'não repete')
  await ctx.close()
})

await passo('convite para instalar: aparece na Hoje depois do 1º registro de dose; "Agora não" some e não volta', async () => {
  // o aparelho principal respondeu "Agora não"; um aparelho novo mostra o convite depois do 1º registro
  const { ctx, p } = await aparelhoNovo(390, 844)
  const convite = p.locator('[data-convite-instalar]')
  await p.goto(BASE)
  await p.getByLabel('Tenho 18 anos ou mais').check()
  await p.getByLabel('Entendi que o app é só um registro pessoal').check()
  await p.getByRole('button', { name: 'Começar', exact: true }).click()
  await p.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await p.getByRole('option', { name: /BPC-157/ }).first().click()
  await p.getByPlaceholder('Digite o número').fill('250')
  await p.getByRole('button', { name: 'mcg', exact: true }).click()
  await p.getByRole('button', { name: 'Continuar', exact: true }).click()
  await p.getByLabel('Horário', { exact: true }).fill('00:00')
  await p.locator('[data-salvar]').click()
  await p.waitForURL(/#\/hoje$/)
  await p.getByRole('alertdialog', { name: PEDIDO_AVISOS }).getByRole('button', { name: 'Agora não', exact: true }).click()
  await p.waitForTimeout(400)
  igual(await convite.count(), 0, 'sem convite antes do 1º registro')
  await p.locator('main button', { hasText: '00:00' }).click()
  await p.getByRole('button', { name: 'Fiz agora', exact: true }).click()
  await p.getByRole('button', { name: 'Salvar registro', exact: true }).click()
  await convite.waitFor()
  await convite.getByText('Coloque o app na tela inicial').waitFor()
  await convite.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await conferirEm(p, 'convite para instalar')
  await convite.getByRole('button', { name: 'Agora não', exact: true }).click()
  await convite.waitFor({ state: 'detached' })
  await p.reload()
  await p.getByRole('heading', { name: 'Sua semana' }).waitFor()
  await p.waitForTimeout(400)
  igual(await convite.count(), 0, 'não volta depois do F5')
  igual((await tudoNoBanco(p)).config.find((c) => c.chave === 'conviteInstalar')?.valor, 'respondido', 'resposta gravada')
  // continua em Configurações
  await p.goto(BASE + '#/ajustes')
  await p.getByRole('link', { name: /Instalar na tela inicial/ }).waitFor()
  await p.getByRole('link', { name: /Lembretes e agenda/ }).waitFor()
  await ctx.close()
})

await passo('usuário antigo (aceite e primeiro acesso da versão anterior): não revê o primeiro acesso, nem o pedido de avisos, nem o convite', async () => {
  const { ctx, p } = await aparelhoNovo(390, 844)
  await p.goto(BASE)
  await p.waitForURL(/#\/boas-vindas$/)
  // grava como a versão anterior gravava: aceite v1 + onboarding concluído (instalar e lembretes)
  await p.evaluate(async () => {
    const r = indexedDB.open('peptide-tracker')
    const db = await new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error) })
    await new Promise((ok) => {
      const t = db.transaction('config', 'readwrite')
      t.objectStore('config').put({ chave: 'aceite', valor: { versao: '1', em: '2026-11-01T12:00:00.000Z' } })
      t.objectStore('config').put({ chave: 'onboarding', valor: true })
      t.objectStore('config').put({ chave: 'canais', valor: { agenda: true, notificacao: false } })
      t.oncomplete = ok
    })
    db.close()
  })
  for (const rota of ['', '#/', '#/instalar?primeiro=1', '#/lembrar']) {
    await p.goto(BASE + rota)
    await p.waitForTimeout(300)
    if (/boas-vindas|lembrar/.test(p.url())) throw new Error(`usuário antigo viu o primeiro acesso em ${rota || 'raiz'}: ${p.url()}`)
  }
  await p.goto(BASE)
  await p.waitForURL(/#\/hoje$/)
  await p.getByRole('link', { name: 'Criar protocolo', exact: true }).click()
  await p.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await p.getByRole('option', { name: /BPC-157/ }).first().click()
  await p.getByPlaceholder('Digite o número').fill('250')
  await p.getByRole('button', { name: 'Continuar', exact: true }).click()
  await p.getByLabel('Horário', { exact: true }).fill('00:00')
  await p.locator('[data-salvar]').click()
  await p.waitForURL(/#\/hoje$/)
  await p.locator('main button', { hasText: '00:00' }).click()
  await p.getByRole('button', { name: 'Fiz agora', exact: true }).click()
  await p.getByRole('button', { name: 'Salvar registro', exact: true }).click()
  await p.locator('main', { hasText: 'Tomada às' }).waitFor()
  await p.waitForTimeout(500)
  igual(await p.getByRole('alertdialog', { name: PEDIDO_AVISOS }).count(), 0, 'sem pedido de avisos')
  igual(await p.locator('[data-convite-instalar]').count(), 0, 'sem convite para instalar')
  igual((await tudoNoBanco(p)).config.find((c) => c.chave === 'aceite')?.valor?.em, '2026-11-01T12:00:00.000Z', 'aceite anterior mantido')
  await ctx.close()
})
// ---------- tema único: claro (fundo cinza-azulado, cartões brancos, acento azul) ----------
const corDoFundo = rgbDe(PALETA.fundo)
/** [tem data-tema?, fundo do body, theme-color, color-scheme, cópia antiga do tema no localStorage] */
const estadoTema = (p = page) => p.evaluate(() => [document.documentElement.hasAttribute('data-tema'), getComputedStyle(document.body).backgroundColor, document.querySelector('meta[name="theme-color"]').content, document.querySelector('meta[name="color-scheme"]').content, localStorage.getItem('pt-tema')])
const TEMA_CLARO = `false ${corDoFundo} ${PALETA.fundo} light `

await passo('tema claro único: Ajustes sem "Aparência" nem escolha de tema; barra do sistema e esquema claros', async () => {
  await page.goto(BASE + '#/ajustes')
  await page.getByRole('heading', { name: 'Configurações', level: 1 }).waitFor()
  igual(await page.getByRole('group', { name: 'Tema' }).count(), 0, 'sem grupo Tema')
  igual(await page.getByRole('radio').count(), 0, 'sem opções de tema')
  igual(await page.getByText('Aparência').count(), 0, 'sem seção Aparência')
  igual((await estadoTema()).join(' '), TEMA_CLARO, 'tema claro')
})

for (const [w, h] of [[390, 844], [360, 640]]) {
  await passo(`tema claro em ${w} × ${h}: Hoje, folha de dose, Protocolos, detalhe, Estoque, Peso, Backup e Ajustes com todo texto >= 4,5:1, sem alvo pequeno, sem rolagem lateral`, async () => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(BASE + '#/hoje')
    await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
    const coresProt = await page.locator('main [data-estado]').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderLeftColor))
    if (!coresProt.length) throw new Error('nenhuma dose na Hoje')
    const tons = CORES_PROTOCOLO.map((c) => rgbDe(c.hex))
    for (const c of coresProt) if (!tons.includes(c)) throw new Error(`cor de protocolo fora da paleta: ${c}`)
    const cartao = page.locator('main .sobre-acento').first()
    if (await cartao.count()) {
      igual(await cartao.evaluate((el) => getComputedStyle(el).backgroundColor), rgbDe(PALETA.acento), 'cartão da próxima dose no azul do acento')
      igual(await cartao.evaluate((el) => getComputedStyle(el).color), rgbDe(PALETA['sobre-acento']), 'texto branco sobre o acento')
    }
    await conferirTela(`Hoje (${w})`)
    await conferirContraste(`Hoje (${w})`)
    await capturar(`claro-hoje-${w}`)
    await page.locator('main [data-estado]').first().click()
    const folha = page.getByRole('dialog')
    await folha.waitFor()
    await page.waitForTimeout(400)
    igual(await folha.evaluate((el) => getComputedStyle(el).backgroundColor), rgbDe(PALETA.sup), 'folha de dose branca')
    await conferirTela(`folha de dose (${w})`, '[role=dialog]')
    await conferirContraste(`folha de dose (${w})`, page, '[role=dialog]')
    await capturar(`claro-folha-de-dose-${w}`)
    await page.keyboard.press('Escape')
    await folha.waitFor({ state: 'detached' })
    await page.goto(BASE + '#/protocolos')
    await page.locator('a.card[href*="/protocolos/"]').first().waitFor()
    const detalhe = (await page.locator('a.card[href*="/protocolos/"]').first().getAttribute('href')).replace(/^.*#/, '#')
    for (const [rota, nome] of [['#/protocolos', 'protocolos'], [detalhe, 'detalhe'], ['#/estoque', 'estoque'], ['#/peso', 'peso'], ['#/ajustes/backup', 'backup'], ['#/ajustes', 'ajustes']]) {
      await page.goto(BASE + rota)
      await page.locator('h1').first().waitFor()
      await conferirTela(`${nome} (${w})`)
      await conferirContraste(`${nome} (${w})`)
      await capturar(`claro-${nome}-${w}`)
    }
    await page.goto(BASE + '#/peso')
    await page.locator('h1').first().waitFor()
    const linha = page.locator('svg .grafico-linha').first()
    if (await linha.count()) igual(await linha.evaluate((el) => getComputedStyle(el).stroke), rgbDe(PALETA.acento), 'linha do gráfico no acento')
  })
}
await page.setViewportSize({ width: 390, height: 844 })

await passo('tema claro: "Tudo feito hoje", celebração e aviso (toast) legíveis', async () => {
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
  for (let i = 0; i < 8 && !(await page.getByText('Tudo feito hoje').count()); i++) {
    await page.locator('main').getByRole('button', { name: 'Registrar dose', exact: true }).click()
    const fiz = page.getByRole('dialog').getByRole('button', { name: 'Fiz agora' })
    const salvar = page.getByRole('dialog').getByRole('button', { name: 'Salvar registro' })
    await fiz.or(salvar).first().waitFor()
    if (await fiz.count()) await fiz.click()
    await salvar.click()
    await page.getByRole('status').filter({ hasText: 'Dose registrada' }).waitFor()
    await page.waitForTimeout(300)
  }
  const aviso = page.getByRole('status').filter({ hasText: 'Dose registrada' })
  await page.getByRole('status').filter({ hasText: 'Tudo feito hoje' }).waitFor()
  await page.waitForTimeout(1000)
  igual(await aviso.evaluate((el) => getComputedStyle(el).backgroundColor), rgbDe(PALETA.sup2), 'aviso no cartão 2')
  await conferirContraste('Tudo feito + aviso', page, 'body')
  await capturar('claro-tudo-feito-390')
  await aviso.getByRole('button', { name: 'Desfazer' }).click()
  await page.locator('main').getByRole('button', { name: 'Registrar dose', exact: true }).waitFor()
})

await passo('F5 sem piscar: o 1º quadro já tem o fundo claro e nada de tema é marcado no <html>', async () => {
  await page.goto(BASE + '#/hoje')
  await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
  await page.addInitScript(() => {
    window.__marcas = []
    new MutationObserver((ms) => { for (const m of ms) if (m.target === document.documentElement) window.__marcas.push(m.attributeName) }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-tema', 'class'] })
    // 1º quadro: o que vier antes (DOMContentLoaded ou o 1º requestAnimationFrame), já com o <body>
    const marcar = () => { if (!window.__quadro1 && document.body) window.__quadro1 = getComputedStyle(document.body).backgroundColor }
    document.addEventListener('DOMContentLoaded', marcar)
    requestAnimationFrame(marcar)
  })
  await page.reload()
  await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
  const [quadro1, marcas] = await page.evaluate(() => [window.__quadro1, window.__marcas])
  igual(quadro1, corDoFundo, '1º quadro depois do F5')
  igual(marcas.includes('data-tema'), false, 'sem data-tema no <html>')
  igual((await estadoTema()).join(' '), TEMA_CLARO, 'tema claro depois do F5')
})

await passo('quem tinha Preto, Índigo ou Automático salvo: abre no claro sem erro e a cópia antiga do tema some', async () => {
  for (const antigo of ['preto', 'indigo', 'auto']) {
    await gravarConfig('tema', antigo)
    await page.evaluate((v) => localStorage.setItem('pt-tema', v), antigo)
    await page.reload()
    await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
    igual((await estadoTema()).join(' '), TEMA_CLARO, `claro com "${antigo}" salvo`)
  }
})

await passo('backup: exportação nova sem o campo "tema"; backups antigos com "tema" (Preto, Índigo, Automático) e sem ele importam e o app segue claro', async () => {
  await page.goto(BASE + '#/ajustes/backup')
  const [baixado] = await Promise.all([page.waitForEvent('download'), B('Só baixar o arquivo').click()])
  const texto = await (await import('node:fs/promises')).readFile(await baixado.path(), 'utf8')
  const arquivo = JSON.parse(texto)
  if (arquivo.tabelas.config.some((c) => c.chave === 'tema')) throw new Error('backup novo ainda leva o tema')
  const entendi = page.getByRole('alertdialog').getByRole('button', { name: 'Entendi' })
  if (await entendi.waitFor({ timeout: 3000 }).then(() => true, () => false)) await entendi.click()
  const restaurar = async (conteudo) => {
    await page.goto(BASE + '#/ajustes/backup')
    await page.getByTestId('arquivo-backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(conteudo) })
    await page.getByRole('alertdialog', { name: 'Restaurar este backup?' }).getByRole('button', { name: 'Restaurar', exact: true }).click()
    await page.waitForURL(/#\/hoje$/)
    await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor()
  }
  for (const valor of ['preto', 'indigo', 'auto', undefined]) {
    const config = valor === undefined ? arquivo.tabelas.config : [...arquivo.tabelas.config, { chave: 'tema', valor }]
    await restaurar(JSON.stringify({ ...arquivo, tabelas: { ...arquivo.tabelas, config } }))
    igual(await lerConfig('tema'), undefined, `tema "${valor}" ignorado na importação`)
    igual((await estadoTema()).join(' '), TEMA_CLARO, `claro depois de importar (tema "${valor}")`)
  }
})
await passo('nenhum erro ou aviso no console e nenhum HTTP com erro', async () => {
  if (problemas.length) throw new Error(problemas.join(' | '))
})

await navegador.close()
fechar()
console.log(`\n${n} passos ok`)
