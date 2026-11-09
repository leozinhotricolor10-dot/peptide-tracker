// Banco: migração da cor (v1 -> v2), cor no salvar e no backup (antigo e novo), frasco que entra no
// Estoque junto com o protocolo e o saldo do frasco ao registrar, desfazer, apagar e pular dose.
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { BancoLocal } from './db.ts'
import { criarRepo, type Repo } from './repo.ts'
import { aplicarBackup, lerBackup, montarBackup } from './backup.ts'
import { saldoFrasco } from '../dominio/calculos.ts'
import { dosesRestantes, estoqueDoItem } from '../dominio/estoque.ts'
import { CORES_PROTOCOLO } from '../dominio/cores.ts'
import type { ItemProtocolo, Protocolo } from '../dominio/tipos.ts'

let n = 0
let db: BancoLocal
let repo: Repo
beforeEach(() => {
  db = new BancoLocal(`cores-${n++}`)
  repo = criarRepo(db)
})

const prot = (id: string, mais: Partial<Protocolo> = {}): Protocolo => ({ id, inicio: '2026-11-02', estado: 'ativo', lembretes: true, criadoEm: `2026-11-0${n % 9 + 1}T10:00:00Z`, ...mais })
const linha = (id: string, protocoloId: string, mais: Partial<ItemProtocolo> = {}): ItemProtocolo => ({
  id, protocoloId, substanciaId: 's1', doseValor: 2.5, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['08:00'], ordem: 0, ...mais,
})

describe('cor do protocolo no banco', () => {
  it('migração: protocolos que já existiam (sem cor) ganham cores diferentes entre si', async () => {
    const nome = `migra-${n++}`
    const v1 = new Dexie(nome)
    v1.version(1).stores({
      substancias: 'id, nome, listaId', protocolos: 'id, estado, inicio', itens: 'id, protocoloId, substanciaId',
      aplicacoes: 'id, protocoloId, itemId, substanciaId, frascoId, dataHora, previsto', medicoes: 'id, data', fotos: 'id, data, angulo',
      frascos: 'id, substanciaId, status', config: 'chave',
    })
    await v1.table('protocolos').bulkAdd([
      { id: 'tesa', inicio: '2026-11-01', estado: 'ativo', lembretes: true, criadoEm: '2026-11-01T10:00:00Z' },
      { id: 'reta', inicio: '2026-11-02', estado: 'ativo', lembretes: true, criadoEm: '2026-11-02T10:00:00Z' },
      { id: 'velho', inicio: '2026-09-01', estado: 'encerrado', lembretes: true, criadoEm: '2026-09-01T10:00:00Z' },
    ])
    v1.close()
    const novo = new BancoLocal(nome)
    const ps = await novo.protocolos.toArray()
    const cores = Object.fromEntries(ps.map((p) => [p.id, p.cor]))
    expect(cores).toEqual({ velho: 'azul', tesa: 'rosa', reta: 'amarelo' })
    // os outros dados não mudam
    expect(ps.find((p) => p.id === 'tesa')?.estado).toBe('ativo')
    novo.close()
  })

  it('salvar sem cor escolhida: ganha a próxima livre; editar mantém; escolhida é respeitada', async () => {
    await repo.salvarProtocolo(prot('a'), [linha('ia', 'a')])
    await repo.salvarProtocolo(prot('b'), [linha('ib', 'b')])
    await repo.salvarProtocolo(prot('c', { cor: 'lima' }), [linha('ic', 'c')])
    const cor = async (id: string) => (await db.protocolos.get(id))?.cor
    expect([await cor('a'), await cor('b'), await cor('c')]).toEqual(['azul', 'rosa', 'lima'])
    await repo.salvarProtocolo({ ...prot('a'), nome: 'editado' }, [linha('ia', 'a')]) // edição sem cor no objeto
    expect(await cor('a')).toBe('azul')
    await repo.salvarProtocolo({ ...prot('a'), cor: 'violeta' }, [linha('ia', 'a')])
    expect(await cor('a')).toBe('violeta')
  })

  it('backup novo leva a cor; backup antigo (sem cor) ou com cor desconhecida importa e recebe cores distintas', async () => {
    await repo.salvarProtocolo(prot('a', { cor: 'magenta' }), [linha('ia', 'a')])
    const arq = JSON.parse(JSON.stringify(await montarBackup(repo, false)))
    expect(arq.tabelas.protocolos[0].cor).toBe('magenta')
    const novo = lerBackup(JSON.stringify(arq))
    expect(novo.arquivo.tabelas.protocolos[0].cor).toBe('magenta')

    const antigo = structuredClone(arq)
    antigo.tabelas.protocolos = [
      { ...arq.tabelas.protocolos[0], id: 'x', cor: undefined, criadoEm: '2026-10-01T00:00:00Z' },
      { ...arq.tabelas.protocolos[0], id: 'y', cor: 'roxo-neon', criadoEm: '2026-10-02T00:00:00Z' },
      { ...arq.tabelas.protocolos[0], id: 'z', cor: 'azul', criadoEm: '2026-10-03T00:00:00Z' },
    ]
    delete antigo.tabelas.protocolos[0].cor
    antigo.tabelas.itens = []
    const previa = lerBackup(JSON.stringify(antigo))
    const cores = previa.arquivo.tabelas.protocolos.map((p) => p.cor)
    expect(cores).toEqual(['rosa', 'amarelo', 'azul'])
    await aplicarBackup(repo, previa)
    expect((await db.protocolos.toArray()).every((p) => CORES_PROTOCOLO.some((c) => c.id === p.cor))).toBe(true)
  })
})

