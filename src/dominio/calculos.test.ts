import { describe, expect, it } from 'vitest'
import type { Aplicacao, Frasco } from './tipos.ts'
import {
  concentracaoMgMl,
  custoPorDose,
  dataLimite,
  fmtNum,
  lerNumero,
  mgDaDose,
  rendimento,
  saldoFrasco,
  somaComponentesMg,
  unidadesNaSeringa,
  volumeDaDoseMl,
} from './calculos.ts'

const frasco = (f: Partial<Frasco> = {}): Frasco => ({
  id: 'f1', substanciaId: 's1', mgTotal: 5, status: 'reconstituido', diluenteMl: 2, criadoEm: '', ...f,
})
const ap = (a: Partial<Aplicacao> = {}): Aplicacao => ({
  id: Math.random().toString(), protocoloId: 'p', itemId: 'i', substanciaId: 's1', dataHora: '', doseValor: 250, doseUnidade: 'mcg', frascoId: 'f1', status: 'feita', ...a,
})

describe('reconstituição (simples)', () => {
  it('5 mg em 2 mL = 2,5 mg/mL; 250 mcg = 0,1 mL = 10 unidades; rende 20 doses', () => {
    const c = concentracaoMgMl(5, 2)!
    expect(c).toBe(2.5)
    const ml = volumeDaDoseMl(250, 'mcg', c)!
    expect(ml).toBeCloseTo(0.1, 12)
    expect(unidadesNaSeringa(ml)).toBeCloseTo(10, 10)
    expect(rendimento(2, ml)).toBe(20)
  })

  it('não arredonda: 10 mg em 3 mL, dose 1 mg = 30 unidades exatas na conta', () => {
    const c = concentracaoMgMl(10, 3)!
    const u = unidadesNaSeringa(volumeDaDoseMl(1, 'mg', c)!)
    expect(u).toBeCloseTo(30, 10)
    expect(fmtNum(10 / 3)).toBe('3,3333')
  })

  it('dose em unidades e mL converte sem concentração; UI não converte', () => {
    expect(volumeDaDoseMl(10, 'unidades', null)).toBeCloseTo(0.1)
    expect(volumeDaDoseMl(0.25, 'mL', null)).toBe(0.25)
    expect(volumeDaDoseMl(2, 'UI', 2.5)).toBeNull()
    expect(volumeDaDoseMl(250, 'mcg', null)).toBeNull()
  })

  it('valores inválidos não calculam', () => {
    expect(concentracaoMgMl(0, 2)).toBeNull()
    expect(concentracaoMgMl(5, 0)).toBeNull()
    expect(rendimento(2, 0)).toBeNull()
  })
})

describe('blend', () => {
  it('soma os componentes informados (mcg vira mg) e ignora os vazios', () => {
    expect(somaComponentesMg([{ nome: 'A', quantidade: 50, unidade: 'mg' }, { nome: 'B', quantidade: 10, unidade: 'mg' }, { nome: 'C', quantidade: 10 }])).toBe(70)
    expect(somaComponentesMg([{ nome: 'A', quantidade: 500, unidade: 'mcg' }, { nome: 'B' }])).toBe(0.5)
    expect(somaComponentesMg([{ nome: 'A' }])).toBeNull()
  })

  it('10 unidades = 0,1 mL; 2 mL rende 20 doses (só volume)', () => {
    const ml = volumeDaDoseMl(10, 'unidades', null)!
    expect(rendimento(2, ml)).toBe(20)
  })
})

describe('saldo do frasco', () => {
  it('desconta só doses feitas daquele frasco', () => {
    const regs = [ap(), ap(), ap({ status: 'pulada' }), ap({ frascoId: 'outro' })]
    const s = saldoFrasco(frasco(), regs)
    expect(s.mgUsado).toBeCloseTo(0.5)
    expect(s.mgRestante).toBeCloseTo(4.5)
    expect(s.mlRestante).toBeCloseTo(1.8)
    expect(s.dosesFeitas).toBe(2)
  })

  it('dose em unidades desconta via concentração', () => {
    const s = saldoFrasco(frasco(), [ap({ doseValor: 10, doseUnidade: 'unidades' })])
    expect(s.mlUsado).toBeCloseTo(0.1)
    expect(s.mgUsado).toBeCloseTo(0.25)
  })

  it('frasco fechado conta mg mas não mL; UI fica fora da conta', () => {
    const s = saldoFrasco(frasco({ status: 'fechado', diluenteMl: undefined }), [ap(), ap({ doseUnidade: 'UI', doseValor: 2 })])
    expect(s.mgRestante).toBeCloseTo(4.75)
    expect(s.mlRestante).toBeNull()
    expect(s.naoContabilizadas).toBe(1)
  })

  it('nunca fica negativo', () => {
    const s = saldoFrasco(frasco(), [ap({ doseValor: 10, doseUnidade: 'mg' })])
    expect(s.mgRestante).toBe(0)
    expect(s.mlRestante).toBe(0)
  })
})

describe('custo e validade', () => {
  it('custo por dose proporcional ao mg', () => {
    expect(custoPorDose(frasco({ custo: 17 }), 250, 'mcg')).toBeCloseTo(0.85)
    expect(custoPorDose(frasco(), 250, 'mcg')).toBeNull()
    expect(mgDaDose(10, 'unidades', null)).toBeNull()
  })

  it('data limite: a menor entre validade e usar até (se reconstituído)', () => {
    expect(dataLimite(frasco({ validade: '2027-03-01', usarAte: '2026-11-25' }))).toBe('2026-11-25')
    expect(dataLimite(frasco({ status: 'fechado', validade: '2027-03-01', usarAte: '2026-11-25' }))).toBe('2027-03-01')
    expect(dataLimite(frasco())).toBeUndefined()
  })
})

describe('lerNumero', () => {
  it('aceita vírgula e ponto', () => {
    expect(lerNumero('2,5')).toBe(2.5)
    expect(lerNumero('2.5')).toBe(2.5)
    expect(lerNumero('1.000,5')).toBe(1000.5)
    expect(lerNumero('')).toBeNull()
    expect(lerNumero('abc')).toBeNull()
  })
})
