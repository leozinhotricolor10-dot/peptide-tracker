// Cor de cada protocolo: paleta legível no fundo escuro, longe das cores de status, atribuição estável.
import { describe, expect, it } from 'vitest'
import { atribuirCores, CORES_PROTOCOLO, corDe, corValida, proximaCor } from './cores.ts'

function luminancia(hex: string): number {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
function matiz(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return -1 // cinza
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('paleta das cores de protocolo', () => {
  it('8 a 10 cores, ids e nomes únicos, nomes em português', () => {
    expect(CORES_PROTOCOLO.length).toBeGreaterThanOrEqual(8)
    expect(CORES_PROTOCOLO.length).toBeLessThanOrEqual(10)
    expect(new Set(CORES_PROTOCOLO.map((c) => c.id)).size).toBe(CORES_PROTOCOLO.length)
    expect(new Set(CORES_PROTOCOLO.map((c) => c.hex)).size).toBe(CORES_PROTOCOLO.length)
  })

  it('todas legíveis no fundo e nos cartões (contraste >= 4,5:1)', () => {
    for (const c of CORES_PROTOCOLO) {
      expect(contraste(c.hex, '#050a0e'), c.nome).toBeGreaterThanOrEqual(4.5)
      expect(contraste(c.hex, '#0a1219'), c.nome).toBeGreaterThanOrEqual(4.5)
      expect(contraste(c.hex, '#0f1c28'), c.nome).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('não imitam o turquesa de destaque nem o verde/vermelho/âmbar de status', () => {
    const status = ['#00e5c3', '#7be39b', '#ff9f80', '#ffc46b'].map(matiz)
    for (const c of CORES_PROTOCOLO) {
      const h = matiz(c.hex)
      if (h < 0) continue
      for (const s of status) {
        const dif = Math.min(Math.abs(h - s), 360 - Math.abs(h - s))
        expect(dif, `${c.nome} perto de uma cor de status`).toBeGreaterThanOrEqual(15)
      }
    }
  })
})

describe('atribuição automática', () => {
  it('a próxima cor é a primeira livre; com todas em uso, a menos usada', () => {
    expect(proximaCor([])).toBe('azul')
    expect(proximaCor(['azul'])).toBe('rosa')
    expect(proximaCor(['rosa', undefined, 'xyz'])).toBe('azul')
    const todas = CORES_PROTOCOLO.map((c) => c.id)
    expect(proximaCor(todas)).toBe('azul')
    expect(proximaCor([...todas, 'azul'])).toBe('rosa')
  })

  it('protocolos antigos sem cor ganham cores diferentes entre si, na ordem de criação, sem mexer em quem já tem', () => {
    const ps = [
      { id: 'b', inicio: '2026-11-02', criadoEm: '2026-11-02T10:00:00Z' },
      { id: 'a', inicio: '2026-11-01', criadoEm: '2026-11-01T10:00:00Z' },
      { id: 'c', inicio: '2026-11-03', criadoEm: '2026-11-03T10:00:00Z', cor: 'azul' },
      { id: 'd', inicio: '2026-11-04', criadoEm: '2026-11-04T10:00:00Z', cor: 'nao-existe' },
    ]
    const r = atribuirCores(ps)
    expect(r.map((p) => p.cor)).toEqual(['amarelo', 'rosa', 'azul', 'violeta'])
    expect(new Set(r.map((p) => p.cor)).size).toBe(4)
    expect(ps[0]).not.toHaveProperty('cor') // não muda a lista recebida
    expect(atribuirCores(r)).toEqual(r) // estável: rodar de novo não troca nada
  })

  it('cor inválida ou ausente na hora de mostrar cai numa cor fixa pelo id', () => {
    expect(corValida('violeta')).toBe(true)
    expect(corValida('roxo-neon')).toBe(false)
    expect(corDe({ id: 'p1', cor: 'violeta' }).id).toBe('violeta')
    expect(corDe({ id: 'p1' })).toEqual(corDe({ id: 'p1' }))
    expect(CORES_PROTOCOLO).toContain(corDe(undefined))
  })
})
