// Lógica do movimento (sem navegador): contagem, otimismo, destaque, relógio do aviso, arraste,
// lista com saída, direção da transição entre telas e o estado "Tudo feito hoje".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { comOtimismo, criarRelogio, decidirArraste, DESTAQUE_MS, ehRecente, limparRecentes, marcarRecente, mesclarSaida, valorNaContagem, vibrar } from './movimento.ts'
import { direcaoDaTroca } from './transicao.ts'
import { resumoHoje } from '../dominio/agenda.ts'
import { resumoEstoque, type EstoqueDoItem } from '../dominio/estoque.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('contagem animada', () => {
  it('começa no valor antigo e termina exatamente no novo', () => {
    expect(valorNaContagem(5, 4, 0)).toBe(5)
    expect(valorNaContagem(5, 4, 1)).toBe(4)
    expect(valorNaContagem(5, 4, 3.7)).toBe(4) // passou da duração: valor final, sem resto
    expect(valorNaContagem(0.1, 0.3, 1)).toBe(0.3) // sem erro de ponto flutuante no fim
  })
  it('anda sempre na direção certa e desacelera', () => {
    const vals = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99].map((t) => valorNaContagem(10, 20, t))
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1])
    expect(vals.every((v) => v >= 10 && v < 20)).toBe(true)
    // metade do tempo já percorreu mais da metade do caminho (desacelera no fim)
    expect(valorNaContagem(10, 20, 0.5)).toBeGreaterThan(15)
    // descendo (registrar dose: 5 -> 4 doses)
    expect(valorNaContagem(5, 4, 0.5)).toBeLessThan(5)
    expect(valorNaContagem(5, 4, 0.5)).toBeGreaterThan(4)
  })
  it('arredondado para inteiro (doses restantes) chega no número final', () => {
    const r = (t: number) => Math.round(valorNaContagem(6, 5, t))
    expect(r(0)).toBe(6)
    expect(r(1)).toBe(5)
  })
})

describe('otimismo (a animação começa antes e volta se a gravação falhar)', () => {
  it('sucesso: antes roda antes de gravar, depois recebe o resultado', async () => {
    const ordem: string[] = []
    const r = await comOtimismo(
      async () => {
        ordem.push('gravar')
        return 42
      },
      { antes: () => ordem.push('antes'), depois: (v) => ordem.push(`depois ${v}`), falhou: () => ordem.push('falhou') },
    )
    expect(r).toBe(42)
    expect(ordem).toEqual(['antes', 'gravar', 'depois 42'])
  })
  it('falha: chama falhou com o erro, não chama depois, devolve undefined', async () => {
    const ordem: string[] = []
    const erro = new Error('disco cheio')
    const r = await comOtimismo(
      async () => {
        throw erro
      },
      { antes: () => ordem.push('antes'), depois: () => ordem.push('depois'), falhou: (e) => ordem.push(`falhou ${(e as Error).message}`) },
    )
    expect(r).toBeUndefined()
    expect(ordem).toEqual(['antes', 'falhou disco cheio'])
  })
})

describe('destaque do registro recém-feito', () => {
  it('vale por um tempo curto e depois some', () => {
    marcarRecente('ap1', 1000)
    expect(ehRecente('ap1', 1000)).toBe(true)
    expect(ehRecente('ap1', 1000 + DESTAQUE_MS - 1)).toBe(true)
    expect(ehRecente('ap1', 1000 + DESTAQUE_MS)).toBe(false)
    expect(ehRecente(undefined)).toBe(false)
    limparRecentes(1000 + DESTAQUE_MS)
    expect(ehRecente('ap1', 1000)).toBe(false)
  })
})

describe('vibração', () => {
  it('não quebra onde não existe', () => {
    expect(() => vibrar(15)).not.toThrow()
  })
})

describe('relógio do aviso (toast)', () => {
  it('some no tempo certo', () => {
    vi.useFakeTimers()
    const acabou = vi.fn()
    criarRelogio(6000, acabou, () => Date.now())
    vi.advanceTimersByTime(5999)
    expect(acabou).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(acabou).toHaveBeenCalledTimes(1)
  })
  it('dedo em cima pausa; soltar continua de onde parou', () => {
    vi.useFakeTimers()
    const acabou = vi.fn()
    const r = criarRelogio(6000, acabou, () => Date.now())
    vi.advanceTimersByTime(2000)
    r.pausar()
    expect(r.pausado()).toBe(true)
    expect(r.restante()).toBe(4000)
    vi.advanceTimersByTime(60000)
    expect(acabou).not.toHaveBeenCalled()
    r.retomar()
    vi.advanceTimersByTime(3999)
    expect(acabou).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(acabou).toHaveBeenCalledTimes(1)
  })
  it('parar (Desfazer, arrastar para fora) cancela de vez', () => {
    vi.useFakeTimers()
    const acabou = vi.fn()
    const r = criarRelogio(6000, acabou, () => Date.now())
    r.parar()
    r.retomar()
    vi.advanceTimersByTime(10000)
    expect(acabou).not.toHaveBeenCalled()
    expect(r.pausado()).toBe(false)
  })
})

