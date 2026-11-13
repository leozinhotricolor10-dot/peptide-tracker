// Dose em unidades da seringa ao lado da massa ("2 mg · 10 un"): uma função para todas as telas.
import { describe, expect, it } from 'vitest'
import type { Aplicacao, Frasco, ItemProtocolo } from './tipos.ts'
import { calcularSeringa } from './calculos.ts'
import { doseComUnidades, doseDoRegistro, fmtUnidades, mudancaDeUnidades, textoDoseUn, unidadesDaDose } from './unidades.ts'

const HOJE = '2026-11-12'
const frasco = (o: Partial<Frasco> = {}): Frasco => ({
  id: 'f1', substanciaId: 's1', mgTotal: 10, status: 'reconstituido', diluenteMl: 0.5, reconstituidoEm: '2026-11-01', criadoEm: '2026-11-01T10:00:00.000Z', ...o,
})
const item = (o: Partial<ItemProtocolo> = {}): ItemProtocolo => ({
  id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 2, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['09:00'], ordem: 0, ...o,
})
const ap = (o: Partial<Aplicacao> = {}): Aplicacao => ({
  id: 'a1', protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', dataHora: '2026-11-10T12:00:00.000Z', doseValor: 2, doseUnidade: 'mg', frascoId: 'f1', status: 'feita', ...o,
})
const sem = (s: string) => s.replace(/ /g, ' ')

describe('unidades da dose (frasco da vez)', () => {
  it('2 mg com frasco de 10 mg em 0,5 mL = 10 un (0,1 mL), igual à calculadora', () => {
    const d = doseComUnidades(item(), [frasco()], [], HOJE, false)
    expect(d.unidades).toBe(10)
    expect(d.ml).toBeCloseTo(0.1, 12)
    expect(d.marca).toBeNull()
    expect(d.frasco?.id).toBe('f1')
    expect(sem(textoDoseUn(d))).toBe('2 mg · 10 un')
    expect(calcularSeringa({ mgFrasco: '10', diluenteMl: '0,5', dose: '2', unidade: 'mg', blend: false }).unidadesExatas).toBe(d.unidades)
  })

  it('sem frasco no Estoque: só a massa', () => {
    const d = doseComUnidades(item(), [], [], HOJE, false)
    expect(d.unidades).toBeNull()
    expect(d.falta).toBe('sem-frasco')
    expect(sem(textoDoseUn(d))).toBe('2 mg')
  })

  it('frasco lacrado (sem água informada): só a massa', () => {
    const d = doseComUnidades(item(), [frasco({ status: 'fechado', diluenteMl: undefined, reconstituidoEm: undefined })], [], HOJE, false)
    expect(d.unidades).toBeNull()
    expect(d.falta).toBe('lacrado')
    expect(d.frasco?.id).toBe('f1')
  })

  it('fração: exato com até 1 casa no texto e a marca mais próxima com a dose que ela dá', () => {
    // 10 mg em 3 mL; 250 mcg = 7,5 un -> marca 8 = 266,67 mcg (mesma conta da calculadora)
    const d = unidadesDaDose(250, 'mcg', frasco({ diluenteMl: 3 }), false)
    expect(d.unidades).toBeCloseTo(7.5, 10)
    expect(d.marca).toBe(8)
    expect(d.doseDaMarca).toBeCloseTo(266.6667, 3)
    expect(sem(textoDoseUn(d))).toBe('250 mcg · 7,5 un')
    expect(sem(fmtUnidades(12.345))).toBe('12,3 un')
  })

  it('menos de meia unidade: sem marca, com aviso', () => {
    // 10 mg em 0,5 mL = 20 mg/mL; 50 mcg = 0,0025 mL = 0,25 un
    const d = unidadesDaDose(50, 'mcg', frasco(), false)
    expect(d.unidades).toBeCloseTo(0.25, 10)
    expect(d.abaixoDaMenorMarca).toBe(true)
    expect(d.marca).toBeNull()
    expect(d.acimaDaSeringa).toBe(false)
  })

  it('mais de 100 unidades: não cabe numa seringa de 1 mL (aviso, sem bloquear)', () => {
    // 5 mg em 5 mL = 1 mg/mL; 1,5 mg = 1,5 mL = 150 un
    const d = unidadesDaDose(1.5, 'mg', frasco({ mgTotal: 5, diluenteMl: 5 }), false)
    expect(d.unidades).toBe(150)
    expect(d.acimaDaSeringa).toBe(true)
    expect(unidadesDaDose(1, 'mg', frasco({ mgTotal: 5, diluenteMl: 5 }), false).acimaDaSeringa).toBe(false) // 100 cabe
  })

  it('blend: dose em mL mostra mL e unidades (mL × 100), sem precisar de frasco; em mg não converte', () => {
    const ml = unidadesDaDose(0.2, 'mL', undefined, true)
    expect(ml.unidades).toBe(20)
    expect(sem(textoDoseUn(ml))).toBe('0,2 mL · 20 un')
    const mg = unidadesDaDose(2, 'mg', frasco(), true)
    expect(mg.unidades).toBeNull()
    expect(mg.falta).toBe('blend-mg')
  })

  it('dose já em unidades ou em UI: não duplica', () => {
    const un = unidadesDaDose(10, 'unidades', frasco(), false)
    expect(un.unidades).toBeNull()
    expect(un.falta).toBe('ja-unidades')
    expect(sem(textoDoseUn(un))).toBe('10 unidades')
    const ui = unidadesDaDose(2, 'UI', frasco(), false)
    expect(ui.unidades).toBeNull()
    expect(ui.falta).toBe('ui')
    expect(sem(textoDoseUn(ui))).toBe('2 UI')
  })

  it('vários frascos com diluições diferentes: usa o da vez (ligado à linha; se acabou ou venceu, o mais antigo não vencido)', () => {
    const f1 = frasco({ id: 'f1', diluenteMl: 0.5 }) // 10 un
    const f2 = frasco({ id: 'f2', diluenteMl: 1, reconstituidoEm: '2026-11-05', criadoEm: '2026-11-05T10:00:00.000Z' }) // 20 un
    expect(doseComUnidades(item({ frascoId: 'f2' }), [f1, f2], [], HOJE, false).unidades).toBe(20)
    expect(doseComUnidades(item({ frascoId: 'f1' }), [f1, f2], [], HOJE, false).unidades).toBe(10)
    // f1 acabou: a próxima dose usa f2
    expect(doseComUnidades(item({ frascoId: 'f1' }), [{ ...f1, status: 'acabou' }, f2], [], HOJE, false).unidades).toBe(20)
    // f1 venceu: a próxima dose usa f2
    expect(doseComUnidades(item({ frascoId: 'f1' }), [{ ...f1, usarAte: '2026-11-11' }, f2], [], HOJE, false).unidades).toBe(20)
  })

  it('várias substâncias no protocolo: cada linha com a sua', () => {
    const fa = frasco({ id: 'fa', substanciaId: 'sa' }) // 20 mg/mL
    const fb = frasco({ id: 'fb', substanciaId: 'sb', mgTotal: 5, diluenteMl: 2 }) // 2,5 mg/mL
    const a = doseComUnidades(item({ id: 'ia', substanciaId: 'sa' }), [fa, fb], [], HOJE, false)
    const b = doseComUnidades(item({ id: 'ib', substanciaId: 'sb', doseValor: 250, doseUnidade: 'mcg' }), [fa, fb], [], HOJE, false)
    expect(a.unidades).toBe(10)
    expect(b.unidades).toBe(10)
    expect(a.frasco?.id).toBe('fa')
    expect(b.frasco?.id).toBe('fb')
  })
})

