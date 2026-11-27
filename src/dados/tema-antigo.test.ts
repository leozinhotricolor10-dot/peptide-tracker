// O app tem um tema só (claro). A escolha de tema das versões antigas (Preto, Índigo, Claro,
// Automático) sai do banco ao atualizar, não vai mais no backup, e backups antigos com ou sem o
// campo "tema" (qualquer valor) importam sem erro, com o campo ignorado.
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { BancoLocal } from './db.ts'
import { criarRepo, type Repo } from './repo.ts'
import { aplicarBackup, lerBackup, montarBackup } from './backup.ts'

let repo: Repo
let n = 0
beforeEach(() => {
  repo = criarRepo(new BancoLocal(`tema-${n++}`))
})

const temTema = (cfg: { chave: string }[]) => cfg.some((c) => c.chave === 'tema')

describe('escolha de tema das versões antigas', () => {
  it.each(['preto', 'indigo', 'claro', 'auto'])('banco antigo (versão 2) com tema "%s": ao abrir, o campo sai e o resto fica', async (valor) => {
    const nome = `antigo-${n++}`
    const velho = new Dexie(nome)
    velho.version(2).stores({
      substancias: 'id, nome, listaId', protocolos: 'id, estado, inicio', itens: 'id, protocoloId, substanciaId',
      aplicacoes: 'id, protocoloId, itemId, substanciaId, frascoId, dataHora, previsto', medicoes: 'id, data',
      fotos: 'id, data, angulo', frascos: 'id, substanciaId, status', config: 'chave',
    })
    await velho.table('config').bulkPut([{ chave: 'tema', valor }, { chave: 'onboarding', valor: true }])
    velho.close()
    const novo = new BancoLocal(nome)
    expect(await novo.config.get('tema')).toBeUndefined()
    expect((await novo.config.get('onboarding'))?.valor).toBe(true)
    novo.close()
  })

  it('backup novo não leva o campo "tema" (nem se ele tiver sobrado no banco)', async () => {
    await repo.setConfig('onboarding', true)
    await repo.db.config.put({ chave: 'tema', valor: 'preto' })
    const arq = JSON.parse(JSON.stringify(await montarBackup(repo, false)))
    expect(temTema(arq.tabelas.config)).toBe(false)
  })

  it('backup antigo com "tema" (qualquer valor) e sem ele: importa sem erro e o campo é ignorado', async () => {
    const arq = JSON.parse(JSON.stringify(await montarBackup(repo, false)))
    const casos: unknown[] = ['preto', 'indigo', 'claro', 'auto', 'turquesa', '', 7, null, { tema: 'claro' }, ['claro']]
    for (const valor of [...casos, 'sem campo']) {
      arq.tabelas.config = valor === 'sem campo' ? [{ chave: 'onboarding', valor: true }] : [{ chave: 'tema', valor }, { chave: 'onboarding', valor: true }]
      const previa = lerBackup(JSON.stringify(arq))
      expect(temTema(previa.arquivo.tabelas.config), String(valor)).toBe(false)
      const outro = criarRepo(new BancoLocal(`tema-${n++}`))
      await aplicarBackup(outro, previa)
      expect(await outro.db.config.get('tema')).toBeUndefined()
      expect(await outro.getConfig('onboarding')).toBe(true)
    }
  })
})