describe('arrastar o aviso', () => {
  it('pouco arraste volta; arraste longo para qualquer lado dispensa', () => {
    expect(decidirArraste(20, 360)).toBe('voltar')
    expect(decidirArraste(-71, 360)).toBe('voltar')
    expect(decidirArraste(72, 360)).toBe('dispensar')
    expect(decidirArraste(-120, 360)).toBe('dispensar')
    // aviso estreito: 30% da largura basta
    expect(decidirArraste(61, 200)).toBe('dispensar')
  })
})

describe('lista com saída', () => {
  const k = (x: string) => x
  it('item que saiu continua na mesma posição, marcado para sair', () => {
    const antes = ['a', 'b', 'c'].map((item) => ({ item, saindo: false }))
    expect(mesclarSaida(antes, ['a', 'c'], k)).toEqual([
      { item: 'a', saindo: false },
      { item: 'b', saindo: true },
      { item: 'c', saindo: false },
    ])
    expect(mesclarSaida(antes, ['b', 'c'], k)[0]).toEqual({ item: 'a', saindo: true })
  })
  it('item novo entra; item que voltou (desfazer) não fica duplicado', () => {
    const antes = [{ item: 'a', saindo: false }, { item: 'b', saindo: true }]
    expect(mesclarSaida(antes, ['n', 'a', 'b'], k)).toEqual([
      { item: 'n', saindo: false },
      { item: 'a', saindo: false },
      { item: 'b', saindo: false },
    ])
  })
  it('com "reduzir movimento", sai na hora', () => {
    const antes = ['a', 'b'].map((item) => ({ item, saindo: false }))
    expect(mesclarSaida(antes, ['a'], k, true)).toEqual([{ item: 'a', saindo: false }])
  })
})

describe('direção da transição entre telas', () => {
  it('avançar, voltar, trocar de aba e trocar no lugar', () => {
    expect(direcaoDaTroca({ idx: 1, caminho: '/protocolos' }, { idx: 2, caminho: '/protocolos/x' })).toBe('avancar')
    expect(direcaoDaTroca({ idx: 2, caminho: '/protocolos/x' }, { idx: 1, caminho: '/protocolos' })).toBe('voltar')
    expect(direcaoDaTroca({ idx: 3, caminho: '/hoje' }, { idx: 4, caminho: '/estoque' })).toBe('aba')
    expect(direcaoDaTroca({ idx: 4, caminho: '/estoque' }, { idx: 3, caminho: '/hoje' })).toBe('aba')
    expect(direcaoDaTroca({ idx: 2, caminho: '/novo/dose' }, { idx: 2, caminho: '/novo/frequencia' })).toBe('troca')
  })
})

describe('Tudo feito hoje', () => {
  it('só quando todas as doses previstas foram tomadas', () => {
    expect(resumoHoje([])).toEqual({ feitas: 0, total: 0, tudoFeito: false })
    expect(resumoHoje(['feita'])).toEqual({ feitas: 1, total: 1, tudoFeito: true })
    expect(resumoHoje(['feita', 'pendente'])).toEqual({ feitas: 1, total: 2, tudoFeito: false })
    expect(resumoHoje(['feita', 'atrasada']).tudoFeito).toBe(false)
    expect(resumoHoje(['feita', 'pulada']).tudoFeito).toBe(false) // pular não é "feito"
    expect(resumoHoje(['feita', 'feita', 'feita'])).toEqual({ feitas: 3, total: 3, tudoFeito: true })
  })
})

describe('resumo do estoque com a contagem animada', () => {
  const e = { frasco: { id: 'f' }, doses: 4, mgRestante: 8, vencido: false, outros: 0 } as unknown as EstoqueDoItem
  it('usa o número mostrado na contagem e termina no valor calculado', () => {
    expect(resumoEstoque(e, 5)).toBe('Frasco: 5 doses restantes')
    expect(resumoEstoque(e)).toBe('Frasco: 4 doses restantes')
    expect(resumoEstoque(e, 1)).toBe('Frasco: 1 dose restante')
    expect(resumoEstoque(e, 0)).toBe('Frasco: menos de 1 dose restante')
  })
})
