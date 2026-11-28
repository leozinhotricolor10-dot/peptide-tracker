import { describe, expect, it } from 'vitest'
import { CAPACIDADE_SERINGA, fracaoDaBarra, marcasDaRegua, marcasDaSeringa, posicaoNaSeringa } from './desenho.ts'

describe('seringa desenhada', () => {
  it('0 unidades: marca no zero, sem aviso', () => {
    const p = posicaoNaSeringa({ unidades: 0 })!
    expect(p.fracao).toBe(0)
    expect(p.acima).toBe(false)
    expect(p.rotulo).toContain('marcada em 0 de 100')
  })

  it('fração de unidade: posição exata, sem arredondar para a marca', () => {
    const p = posicaoNaSeringa({ unidades: 7.5 })!
    expect(p.fracao).toBeCloseTo(0.075, 10)
    expect(p.unidades).toBe(7.5)
    expect(p.rotulo).toContain('7,5 de 100')
  })

  it('50 unidades: meio da seringa', () => {
    expect(posicaoNaSeringa({ unidades: 50 })!.fracao).toBe(0.5)
  })

  it('100 unidades: seringa cheia, sem aviso', () => {
    const p = posicaoNaSeringa({ unidades: 100 })!
    expect(p.fracao).toBe(1)
    expect(p.acima).toBe(false)
  })

  it('acima de 100: fica cheia e avisa que passou da seringa', () => {
    const p = posicaoNaSeringa({ unidades: 120 })!
    expect(p.fracao).toBe(1)
    expect(p.acima).toBe(true)
    expect(p.rotulo).toContain('120 unidades, mais que a seringa inteira')
  })

  it('blend em mL: 0,25 mL = 25 unidades', () => {
    const p = posicaoNaSeringa({ ml: 0.25 })!
    expect(p.unidades).toBe(25)
    expect(p.fracao).toBe(0.25)
  })

  it('sem dado não desenha (vazio, negativo, não numérico)', () => {
    expect(posicaoNaSeringa({})).toBeNull()
    expect(posicaoNaSeringa({ unidades: null, ml: null })).toBeNull()
    expect(posicaoNaSeringa({ unidades: -1 })).toBeNull()
    expect(posicaoNaSeringa({ unidades: Number.NaN })).toBeNull()
    expect(posicaoNaSeringa({ ml: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('texto alternativo só descreve (nenhum verbo de instrução; textos.test.ts também varre este arquivo)', () => {
    const instrucao = /\b(puxe|puxar|aplique|aplicar|injete|injetar|tome|tomar|use|usar|deve|deveria|ideal|recomend\w*)\b/i
    for (const u of [0, 7.5, 50, 100, 120]) expect(posicaoNaSeringa({ unidades: u })!.rotulo).not.toMatch(instrucao)
  })

  it('escala de 0 a 100, marca a cada 2, número a cada 20', () => {
    const m = marcasDaSeringa()
    expect(m[0]).toEqual({ u: 0, grande: true, numero: true })
    expect(m.at(-1)).toEqual({ u: CAPACIDADE_SERINGA, grande: true, numero: true })
    expect(m).toHaveLength(51)
    expect(m.filter((x) => x.numero).map((x) => x.u)).toEqual([0, 20, 40, 60, 80, 100])
  })
})

describe('régua graduada das barras de saldo', () => {
  it('9 risquinhos internos, de 10% em 10%', () => {
    const r = marcasDaRegua()
    expect(r).toHaveLength(9)
    expect(r[0]).toBeCloseTo(0.1)
    expect(r[8]).toBeCloseTo(0.9)
  })

  it('divisões inválidas não desenham', () => {
    expect(marcasDaRegua(1)).toEqual([])
    expect(marcasDaRegua(2.5)).toEqual([])
  })

  it('fração da barra fica entre 0 e 1 e some sem total', () => {
    expect(fracaoDaBarra(1.45, 2)).toBeCloseTo(0.725)
    expect(fracaoDaBarra(-0.1, 2)).toBe(0)
    expect(fracaoDaBarra(3, 2)).toBe(1)
    expect(fracaoDaBarra(1, 0)).toBeNull()
    expect(fracaoDaBarra(null, 2)).toBeNull()
  })
})
