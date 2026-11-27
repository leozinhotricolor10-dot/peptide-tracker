// Preferência de tema: gravada no banco, vai no backup, backup antigo sem ela = Preto, valor estranho recusado.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BancoLocal } from './db.ts'
import { criarRepo, type Repo } from './repo.ts'
import { aplicarBackup, lerBackup, montarBackup } from './backup.ts'
import { temaEfetivo } from '../dominio/temas.ts'

let repo: Repo
let n = 0
beforeEach(() => {
  repo = criarRepo(new BancoLocal(`tema-${n++}`))
})

describe('preferência de tema', () => {
  it('sem escolha, não há nada gravado (o app mostra Preto); a escolha é gravada e lida', async () => {
    expect(await repo.getConfig('tema')).toBeUndefined()
    expect(temaEfetivo(await repo.getConfig('tema'), true)).toBe('preto')
    for (const t of ['indigo', 'claro', 'auto', 'preto'] as const) {
      await repo.setConfig('tema', t)
      expect(await repo.getConfig('tema')).toBe(t)
    }
  })

  it('o backup leva o tema e importar restaura', async () => {
    await repo.setConfig('tema', 'indigo')
    const texto = JSON.stringify(await montarBackup(repo, false))
    expect(JSON.parse(texto).tabelas.config).toContainEqual({ chave: 'tema', valor: 'indigo' })
    const outro = criarRepo(new BancoLocal(`tema-${n++}`))
    await outro.setConfig('tema', 'claro')
    await aplicarBackup(outro, lerBackup(texto))
    expect(await outro.getConfig('tema')).toBe('indigo')
  })

  it('backup antigo sem o tema: importa e fica Preto (a escolha anterior do aparelho não fica)', async () => {
    const texto = JSON.stringify(await montarBackup(repo, false))
    expect(JSON.parse(texto).tabelas.config.some((c: { chave: string }) => c.chave === 'tema')).toBe(false)
    const outro = criarRepo(new BancoLocal(`tema-${n++}`))
    await outro.setConfig('tema', 'claro')
    await aplicarBackup(outro, lerBackup(texto))
    expect(await outro.getConfig('tema')).toBeUndefined()
    expect(temaEfetivo(await outro.getConfig('tema'), false)).toBe('preto')
  })

  it('tema inválido no arquivo é recusado pela validação (como as outras configurações)', async () => {
    const arq = JSON.parse(JSON.stringify(await montarBackup(repo, false)))
    for (const ruim of ['turquesa', '', 7, null, { tema: 'claro' }, ['claro']]) {
      arq.tabelas.config = [{ chave: 'tema', valor: ruim }]
      const previa = lerBackup(JSON.stringify(arq))
      expect(previa.arquivo.tabelas.config.find((c) => c.chave === 'tema')).toBeUndefined()
    }
    arq.tabelas.config = [{ chave: 'tema', valor: 'auto' }]
    expect(lerBackup(JSON.stringify(arq)).arquivo.tabelas.config).toContainEqual({ chave: 'tema', valor: 'auto' })
  })
})
