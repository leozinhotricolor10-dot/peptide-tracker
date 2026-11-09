// Teste de fumaça de ponta a ponta no build de produção, servido como no GitHub Pages
// (subpasta /peptide-tracker/). Usa o Google Chrome já instalado (não baixa navegador).
//   npm run build && npm run e2e
// Falha (código 1) se algum passo não acontecer ou se aparecer erro/aviso no console.
import { chromium } from 'playwright-core'
import { servir } from '../tools/servir-pages.mjs'

const { url: BASE, fechar } = await servir(4199)
const navegador = await chromium.launch({ channel: process.env.E2E_CANAL ?? 'chrome', headless: true })
const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
const page = await contexto.newPage()
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
const B = (nome) => page.getByRole('button', { name: nome, exact: true })
const L = (nome) => page.getByRole('link', { name: nome, exact: true })
const h1 = () => page.locator('h1').first().textContent()
const igual = (a, b, msg) => {
  if (a !== b) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`)
}

await passo('abre na subpasta e cai nas boas-vindas', async () => {
  await page.goto(BASE)
  await page.waitForURL(/#\/boas-vindas$/)
})
await passo('recusar o aviso 18+ leva à saída sem gravar aceite', async () => {
  await L('Começar').click()
  igual(await B('Aceitar e continuar').isDisabled(), true, 'botão de aceitar inativo')
  await L('Não aceito').click()
  await page.getByRole('heading', { name: 'Tudo bem', level: 1 }).waitFor() // espera a troca de tela (antes lia o título cedo demais)
  await page.goto(BASE + '#/hoje')
  await page.waitForURL(/#\/boas-vindas$/)
})
await passo('aceitar e passar pelo onboarding', async () => {
  await L('Começar').click()
  await page.getByLabel('Tenho 18 anos ou mais').check()
  await page.getByLabel('Entendi que o app é só um registro pessoal').check()
  await B('Aceitar e continuar').click()
  await page.waitForURL(/#\/instalar/)
  await B('Agora não').click()
  await page.waitForURL(/#\/lembrar/)
  await B('Fazer isso depois').click()
  await page.waitForURL(/#\/hoje$/)
})
await passo('criar protocolo da lista (dose 1.000 é recusada, 250 mcg aceita)', async () => {
  await L('Criar protocolo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await page.getByRole('option', { name: /BPC-157/ }).first().click()
  await page.getByRole('button', { name: /Continuar com/ }).click()
  await page.getByPlaceholder('Digite o número').fill('1.000')
  await B('mcg').click()
  await B('Continuar').click()
  if (!/vírgula/.test((await page.getByRole('alert').textContent()) ?? '')) throw new Error('faltou o aviso do número ambíguo')
  await page.getByPlaceholder('Digite o número').fill('250')
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('00:00')
  await page.getByRole('button', { name: /Adicionar/ }).click()
  await B('Continuar').click()
  await B('Salvar protocolo').click()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
  igual(await h1(), 'BPC-157', 'nome do protocolo')
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
await passo('calculadora do passo 2: 5 mg em 2 mL, 250 mcg = 10 unidades, 20 doses; arredondamento à mostra; guarda o frasco', async () => {
  await page.goto(BASE + '#/protocolos')
  await L('Novo').click()
  await page.getByPlaceholder('Buscar ou digitar o nome').fill('bpc')
  await page.getByRole('option', { name: /BPC-157/ }).first().click()
  await page.getByRole('button', { name: /Continuar com/ }).click()
  await page.getByPlaceholder('Digite o número').fill('250')
  await B('mcg').click()
  const calc = page.locator('section', { has: page.getByRole('heading', { name: 'Calculadora da seringa' }) })
  await page.getByLabel('No frasco (mg)').fill('1.000')
  if (!/vírgula/.test((await calc.getByRole('alert').textContent()) ?? '')) throw new Error('faltou o aviso do número ambíguo na calculadora')
  await page.getByLabel('No frasco (mg)').fill('10')
  await page.getByLabel('Água que você pôs (mL)').fill('3')
  await calc.getByText('7,5 unidades').waitFor()
  await calc.getByText(/marca mais próxima é 8 unidades/).waitFor()
  await page.getByLabel('No frasco (mg)').fill('5')
  await page.getByLabel('Água que você pôs (mL)').fill('2')
  for (const t of ['2,5 mg/mL', '10 unidades', '20 doses']) await calc.getByText(t, { exact: true }).waitFor()
  await page.getByRole('switch', { name: /Guardar este frasco no Estoque/ }).check()
  await B('Continuar').click()
  await page.getByLabel('Horário', { exact: true }).fill('09:00')
  await page.getByRole('button', { name: /Adicionar/ }).click()
  await B('Continuar').click()
  await page.getByText('Frasco novo: 5 mg + 2 mL').waitFor()
  await B('Salvar protocolo').click()
  await page.waitForURL(/#\/protocolos\/[\w-]+$/)
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
  }
})
await passo('service worker ativo com escopo da subpasta e manifest certo', async () => {
  await page.goto(BASE + '#/hoje')
  const escopo = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  igual(escopo, BASE, 'escopo do service worker')
  const m = await (await page.request.get(BASE + 'manifest.webmanifest')).json()
  igual([m.start_url, m.scope, m.id].join(' '), '/peptide-tracker/ /peptide-tracker/ /peptide-tracker/', 'manifest')
})
await passo('sem internet: recarrega e mostra os dados', async () => {
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await contexto.setOffline(true)
  await page.goto(BASE + '#/hoje')
  await page.getByText('Sem internet.').waitFor()
  await page.locator('main', { hasText: 'Tomada às' }).waitFor()
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
await passo('nenhum erro ou aviso no console e nenhum HTTP com erro', async () => {
  if (problemas.length) throw new Error(problemas.join(' | '))
})

await navegador.close()
fechar()
console.log(`\n${n} passos ok`)
