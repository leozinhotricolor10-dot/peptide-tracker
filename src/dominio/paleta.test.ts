/// <reference types="node" />
// Tema único (claro): o CSS, o index.html, o manifesto e a página 404 usam as cores de paleta.ts;
// todo par de texto passa de 4,5:1; não sobrou nada dos temas antigos (Preto, Índigo, Automático).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COR_BARRA, contraste, ESQUEMA, PALETA, PARES_CONTORNO, PARES_TEXTO, VEU_FORCA } from './paleta.ts'
import { CORES_PROTOCOLO } from './cores.ts'

const raiz = join(import.meta.dirname, '..', '..')
const CSS = readFileSync(join(raiz, 'src', 'index.css'), 'utf8')
const HTML = readFileSync(join(raiz, 'index.html'), 'utf8')
const VITE = readFileSync(join(raiz, 'vite.config.ts'), 'utf8')

/** Variáveis declaradas no primeiro bloco cujo seletor contém `seletor`. */
function bloco(seletor: string): Record<string, string> {
  const i = CSS.indexOf(seletor)
  expect(i, seletor).toBeGreaterThanOrEqual(0)
  const corpo = CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i))
  const out: Record<string, string> = {}
  for (const m of corpo.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim().toLowerCase()
  return out
}

describe('paleta = CSS', () => {
  it('cada cor do @theme (classes do Tailwind) bate com paleta.ts', () => {
    const v = bloco('@theme {')
    for (const [token, hex] of Object.entries(PALETA)) expect(v[`color-${token}`], token).toBe(hex)
  })

  it('cada cor de protocolo e a força do véu no :root batem com cores.ts e paleta.ts; esquema claro', () => {
    const v = bloco(':root {') // o primeiro :root do arquivo é o das cores
    for (const c of CORES_PROTOCOLO) expect(v[`prot-${c.id}`], c.id).toBe(c.hex)
    expect(v['veu-forca']).toBe(VEU_FORCA)
    expect(CSS).toContain('color-scheme: light;')
  })

  it('o tema é o claro e azul de sempre (valores do antigo tema Claro)', () => {
    expect(PALETA.fundo).toBe('#f3f6fa')
    expect(PALETA.sup).toBe('#ffffff')
    expect(PALETA.sup2).toBe('#ebf0f6')
    expect(PALETA.acento).toBe('#0b5fcc')
    expect(PALETA['sobre-acento']).toBe('#ffffff')
    expect(PALETA.texto).toBe('#0f1b2a')
    expect(PALETA.fraco).toBe('#4d5d70')
    expect(PALETA.linha).toBe('#d3dce7')
    expect([PALETA.ok, PALETA.aviso, PALETA['aviso-fundo'], PALETA['aviso-texto'], PALETA.erro]).toEqual(['#13733a', '#945700', '#fff1d6', '#6b4000', '#b42318'])
  })

  it('não sobrou troca de tema nem cor dos temas escuros', () => {
    for (const texto of [CSS, HTML, VITE]) {
      expect(texto).not.toMatch(/data-tema|trocando-tema|pt-tema|prefers-color-scheme/)
      expect(texto.toLowerCase()).not.toMatch(/#000000|#a5adff|#0c0e16|#121212|#f2f2f2/)
    }
    expect(CSS).not.toMatch(/color-scheme: dark/)
  })
})

describe('carregamento sem piscar (index.html, manifesto, 404)', () => {
  it('index.html: barra do sistema, esquema e fundo do 1º quadro no tema claro; sem script de tema', () => {
    expect(HTML).toContain(`<meta name="theme-color" content="${COR_BARRA}" />`)
    expect(HTML).toContain(`<meta name="color-scheme" content="${ESQUEMA}" />`)
    expect(HTML).toContain(`html,body{background:${PALETA.fundo};color:${PALETA.texto}`)
    expect(HTML).not.toContain('<script>')
    // barra do iPhone com texto escuro (a translúcida deixaria o relógio branco sobre o fundo claro)
    expect(HTML).toContain('name="apple-mobile-web-app-status-bar-style" content="default"')
  })

  it('manifesto: tela de abertura e barra na cor do fundo claro', () => {
    expect(VITE).toContain(`background_color: '${PALETA.fundo}'`)
    expect(VITE).toContain(`theme_color: '${COR_BARRA}'`)
  })

  it('ícone: gota branca sobre o azul do acento (favicon.svg, gerado por tools/gerar-icones.mjs)', () => {
    const svg = readFileSync(join(raiz, 'public', 'favicon.svg'), 'utf8').toLowerCase()
    expect(svg).toContain(`fill="${PALETA.acento}"`)
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).not.toContain('#000000')
    expect(contraste('#ffffff', PALETA.acento)).toBeGreaterThanOrEqual(4.5)
  })

  it('404: fundo, texto e link nas cores do tema claro, link com 44 px de altura', () => {
    expect(VITE).toContain(`background:${PALETA.fundo};color:${PALETA.texto}`)
    expect(VITE).toContain(`a{color:${PALETA.acento}`)
    expect(VITE).toContain('min-height:44px')
    expect(contraste(PALETA.acento, PALETA.fundo)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('contraste', () => {
  it('todos os pares de texto >= 4,5:1', () => {
    const ruins = PARES_TEXTO.filter(([a, b]) => contraste(PALETA[a], PALETA[b]) < 4.5).map(([a, b]) => `${a}/${b} ${contraste(PALETA[a], PALETA[b]).toFixed(2)}`)
    expect(ruins).toEqual([])
  })

  it('bordas de campo e acento >= 3:1 contra o fundo e o cartão', () => {
    for (const [a, b] of PARES_CONTORNO) expect(contraste(PALETA[a], PALETA[b]), `${a}/${b}`).toBeGreaterThanOrEqual(3)
  })

  it('barra do sistema na cor do fundo, esquema "light"', () => {
    expect(COR_BARRA).toBe(PALETA.fundo)
    expect(ESQUEMA).toBe('light')
  })
})
