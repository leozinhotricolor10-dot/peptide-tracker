/// <reference types="node" />
// Temas: o CSS e a tabela de temas.ts são iguais; todo par de texto passa de 4,5:1 em cada tema;
// o Automático escolhe pelo aparelho; o script do index.html conhece os mesmos temas e cores.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORES_POR_TEMA, contraste, META_TEMA, PALETAS, PARES_CONTORNO, PARES_TEXTO, PREFERENCIAS_TEMA,
  preferenciaValida, TEMA_PADRAO, temaEfetivo, TEMAS, type Tema,
} from './temas.ts'
import { CORES_PROTOCOLO } from './cores.ts'

const CSS = readFileSync(join(import.meta.dirname, '..', 'index.css'), 'utf8')
const HTML = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')

/** Variáveis declaradas no primeiro bloco cujo seletor contém `seletor`. */
function bloco(seletor: string): Record<string, string> {
  const i = CSS.indexOf(seletor)
  expect(i, seletor).toBeGreaterThanOrEqual(0)
  const corpo = CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i))
  const out: Record<string, string> = {}
  for (const m of corpo.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim().toLowerCase()
  return out
}

describe('tabela de temas = CSS', () => {
  it.each(TEMAS)('tema %s: cada cor e cada cor de protocolo do CSS bate com temas.ts', (t) => {
    const v = bloco(`[data-tema='${t}'] {`)
    for (const [token, hex] of Object.entries(PALETAS[t])) expect(v[`color-${token}`], `${t} ${token}`).toBe(hex)
    for (const [id, hex] of Object.entries(CORES_POR_TEMA[t])) expect(v[`prot-${id}`], `${t} ${id}`).toBe(hex)
    expect(v['veu-forca']).toMatch(/^\d+%$/)
  })

  it('o @theme (padrão das classes do Tailwind) é o Preto', () => {
    const v = bloco('@theme {')
    for (const [token, hex] of Object.entries(PALETAS.preto)) expect(v[`color-${token}`], token).toBe(hex)
  })

  it('o Preto continua o mesmo de antes (fundo preto, acento branco)', () => {
    expect(PALETAS.preto.fundo).toBe('#000000')
    expect(PALETAS.preto.acento).toBe('#ffffff')
    expect(TEMA_PADRAO).toBe('preto')
  })

  it('nenhum tema turquesa (o da loja) entre as opções', () => {
    for (const t of TEMAS) expect(PALETAS[t].acento).not.toBe('#00e5c3')
  })

  it('o script do index.html conhece os mesmos temas, a mesma chave e o mesmo fundo de cada um', () => {
    expect(HTML).toContain("localStorage.getItem('pt-tema')")
    for (const t of TEMAS) {
      expect(HTML, t).toContain(`${t}: '${META_TEMA[t].themeColor}'`)
      if (t !== 'preto') expect(HTML, t).toContain(`html[data-tema=${t}] body{background:${PALETAS[t].fundo};color:${PALETAS[t].texto}}`)
    }
    expect(HTML).toContain(`html,body{background:${PALETAS.preto.fundo};color:${PALETAS.preto.texto}`)
    // as metas existem antes do script que as altera
    expect(HTML.indexOf('name="theme-color"')).toBeLessThan(HTML.indexOf('pt-tema'))
    expect(HTML.indexOf('name="color-scheme"')).toBeLessThan(HTML.indexOf('pt-tema'))
  })
})

describe('contraste em cada tema', () => {
  it.each(TEMAS)('tema %s: todos os pares de texto >= 4,5:1', (t) => {
    const p = PALETAS[t]
    const ruins = PARES_TEXTO.filter(([a, b]) => contraste(p[a], p[b]) < 4.5).map(([a, b]) => `${a}/${b} ${contraste(p[a], p[b]).toFixed(2)}`)
    expect(ruins).toEqual([])
  })

  it.each(TEMAS)('tema %s: bordas de campo e acento >= 3:1 contra o fundo e o cartão', (t) => {
    const p = PALETAS[t]
    for (const [a, b] of PARES_CONTORNO) expect(contraste(p[a], p[b]), `${a}/${b}`).toBeGreaterThanOrEqual(3)
  })

  it('barra do sistema na cor do fundo; só o Claro é "light"', () => {
    for (const t of TEMAS) {
      expect(META_TEMA[t].themeColor).toBe(PALETAS[t].fundo)
      expect(META_TEMA[t].esquema).toBe(t === 'claro' ? 'light' : 'dark')
    }
  })
})

describe('preferência e Automático', () => {
  it('só as 4 escolhas valem', () => {
    expect(PREFERENCIAS_TEMA).toEqual(['preto', 'indigo', 'claro', 'auto'])
    for (const p of PREFERENCIAS_TEMA) expect(preferenciaValida(p)).toBe(true)
    for (const p of ['turquesa', 'escuro', '', 'PRETO', null, undefined, 1, {}]) expect(preferenciaValida(p)).toBe(false)
  })

  it('Automático: aparelho escuro = Preto, aparelho claro = Claro', () => {
    expect(temaEfetivo('auto', false)).toBe('preto')
    expect(temaEfetivo('auto', true)).toBe('claro')
  })

  it('escolha fixa ignora o aparelho; sem escolha ou valor estranho = Preto', () => {
    const casos: [unknown, Tema][] = [['indigo', 'indigo'], ['claro', 'claro'], ['preto', 'preto'], [undefined, 'preto'], ['turquesa', 'preto']]
    for (const [pref, esperado] of casos) {
      expect(temaEfetivo(pref, true)).toBe(esperado)
      expect(temaEfetivo(pref, false)).toBe(esperado)
    }
  })

  it('cada tema tem as 8 cores de protocolo, com os mesmos ids gravados', () => {
    for (const t of TEMAS) expect(Object.keys(CORES_POR_TEMA[t])).toEqual(CORES_PROTOCOLO.map((c) => c.id))
    for (const c of CORES_PROTOCOLO) expect(CORES_POR_TEMA.preto[c.id]).toBe(c.hex)
  })
})