describe('todo frasco informado vai para o Estoque', () => {
  it('com os números da calculadora: frasco criado no Estoque e ligado à linha, na mesma gravação', async () => {
    const r = await repo.salvarProtocolo(prot('p'), [linha('i1', 'p'), linha('i2', 'p', { substanciaId: 's2', ordem: 1 })], {
      i1: { substanciaId: 's1', mgTotal: 10, diluenteMl: 2, status: 'reconstituido', reconstituidoEm: '2026-11-09', compradoEm: '2026-11-09' },
    })
    expect(r.frascos).toHaveLength(1)
    const frascos = await repo.listarFrascos()
    expect(frascos).toHaveLength(1)
    const itens = await db.itens.toArray()
    expect(itens.find((i) => i.id === 'i1')?.frascoId).toBe(frascos[0].id)
    expect(itens.find((i) => i.id === 'i2')?.frascoId).toBeUndefined()
  })

  it('sem dados do frasco: nenhum frasco; a linha fica "sem frasco" e o atalho liga o frasco cadastrado depois', async () => {
    await repo.salvarProtocolo(prot('p'), [linha('i1', 'p')])
    expect(await repo.listarFrascos()).toHaveLength(0)
    const it1 = (await db.itens.get('i1'))!
    expect(estoqueDoItem(it1, [], [], '2026-11-09').frasco).toBeUndefined()
    const f = await repo.salvarFrasco({ substanciaId: 's1', mgTotal: 5, status: 'fechado' })
    await repo.ligarFrasco('i1', f.id)
    const ligado = (await db.itens.get('i1'))!
    expect(ligado.frascoId).toBe(f.id)
    expect(estoqueDoItem(ligado, await repo.listarFrascos(), [], '2026-11-09').frasco?.id).toBe(f.id)
  })

  it('apagar o protocolo mantém o frasco no Estoque (sem vínculo)', async () => {
    await repo.salvarProtocolo(prot('p'), [linha('i1', 'p')], { i1: { substanciaId: 's1', mgTotal: 10, status: 'fechado' } })
    await repo.apagarProtocolo('p')
    expect(await repo.listarFrascos()).toHaveLength(1)
    expect(await db.itens.count()).toBe(0)
  })
})

describe('saldo do frasco acompanha as doses', () => {
  it('registrar desconta; desfazer e apagar devolvem; pular não desconta', async () => {
    const { frascos } = await repo.salvarProtocolo(prot('p'), [linha('i1', 'p')], {
      i1: { substanciaId: 's1', mgTotal: 10, diluenteMl: 2, status: 'reconstituido', reconstituidoEm: '2026-11-01' },
    })
    const f = frascos[0]
    const saldo = async () => {
      const aps = await repo.listarAplicacoes()
      const fr = (await repo.listarFrascos())[0]
      return { mg: saldoFrasco(fr, aps).mgRestante, doses: dosesRestantes(fr, aps, 2.5, 'mg') }
    }
    const reg = (dia: string, mais = {}) =>
      repo.registrarAplicacao({ protocoloId: 'p', itemId: 'i1', substanciaId: 's1', previsto: `${dia} 08:00`, dataHora: `${dia}T11:00:00.000Z`, doseValor: 2.5, doseUnidade: 'mg', frascoId: f.id, status: 'feita', ...mais })
    expect(await saldo()).toEqual({ mg: 10, doses: 4 })

    const a1 = await reg('2026-11-02')
    expect(await saldo()).toEqual({ mg: 7.5, doses: 3 })

    await repo.apagarAplicacao(a1.id) // "Desfazer" do aviso
    expect(await saldo()).toEqual({ mg: 10, doses: 4 })

    const a2 = await reg('2026-11-03')
    await reg('2026-11-04')
    expect(await saldo()).toEqual({ mg: 5, doses: 2 })
    const apagada = await repo.apagarAplicacao(a2.id) // "Apagar registro"
    expect(await saldo()).toEqual({ mg: 7.5, doses: 3 })
    await repo.restaurarAplicacao(apagada!) // desfazer o apagar
    expect(await saldo()).toEqual({ mg: 5, doses: 2 })

    // pular: registro "não feita" do horário, sem frasco
    await repo.registrarAplicacao({ protocoloId: 'p', itemId: 'i1', substanciaId: 's1', previsto: '2026-11-05 08:00', dataHora: '2026-11-05T11:00:00.000Z', doseValor: 2.5, doseUnidade: 'mg', status: 'pulada' })
    expect(await saldo()).toEqual({ mg: 5, doses: 2 })
    // mesmo se um "não fiz" viesse com frasco, não desconta
    await reg('2026-11-06', { status: 'pulada' })
    expect(await saldo()).toEqual({ mg: 5, doses: 2 })

    // registrar de novo o mesmo horário substitui (não desconta duas vezes)
    await reg('2026-11-04')
    expect(await saldo()).toEqual({ mg: 5, doses: 2 })
  })
})
