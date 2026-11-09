// Calculadora da seringa do passo da dose (calcularSeringa). Mesmas contas da Reconstituição.
import { describe, expect, it } from 'vitest'
import { calcularSeringa } from './calculos.ts'

const calc = (mgFrasco: string, diluenteMl: string, dose: string, unidade?: 'mg' | 'mcg' | 'UI' | 'mL' | 'unidades', blend = false) =>
  calcularSeringa({ mgFrasco, diluenteMl, dose, unidade, blend })

describe('calculadora da seringa: simples', () => {
  it('5 mg em 2 mL = 2,5 mg/mL; 250 mcg = 10 unidades (0,1 mL); rende 20 doses', () => {
    const c = calc('5', '2', '250', 'mcg')
    expect(c.erros).toEqual({})
    expect(c.concMgMl).toBe(2.5)
    expect(c.volumeMl).toBeCloseTo(0.1, 12)
    expect(c.unidadesExatas).toBe(10)
    expect(c.marca).toBeNull() // exato já cai na marca
    expect(c.rende).toBe(20)
    expect(c.falta).toBeUndefined()
  })

  it('vírgula decimal pt-BR: 10 mg em 1,5 mL, dose 0,5 mg', () => {
    const c = calc('10', '1,5', '0,5', 'mg')
    expect(c.concMgMl).toBeCloseTo(6.6667, 4)
    expect(c.volumeMl).toBeCloseTo(0.075, 12)
    expect(c.unidadesExatas).toBeCloseTo(7.5, 10)
    expect(c.rende).toBe(20)
  })

  it('arredondamento honesto: mostra o exato e a marca mais próxima com a dose que ela dá de verdade', () => {
    // 5 mg em 3 mL = 1,6667 mg/mL; 250 mcg = 0,15 mL = 15 unidades (exato, mesmo com dízima no meio)
    expect(calc('5', '3', '250', 'mcg').unidadesExatas).toBe(15)
    expect(calc('5', '3', '250', 'mcg').marca).toBeNull()
    // 10 mg em 3 mL = 3,3333 mg/mL; 250 mcg = 0,075 mL = 7,5 unidades -> marca 8 = 266,67 mcg
    const c = calc('10', '3', '250', 'mcg')
    expect(c.unidadesExatas).toBeCloseTo(7.5, 10)
    expect(c.marca).toBe(8)
    expect(c.doseDaMarca).toBeCloseTo(266.6667, 3)
    expect(c.rende).toBe(40)
    // mesma conta em mg
    expect(calc('10', '3', '0,25', 'mg').doseDaMarca).toBeCloseTo(0.26667, 4)
  })

  it('menos de meia unidade: avisa que não há marca, sem inventar marca 0', () => {
    const c = calc('10', '1', '20', 'mcg') // 10 mg/mL; 0,02 mg = 0,002 mL = 0,2 unidade
    expect(c.unidadesExatas).toBeCloseTo(0.2, 10)
    expect(c.marca).toBeNull()
    expect(c.abaixoDaMenorMarca).toBe(true)
  })

  it('dose maior que o frasco: rende 0', () => {
    expect(calc('1', '1', '2', 'mg').rende).toBe(0)
  })

  it('dose em mL ou unidades: converte para unidades e mostra os mg da dose', () => {
    const ml = calc('5', '2', '0,1', 'mL')
    expect(ml.unidadesExatas).toBe(10)
    expect(ml.mgDaDoseEmVolume).toBeCloseTo(0.25, 12)
    const un = calc('5', '2', '10', 'unidades')
    expect(un.volumeMl).toBeCloseTo(0.1, 12)
    expect(un.mgDaDoseEmVolume).toBeCloseTo(0.25, 12)
    expect(un.rende).toBe(20)
    // unidades não precisam do frasco para virar mL
    expect(calc('', '', '10', 'unidades').volumeMl).toBeCloseTo(0.1, 12)
  })
})

describe('calculadora da seringa: entradas inválidas', () => {
  it('campos vazios não são erro (a calculadora é opcional)', () => {
    const c = calc('', '', '250', 'mcg')
    expect(c.erros).toEqual({})
    expect(c.falta).toBe('frasco')
    expect(c.unidadesExatas).toBeNull()
  })

  it('zero e negativo são recusados', () => {
    expect(calc('0', '2', '250', 'mcg').erros.mgFrasco).toMatch(/maior que zero/)
    expect(calc('5', '-2', '250', 'mcg').erros.diluenteMl).toMatch(/maior que zero/)
    expect(calc('0', '2', '250', 'mcg').unidadesExatas).toBeNull()
  })

  it('"1.000" é ambíguo e recusado com a explicação de sempre; texto não numérico também', () => {
    expect(calc('1.000', '2', '250', 'mcg').erros.mgFrasco).toMatch(/vírgula/)
    expect(calc('abc', '2', '250', 'mcg').erros.mgFrasco).toMatch(/só o número/)
    expect(calc('5', '2,5,1', '250', 'mcg').erros.diluenteMl).toBeDefined()
  })

  it('sem dose, dose inválida ou sem unidade: pede a dose', () => {
    expect(calc('5', '2', '', 'mcg').falta).toBe('dose')
    expect(calc('5', '2', '1.000', 'mcg').falta).toBe('dose')
    expect(calc('5', '2', '250').falta).toBe('dose')
    // a concentração aparece mesmo sem dose
    expect(calc('5', '2', '').concMgMl).toBe(2.5)
  })

  it('dose em UI não é convertida', () => {
    const c = calc('5', '2', '100', 'UI')
    expect(c.falta).toBe('ui')
    expect(c.unidadesExatas).toBeNull()
  })
})

describe('calculadora da seringa: blend (só volume)', () => {
  it('não mostra concentração nem converte mg/mcg', () => {
    const c = calc('70', '3', '500', 'mcg', true)
    expect(c.falta).toBe('blend-mg')
    expect(c.concMgMl).toBeNull()
    expect(c.unidadesExatas).toBeNull()
  })

  it('dose em unidades ou mL: volume e rendimento, sem mg da dose', () => {
    const c = calc('70', '3', '10', 'unidades', true)
    expect(c.concMgMl).toBeNull()
    expect(c.volumeMl).toBeCloseTo(0.1, 12)
    expect(c.unidadesExatas).toBe(10)
    expect(c.rende).toBe(30)
    expect(c.mgDaDoseEmVolume).toBeNull()
    expect(calc('', '2', '0,25', 'mL', true).unidadesExatas).toBe(25)
  })
})
