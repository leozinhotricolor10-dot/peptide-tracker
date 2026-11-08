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
  igual(await h1(), 'Tudo bem', 'tela de saída')
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
await passo('nenhum erro ou aviso no console e nenhum HTTP com erro', async () => {
  if (problemas.length) throw new Error(problemas.join(' | '))
})

await navegador.close()
fechar()
console.log(`\n${n} passos ok`)
