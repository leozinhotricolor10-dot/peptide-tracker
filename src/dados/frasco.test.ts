// A31: apagar frasco (com e sem doses ligadas, id inexistente, falha e demora do banco, desfazer).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BancoLocal } from './db.ts'
import { BancoDemorou, comTeto, criarRepo, mensagemDeErro, type Repo } from './repo.ts'
import type { ItemProtocolo, Protocolo } from '../dominio/tipos.ts'

let db: BancoLocal
let repo: Repo
let n = 0
beforeEach(() => {
  db = new BancoLocal(`frasco-${n++}`)
  repo = criarRepo(db)
})
afterEach(() => vi.restoreAllMocks())

const prot: Protocolo = { id: 'p1', inicio: '2026-11-02', estado: 'ativo', lembretes: true, criadoEm: '' }
const item = (frascoId?: string): ItemProtocolo => ({ id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 2, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['08:00'], frascoId, ordem: 0 })
const novoFrasco = () => repo.salvarFrasco({ substanciaId: 's1', mgTotal: 60, diluenteMl: 3, status: 'reconstituido', reconstituidoEm: '2026-11-01' })
const dose = (dia: string, frascoId?: string) =>
  repo.registrarAplicacao({ protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', previsto: `${dia} 08:00`, dataHora: `${dia}T11:00:00.000Z`, doseValor: 2, doseUnidade: 'mg', frascoId, status: 'feita' })

describe('apagar frasco', () => {
  it('sem doses ligadas: some do estoque', async () => {
    const f = await novoFrasco()
    const r = await repo.apagarFrasco(f.id)
    expect(r?.frasco.id).toBe(f.id)
    expect(r?.aplicacoes).toEqual([])
    expect(await repo.listarFrascos()).toHaveLength(0)
  })

  it('com doses ligadas a um protocolo: as doses continuam no histórico, sem apontar para o frasco', async () => {
    const f = await novoFrasco()
    const outro = await novoFrasco()
    await repo.salvarProtocolo(prot, [item(f.id)])
    const a1 = await dose('2026-11-02', f.id)
    const a2 = await dose('2026-11-03', f.id)
    const a3 = await dose('2026-11-04', outro.id)
    const r = await repo.apagarFrasco(f.id)
    expect(r?.aplicacoes.sort()).toEqual([a1.id, a2.id].sort())
    expect(r?.itens).toEqual(['i1'])
    expect((await repo.listarFrascos()).map((x) => x.id)).toEqual([outro.id])
    const aps = await repo.listarAplicacoes()
    expect(aps).toHaveLength(3)
    expect(aps.filter((a) => a.frascoId === f.id)).toHaveLength(0)
    expect(aps.find((a) => a.id === a1.id)).not.toHaveProperty('frascoId')
    expect(aps.find((a) => a.id === a3.id)?.frascoId).toBe(outro.id)
    expect((await repo.obterProtocolo('p1'))!.itens[0]).not.toHaveProperty('frascoId')
    expect(await db.aplicacoes.where('frascoId').equals(f.id).count()).toBe(0)
  })

  it('desfazer volta o frasco e religa as doses e a linha do protocolo', async () => {
    const f = await novoFrasco()
    await repo.salvarProtocolo(prot, [item(f.id)])
    const a1 = await dose('2026-11-02', f.id)
    const r = await repo.apagarFrasco(f.id)
    await repo.restaurarFrasco(r!)
    expect((await repo.listarFrascos()).map((x) => x.id)).toEqual([f.id])
    expect((await repo.listarAplicacoes()).find((a) => a.id === a1.id)?.frascoId).toBe(f.id)
    expect((await repo.obterProtocolo('p1'))!.itens[0].frascoId).toBe(f.id)
  })

  it('id inexistente: não falha e não mexe em nada', async () => {
    const f = await novoFrasco()
    await expect(repo.apagarFrasco('nao-existe')).resolves.toBeUndefined()
    expect((await repo.listarFrascos()).map((x) => x.id)).toEqual([f.id])
  })

  it('falha do banco: rejeita (a tela mostra o erro) e nada muda, nem as doses', async () => {
    const f = await novoFrasco()
    const a1 = await dose('2026-11-02', f.id)
    vi.spyOn(db.frascos, 'delete').mockRejectedValueOnce(new Error('falha simulada'))
    await expect(repo.apagarFrasco(f.id)).rejects.toThrow()
    expect((await repo.listarFrascos()).map((x) => x.id)).toEqual([f.id])
    expect((await repo.listarAplicacoes()).find((a) => a.id === a1.id)?.frascoId).toBe(f.id)
  })
})

describe('gravação nunca fica muda', () => {
  it('banco que não responde vira erro com mensagem em pt-BR depois do teto', async () => {
    vi.useFakeTimers()
    try {
      const p = comTeto(new Promise(() => {}), 10_000)
      const espera = expect(p).rejects.toBeInstanceOf(BancoDemorou)
      await vi.advanceTimersByTimeAsync(10_000)
      await espera
    } finally {
      vi.useRealTimers()
    }
    expect(mensagemDeErro(new BancoDemorou())).toMatch(/outra janela ou aba/)
  })

  it('mensagens claras para cada tipo de falha', () => {
    expect(mensagemDeErro({ name: 'QuotaExceededError' })).toMatch(/espaço/)
    expect(mensagemDeErro(new Error('x'))).toMatch(/Não deu para gravar/)
  })
})
