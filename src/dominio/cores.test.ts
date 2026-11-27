/// <reference types="node" />
// Cor de cada protocolo (regra 60-30-10): marcador suave visível no fundo e nos cartões (>= 3:1), nunca
// texto, distinta das outras, do acento e das cores de status (também em luminosidade); atribuição estável.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { atribuirCores, CORES_PROTOCOLO, corDe, corValida, proximaCor } from './cores.ts'
import { PALETA as p } from './paleta.ts'

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

/** CIELAB (D65): [L*, a*, b*]. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const xyz = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883]
  const [fx, fy, fz] = xyz.map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116))
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
const croma = (hex: string) => Math.hypot(lab(hex)[1], lab(hex)[2])
const deltaE = (x: string, y: string) => {
  const [a, b] = [lab(x), lab(y)]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}
const raiz = join(import.meta.dirname, '..')

describe('paleta das cores de protocolo', () => {
  it('8 a 10 cores, ids e nomes únicos, nomes em português', () => {
    expect(CORES_PROTOCOLO.length).toBeGreaterThanOrEqual(8)
    expect(CORES_PROTOCOLO.length).toBeLessThanOrEqual(10)
    expect(new Set(CORES_PROTOCOLO.map((c) => c.id)).size).toBe(CORES_PROTOCOLO.length)
    expect(new Set(CORES_PROTOCOLO.map((c) => c.hex)).size).toBe(CORES_PROTOCOLO.length)
  })

  it('marcadores (faixa, bolinha, pontinho) visíveis no fundo, nos cartões e na opção escolhida (contraste >= 3:1, regra de elemento gráfico)', () => {
    for (const c of CORES_PROTOCOLO) {
      expect(contraste(c.hex, p.fundo), `${c.nome} no fundo`).toBeGreaterThanOrEqual(3)
      expect(contraste(c.hex, p.sup), `${c.nome} no cartão`).toBeGreaterThanOrEqual(3)
      expect(contraste(c.hex, p.sup2), `${c.nome} no cartão 2`).toBeGreaterThanOrEqual(3)
      expect(contraste(c.hex, p.selecionado), `${c.nome} na opção escolhida`).toBeGreaterThanOrEqual(3)
      // o ✓ da cor escolhida (cor sobre-acento em cima da bolinha) também aparece
      expect(contraste(c.hex, p['sobre-acento']), `${c.nome} com o ✓`).toBeGreaterThanOrEqual(3)
    }
  })

  it('nunca viram cor de texto (se virassem, precisariam de 4,5:1, que estes tons suaves não têm)', () => {
    const telas = [join(raiz, 'ui'), join(raiz, 'telas')].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.tsx')).map((f) => join(d, f)))
    for (const arq of telas) {
      const codigo = readFileSync(arq, 'utf8')
      // `color:` sozinho (não borderLeftColor nem backgroundColor) recebendo a cor do protocolo
      expect(codigo, arq).not.toMatch(/(?<![A-Za-z])color:\s*(corDe\(|[\w.]*\.css\b)/)
      expect(codigo, arq).not.toMatch(/text-\[var\(--prot-/)
    }
    // e se algum dia virarem texto, a regra é esta:
    const comoTexto = CORES_PROTOCOLO.filter((c) => contraste(c.hex, p.sup) >= 4.5)
    expect(comoTexto.length).toBeLessThan(CORES_PROTOCOLO.length)
  })

  it('suaves: croma (intensidade da cor) até 52, bem abaixo do azul do acento (66)', () => {
    for (const c of CORES_PROTOCOLO) {
      expect(croma(c.hex), c.nome).toBeLessThanOrEqual(52)
      expect(croma(c.hex), c.nome).toBeLessThan(croma(p.acento) - 10)
    }
  })

  it('distintas entre si (diferença de cor ΔE >= 15 entre qualquer par)', () => {
    for (const [i, a] of CORES_PROTOCOLO.entries())
      for (const b of CORES_PROTOCOLO.slice(i + 1)) expect(deltaE(a.hex, b.hex), `${a.nome} x ${b.nome}`).toBeGreaterThanOrEqual(15)
  })

  it('distintas do azul do acento e das cores de status: ΔE >= 20 e mais claras (L* pelo menos 8 acima), não só outro matiz', () => {
    for (const [nome, ref] of Object.entries({ acento: p.acento, tomada: p.ok, perdida: p.erro, aviso: p.aviso })) {
      for (const c of CORES_PROTOCOLO) {
        expect(deltaE(c.hex, ref), `${c.nome} x ${nome}`).toBeGreaterThanOrEqual(20)
        expect(lab(c.hex)[0] - lab(ref)[0], `${c.nome} x ${nome} (luminosidade)`).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('8 tons diferentes, longe do verde/vermelho/âmbar de status', () => {
    const status = [p.ok, p.erro, p.aviso].map(matiz)
    for (const c of CORES_PROTOCOLO) {
      const h = matiz(c.hex)
      if (h < 0) continue
      for (const s of status) {
        const dif = Math.min(Math.abs(h - s), 360 - Math.abs(h - s))
        expect(dif, `${c.nome} perto de uma cor de status`).toBeGreaterThanOrEqual(15)
      }
    }
  })

  it('na tela a cor vem da variável do CSS (var(--prot-<id>)), nunca de um hex fixo', () => {
    for (const c of CORES_PROTOCOLO) expect(c.css).toBe(`var(--prot-${c.id})`)
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
