// Aplicar o tema na página (sem navegador: document, localStorage e matchMedia de mentira).
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Meta { content: string; setAttribute: (k: string, v: string) => void }
function criarMeta(): Meta {
  const m: Meta = { content: '', setAttribute: (_k, v) => { m.content = v } }
  return m
}

let html: { dataset: Record<string, string>; classList: { add: (c: string) => void; remove: (c: string) => void } }
let metas: Record<string, Meta>
let guardado: Map<string, string>
let aparelhoClaro: boolean
let ouvintes: (() => void)[]

beforeEach(() => {
  vi.resetModules()
  html = { dataset: {}, classList: { add: () => {}, remove: () => {} } }
  metas = { 'theme-color': criarMeta(), 'color-scheme': criarMeta() }
  guardado = new Map()
  aparelhoClaro = false
  ouvintes = []
  vi.stubGlobal('document', {
    documentElement: html,
    querySelector: (s: string) => metas[/name="([\w-]+)"/.exec(s)?.[1] ?? ''] ?? null,
  })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v),
  })
  vi.stubGlobal('window', {
    setTimeout: (f: () => void) => { f(); return 0 },
    matchMedia: (q: string) => ({
      get matches() { return q.includes('color-scheme: light') ? aparelhoClaro : false },
      addEventListener: (_: string, f: () => void) => ouvintes.push(f),
      removeEventListener: (_: string, f: () => void) => { ouvintes = ouvintes.filter((x) => x !== f) },
    }),
  })
})

describe('aplicar o tema', () => {
  it('escolha fixa: marca o <html>, a barra do sistema, o esquema e guarda a cópia local', async () => {
    const { aplicarTema, lerEspelho, temaNaTela } = await import('./tema.ts')
    expect(aplicarTema('claro')).toBe('claro')
    expect(html.dataset.tema).toBe('claro')
    expect(metas['theme-color'].content).toBe('#f3f6fa')
    expect(metas['color-scheme'].content).toBe('light')
    expect(guardado.get('pt-tema')).toBe('claro')
    expect(lerEspelho()).toBe('claro')
    expect(temaNaTela()).toBe('claro')
    aplicarTema('indigo')
    expect(html.dataset.tema).toBe('indigo')
    expect(metas['theme-color'].content).toBe('#0c0e16')
    expect(metas['color-scheme'].content).toBe('dark')
  })

  it('sem escolha ou valor estragado: Preto (e a cópia local também)', async () => {
    const { aplicarTema, lerEspelho } = await import('./tema.ts')
    expect(aplicarTema(undefined)).toBe('preto')
    expect(guardado.get('pt-tema')).toBe('preto')
    guardado.set('pt-tema', 'turquesa')
    expect(lerEspelho()).toBe('preto')
    expect(aplicarTema('turquesa')).toBe('preto')
    expect(html.dataset.tema).toBe('preto')
    expect(metas['theme-color'].content).toBe('#000000')
  })

  it('Automático segue o aparelho e reage quando ele muda; ao sair do Automático, para de ouvir', async () => {
    const { aplicarTema } = await import('./tema.ts')
    aparelhoClaro = true
    expect(aplicarTema('auto')).toBe('claro')
    expect(guardado.get('pt-tema')).toBe('auto')
    expect(ouvintes).toHaveLength(1)
    aparelhoClaro = false
    ouvintes.forEach((f) => f())
    expect(html.dataset.tema).toBe('preto')
    expect(metas['color-scheme'].content).toBe('dark')
    aparelhoClaro = true
    ouvintes.forEach((f) => f())
    expect(html.dataset.tema).toBe('claro')
    aplicarTema('indigo')
    expect(ouvintes).toHaveLength(0)
    expect(html.dataset.tema).toBe('indigo')
  })

  it('troca feita pela pessoa: transição curta (classe no <html> que sai sozinha)', async () => {
    const { aplicarTema } = await import('./tema.ts')
    const add = vi.fn()
    const remove = vi.fn()
    html.classList = { add, remove } as never
    aplicarTema('claro', true)
    expect(add).toHaveBeenCalledWith('trocando-tema')
    expect(remove).toHaveBeenCalledWith('trocando-tema')
    add.mockClear()
    aplicarTema('indigo') // vindo do banco (abrir o app, importar backup): sem transição
    expect(add).not.toHaveBeenCalled()
  })

  it('armazenamento local bloqueado: o tema ainda aplica, sem erro', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    const { aplicarTema, lerEspelho } = await import('./tema.ts')
    expect(aplicarTema('claro')).toBe('claro')
    expect(html.dataset.tema).toBe('claro')
    expect(lerEspelho()).toBe('preto')
  })
})
