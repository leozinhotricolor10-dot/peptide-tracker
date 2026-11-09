// Frasco de cada linha: qual frasco a dose usa, doses restantes e "sem frasco no estoque".
import { describe, expect, it } from 'vitest'
import { dosesRestantes, escolherFrasco, estoqueDoItem, frascosNaOrdem, resumoEstoque } from './estoque.ts'
import type { Aplicacao, Frasco, ItemProtocolo } from './tipos.ts'

const HOJE = '2026-11-09'
const fr = (id: string, mais: Partial<Frasco> = {}): Frasco => ({
  id, substanciaId: 's1', mgTotal: 10, diluenteMl: 2, status: 'reconstituido', reconstituidoEm: '2026-11-01', criadoEm: '2026-11-01T10:00:00Z', ...mais,
})
const ap = (frascoId: string | undefined, mais: Partial<Aplicacao> = {}): Aplicacao => ({
  id: Math.random().toString(36), protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', dataHora: '2026-11-05T11:00:00Z', doseValor: 2.5, doseUnidade: 'mg', frascoId, status: 'feita', ...mais,
})
const item: ItemProtocolo = { id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 2.5, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['08:00'], ordem: 0 }

describe('qual frasco a dose usa (vários frascos da mesma substância)', () => {
  it('o mais antigo não vencido; o já aberto antes do lacrado', () => {
    const novo = fr('novo', { reconstituidoEm: '2026-11-08' })
    const antigo = fr('antigo', { reconstituidoEm: '2026-11-02' })
    const lacradoVelho = fr('lacrado', { status: 'fechado', diluenteMl: undefined, reconstituidoEm: undefined, compradoEm: '2026-10-01' })
    expect(escolherFrasco({ substanciaId: 's1', frascos: [novo, lacradoVelho, antigo], aplicacoes: [], hoje: HOJE })?.id).toBe('antigo')
    expect(frascosNaOrdem('s1', [novo, lacradoVelho, antigo], [], HOJE).map((f) => f.id)).toEqual(['antigo', 'novo', 'lacrado'])
  })

  it('pula o vencido; só usa vencido se não houver outro', () => {
    const vencido = fr('vencido', { reconstituidoEm: '2026-10-01', usarAte: '2026-11-01' })
    const bom = fr('bom', { reconstituidoEm: '2026-11-05' })
    expect(escolherFrasco({ substanciaId: 's1', frascos: [vencido, bom], aplicacoes: [], hoje: HOJE })?.id).toBe('bom')
    expect(escolherFrasco({ substanciaId: 's1', frascos: [vencido], aplicacoes: [], hoje: HOJE })?.id).toBe('vencido')
    // o ligado à linha, se vencido, perde para um bom
    expect(escolherFrasco({ substanciaId: 's1', preferidos: ['vencido'], frascos: [vencido, bom], aplicacoes: [], hoje: HOJE })?.id).toBe('bom')
  })

  it('o frasco ligado à linha vem primeiro, se ainda tem saldo', () => {
    const antigo = fr('antigo', { reconstituidoEm: '2026-11-02' })
    const ligado = fr('ligado', { reconstituidoEm: '2026-11-06' })
    expect(escolherFrasco({ substanciaId: 's1', preferidos: ['ligado'], frascos: [antigo, ligado], aplicacoes: [], hoje: HOJE })?.id).toBe('ligado')
    // ligado sem saldo (4 doses de 2,5 mg = 10 mg): passa para o próximo
    const usadas = [1, 2, 3, 4].map(() => ap('ligado'))
    expect(escolherFrasco({ substanciaId: 's1', preferidos: ['ligado'], frascos: [antigo, ligado], aplicacoes: usadas, hoje: HOJE })?.id).toBe('antigo')
  })

  it('acabou, descartado, outra substância ou sem saldo: não conta', () => {
    const frascos = [fr('a', { status: 'acabou' }), fr('b', { status: 'descartado' }), fr('c', { substanciaId: 's2' })]
    expect(escolherFrasco({ substanciaId: 's1', frascos, aplicacoes: [], hoje: HOJE })).toBeUndefined()
  })
})

describe('doses restantes', () => {
  it('reconstituído: pelo volume (10 mg em 2 mL, dose 2,5 mg = 0,5 mL -> 4 doses; depois de 1 dose, 3)', () => {
    const f = fr('f')
    expect(dosesRestantes(f, [], 2.5, 'mg')).toBe(4)
    expect(dosesRestantes(f, [ap('f')], 2.5, 'mg')).toBe(3)
    expect(dosesRestantes(f, [ap('f')], 10, 'unidades')).toBe(15) // 1,5 mL / 0,1 mL
  })

  it('lacrado: pelos mg; pulada não desconta; UI não converte', () => {
    const f = fr('f', { status: 'fechado', diluenteMl: undefined })
    expect(dosesRestantes(f, [ap('f', { status: 'pulada' })], 2.5, 'mg')).toBe(4)
    expect(dosesRestantes(f, [], 500, 'mcg')).toBe(20)
    expect(dosesRestantes(f, [], 5, 'UI')).toBeNull()
  })
})

describe('protocolo sem frasco no estoque (selo e atalho)', () => {
  it('linha sem nenhum frasco usável: "Sem frasco no estoque"', () => {
    const e = estoqueDoItem(item, [], [], HOJE)
    expect(e.frasco).toBeUndefined()
    expect(resumoEstoque(e)).toBe('Sem frasco no estoque')
  })

  it('frasco acabou no meio do protocolo: volta a ficar sem frasco', () => {
    const usadas = [1, 2, 3, 4].map(() => ap('f'))
    expect(estoqueDoItem({ ...item, frascoId: 'f' }, [fr('f')], usadas, HOJE).frasco).toBeUndefined()
  })

  it('com frasco: resumo curto com as doses restantes e quantos outros frascos há', () => {
    const e = estoqueDoItem({ ...item, frascoId: 'f' }, [fr('f'), fr('g', { reconstituidoEm: '2026-11-07' })], [ap('f')], HOJE)
    expect(e.frasco?.id).toBe('f')
    expect(resumoEstoque(e)).toBe('Frasco: 3 doses restantes · mais 1 frasco')
    expect(resumoEstoque(estoqueDoItem({ ...item, doseUnidade: 'UI' }, [fr('f', { status: 'fechado', diluenteMl: undefined })], [], HOJE))).toBe('Frasco: 10 mg restantes')
  })

  it('protocolo antigo com doses mas sem frasco: nada é inventado, só o selo', () => {
    const doses = [ap(undefined), ap(undefined)]
    const e = estoqueDoItem(item, [], doses, HOJE)
    expect(e.frasco).toBeUndefined()
  })
})
