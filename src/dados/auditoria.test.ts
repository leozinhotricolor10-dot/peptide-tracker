// Testes dos bugs de dados achados na auditoria (ver AUDITORIA.md).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BancoLocal } from './db.ts'
import { criarRepo, ehCotaCheia, type Repo } from './repo.ts'
import { aplicarBackup, lerBackup, montarBackup } from './backup.ts'
import { slotsDoDia } from '../dominio/agenda.ts'
import type { Protocolo } from '../dominio/tipos.ts'

let repo: Repo
let n = 0
beforeEach(() => {
  repo = criarRepo(new BancoLocal(`auditoria-${n++}`))
})

const prot = (p: Partial<Protocolo> = {}): Protocolo => ({ id: 'p1', inicio: '2026-11-01', estado: 'ativo', lembretes: true, criadoEm: '', ...p })
const linha = { id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 1, doseUnidade: 'mg' as const, frequencia: { tipo: 'diaria' as const }, horarios: ['08:00'], ordem: 0 }

describe('A01 retomar guarda a pausa no histórico', () => {
  it('retomar à mão', async () => {
    await repo.salvarProtocolo(prot(), [linha])
    await repo.db.protocolos.update('p1', { estado: 'pausado', pausadoDesde: '2026-11-05' })
    await repo.retomarProtocolo('p1', '2026-11-09')
    const p = (await repo.obterProtocolo('p1'))!.protocolo
    expect(p.estado).toBe('ativo')
    expect(p.pausas).toEqual([{ de: '2026-11-05', ate: '2026-11-09' }])
    expect(slotsDoDia([p], [linha], '2026-11-06')).toHaveLength(0)
    expect(slotsDoDia([p], [linha], '2026-11-09')).toHaveLength(1)
  })
  it('pausa com data que venceu (normalizar ao abrir o app dias depois)', async () => {
    await repo.salvarProtocolo(prot(), [linha])
    await repo.db.protocolos.update('p1', { estado: 'pausado', pausadoDesde: '2026-11-05', pausadoAte: '2026-11-08' })
    await repo.normalizarPausas('2026-11-20')
    const p = (await repo.obterProtocolo('p1'))!.protocolo
    expect(p.pausas).toEqual([{ de: '2026-11-05', ate: '2026-11-08' }])
    expect(slotsDoDia([p], [linha], '2026-11-08')).toHaveLength(1)
  })
  it('encerrar durante a pausa também guarda a pausa', async () => {
    await repo.salvarProtocolo(prot(), [linha])
    await repo.db.protocolos.update('p1', { estado: 'pausado', pausadoDesde: '2026-11-05' })
    await repo.encerrarProtocolo('p1', '2026-11-12')
    const p = (await repo.obterProtocolo('p1'))!.protocolo
    expect(p).toMatchObject({ estado: 'encerrado', encerradoEm: '2026-11-12', pausas: [{ de: '2026-11-05', ate: '2026-11-12' }] })
  })
})