describe('unidades no histórico', () => {
  it('registro com unidades gravadas: fica congelado mesmo que o frasco mude de diluição depois', () => {
    const rediluido = frasco({ diluenteMl: 1 }) // hoje daria 20 un
    const d = doseDoRegistro(ap({ unidadesSeringa: 10 }), [rediluido], false)
    expect(d.unidades).toBe(10)
    expect(sem(textoDoseUn(d))).toBe('2 mg · 10 un')
  })

  it('registro antigo, sem unidades gravadas: calcula pelo frasco apontado; frasco apagado: só mg', () => {
    expect(doseDoRegistro(ap(), [frasco()], false).unidades).toBe(10)
    const semFrasco = doseDoRegistro(ap(), [], false)
    expect(semFrasco.unidades).toBeNull()
    expect(sem(textoDoseUn(semFrasco))).toBe('2 mg')
    expect(doseDoRegistro(ap({ frascoId: undefined }), [frasco()], false).unidades).toBeNull()
  })
})

describe('troca de frasco na folha de dose', () => {
  it('mesma dose, frasco novo com outra diluição: destaca antes e agora', () => {
    const atual = unidadesDaDose(2, 'mg', frasco({ id: 'f2', diluenteMl: 1 }), false)
    expect(mudancaDeUnidades('i1', [ap({ unidadesSeringa: 10 })], atual, 'f2')).toEqual({ antes: 10, agora: 20, frascoNovo: true })
  })

  it('mesmo frasco rediluído: avisa sem dizer "frasco novo"', () => {
    const atual = unidadesDaDose(2, 'mg', frasco({ diluenteMl: 1 }), false)
    expect(mudancaDeUnidades('i1', [ap({ unidadesSeringa: 10 })], atual, 'f1')?.frascoNovo).toBe(false)
  })

  it('sem mudança, sem registro anterior com unidades ou dose diferente: nada a destacar', () => {
    const atual = unidadesDaDose(2, 'mg', frasco(), false)
    expect(mudancaDeUnidades('i1', [ap({ unidadesSeringa: 10 })], atual, 'f1')).toBeNull()
    expect(mudancaDeUnidades('i1', [ap()], unidadesDaDose(2, 'mg', frasco({ diluenteMl: 1 }), false), 'f1')).toBeNull()
    expect(mudancaDeUnidades('i1', [ap({ unidadesSeringa: 10 })], unidadesDaDose(3, 'mg', frasco(), false), 'f1')).toBeNull()
    // o próprio registro em edição não conta como "o anterior"
    expect(mudancaDeUnidades('i1', [ap({ unidadesSeringa: 10 })], unidadesDaDose(2, 'mg', frasco({ diluenteMl: 1 }), false), 'f1', 'a1')).toBeNull()
  })
})