describe('A07 apagar protocolo em cascata', () => {
  it('apaga linhas e registros dele; frascos, substâncias e outros protocolos ficam', async () => {
    await repo.salvarProtocolo(prot(), [linha])
    await repo.salvarProtocolo(prot({ id: 'p2' }), [{ ...linha, id: 'i2', protocoloId: 'p2' }])
    await repo.registrarAplicacao({ protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', previsto: '2026-11-02 08:00', dataHora: '2026-11-02T08:00:00Z', doseValor: 1, doseUnidade: 'mg', status: 'feita' })
    await repo.registrarAplicacao({ protocoloId: 'p2', itemId: 'i2', substanciaId: 's1', previsto: '2026-11-02 08:00', dataHora: '2026-11-02T08:00:00Z', doseValor: 1, doseUnidade: 'mg', status: 'feita' })
    const f = await repo.salvarFrasco({ substanciaId: 's1', mgTotal: 5, status: 'fechado' })
    expect(await repo.apagarProtocolo('p1')).toEqual({ registros: 1 })
    expect(await repo.obterProtocolo('p1')).toBeUndefined()
    expect((await repo.listarItens()).map((i) => i.id)).toEqual(['i2'])
    expect((await repo.listarAplicacoes()).map((a) => a.protocoloId)).toEqual(['p2'])
    expect((await repo.listarFrascos())[0].id).toBe(f.id)
  })
})

describe('A08 backup corrompido ou malicioso é recusado sem mexer em nada', () => {
  async function arquivoValido() {
    await repo.salvarProtocolo(prot(), [linha])
    return JSON.parse(JSON.stringify(await montarBackup(repo, true))) as Record<string, any>
  }

  it('cada defeito recusa o arquivo inteiro', async () => {
    const ok = await arquivoValido()
    const estragar: ((a: Record<string, any>) => void)[] = [
      (a) => (a.tabelas.itens[0].horarios = 'oito horas'), // virava tela branca
      (a) => (a.tabelas.itens[0].horarios = ['25:00']),
      (a) => (a.tabelas.itens[0].doseValor = '250'),
      (a) => (a.tabelas.itens[0].frequencia = { tipo: 'semana', dias: [] }),
      (a) => (a.tabelas.protocolos[0].inicio = '2026-02-31'),
      (a) => (a.tabelas.protocolos[0].estado = 'hackeado'),
      (a) => (a.tabelas.protocolos[0].fim = '2020-01-01'),
      (a) => a.tabelas.protocolos.push({ ...a.tabelas.protocolos[0] }), // id repetido
      (a) => (a.tabelas.aplicacoes = [{ id: 'x', protocoloId: 'p1', itemId: 'i1', substanciaId: 's', dataHora: 'ontem', doseValor: 1, doseUnidade: 'mg', status: 'feita' }]),
      (a) => (a.fotos = [{ id: 'f', data: '2026-11-01', angulo: 'frente', tipo: 'image/jpeg', dados: '<script>' }]),
      (a) => (a.tabelas.medicoes = [{ id: 'm', data: '2026-11-01', pesoKg: -80, medidas: {} }]),
      (a) => (a.tabelas = null),
      (a) => (a.formato = 0),
    ]
    for (const f of estragar) {
      const a = structuredClone(ok)
      f(a)
      expect(() => lerBackup(JSON.stringify(a))).toThrow()
    }
    expect((await repo.contagens()).protocolos).toBe(1)
  })

  it('campos desconhecidos e configs perigosas são descartados; tipo de foto suspeito vira jpeg', async () => {
    const a = await arquivoValido()
    a.tabelas.protocolos[0].__proto__ = { estado: 'x' }
    a.tabelas.protocolos[0].extra = '<img onerror=alert(1)>'
    a.tabelas.config.push({ chave: 'aceite', valor: { versao: '1', em: 'falso' } }, { chave: 'qualquer', valor: 1 }, { chave: 'onboarding', valor: 'sim' })
    a.fotos = [{ id: 'f1', data: '2026-11-01', angulo: 'lado', tipo: 'text/html', dados: btoa('abc') }]
    const previa = lerBackup(JSON.stringify(a))
    expect(Object.keys(previa.arquivo.tabelas.protocolos[0])).not.toContain('extra')
    expect(previa.arquivo.tabelas.config.map((c) => c.chave)).not.toContain('aceite')
    expect(previa.arquivo.tabelas.config.map((c) => c.chave)).not.toContain('qualquer')
    expect(previa.arquivo.fotos[0].tipo).toBe('image/jpeg')
    await repo.apagarTudo()
    await aplicarBackup(repo, previa)
    expect(await repo.getConfig('aceite')).toBeUndefined()
    expect((await repo.listarFotos())[0].blob.type).toBe('image/jpeg')
  })

  it('backup antigo sem campos novos (pausas) continua entrando', async () => {
    const a = await arquivoValido()
    delete a.tabelas.protocolos[0].pausas
    delete a.fotos
    expect(lerBackup(JSON.stringify(a)).contagens.protocolos).toBe(1)
  })
})

describe('A12 depois de restaurar, o app sabe que existe um backup', () => {
  it('data do último backup = data do arquivo', async () => {
    await repo.salvarProtocolo(prot(), [linha])
    const arq = await montarBackup(repo, false, new Date('2026-11-07T10:00:00Z'))
    await repo.apagarTudo()
    await aplicarBackup(repo, lerBackup(JSON.stringify(arq)))
    expect(await repo.getConfig('ultimoBackup')).toBe('2026-11-07T10:00:00.000Z')
  })
})

describe('A09 espaço cheio é reconhecido', () => {
  it('erro de cota direto ou embrulhado pelo Dexie', () => {
    expect(ehCotaCheia({ name: 'QuotaExceededError' })).toBe(true)
    expect(ehCotaCheia({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true)
    expect(ehCotaCheia(new Error('outro'))).toBe(false)
  })
})
