// Temas de cor do app. As cores valem de verdade no CSS (src/index.css, um bloco por tema, trocado
// pelo atributo data-tema no <html>); aqui fica a mesma tabela para os testes de contraste
// (temas.test.ts confere que o CSS e esta tabela são iguais) e para a barra do sistema (theme-color).
// Nenhum componente usa hex: usam as classes do Tailwind (bg-sup, text-acento...) e, para a cor do
// protocolo, var(--prot-<id>).

export type Tema = 'preto' | 'indigo' | 'claro'
/** O que a pessoa escolheu em Ajustes. "auto" segue o claro/escuro do aparelho. */
export type PreferenciaTema = Tema | 'auto'

export const TEMAS: readonly Tema[] = ['preto', 'indigo', 'claro']
export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ['preto', 'indigo', 'claro', 'auto']
export const TEMA_PADRAO: Tema = 'preto'
/** Espelho síncrono da preferência (lido pelo script do index.html antes da primeira pintura). */
export const CHAVE_ESPELHO = 'pt-tema'

export function preferenciaValida(v: unknown): v is PreferenciaTema {
  return typeof v === 'string' && (PREFERENCIAS_TEMA as readonly string[]).includes(v)
}

/** Tema que aparece na tela. Automático: aparelho no escuro = Preto, no claro = Claro. */
export function temaEfetivo(pref: unknown, aparelhoClaro: boolean): Tema {
  if (pref === 'auto') return aparelhoClaro ? 'claro' : 'preto'
  return (TEMAS as readonly unknown[]).includes(pref) ? (pref as Tema) : TEMA_PADRAO
}

export type Token =
  | 'fundo' | 'sup' | 'sup2' | 'acento' | 'sobre-acento' | 'acento-escuro' | 'selecionado'
  | 'texto' | 'fraco' | 'suave' | 'linha' | 'borda' | 'aviso' | 'aviso-fundo' | 'aviso-texto'
  | 'erro' | 'ok' | 'ok-fundo' | 'veu' | 'dica'

export const PALETAS: Record<Tema, Record<Token, string>> = {
  // Preto (opção D): fundo preto puro, acento branco. É o padrão e não mudou.
  preto: {
    fundo: '#000000', sup: '#121212', sup2: '#1c1c1c', acento: '#ffffff', 'sobre-acento': '#0b0b0b',
    'acento-escuro': '#3d3d3d', selecionado: '#242424', texto: '#f2f2f2', fraco: '#a6a6a6', suave: '#cccccc',
    linha: '#2c2c2c', borda: '#6e6e6e', aviso: '#ffc46b', 'aviso-fundo': '#2a1f0c', 'aviso-texto': '#ffd99a',
    erro: '#ff8a80', ok: '#5fd98e', 'ok-fundo': '#0d2016', veu: '#000000', dica: '#8c8c8c',
  },
  // Índigo (opção B): azul-noite, acento lilás.
  indigo: {
    fundo: '#0c0e16', sup: '#141724', sup2: '#1c2032', acento: '#a5adff', 'sobre-acento': '#0e1130',
    'acento-escuro': '#262c6b', selecionado: '#232850', texto: '#ecedf5', fraco: '#aeb3c8', suave: '#cdd0e0',
    linha: '#2a2f47', borda: '#646b8c', aviso: '#ffc46b', 'aviso-fundo': '#2a2213', 'aviso-texto': '#ffd99a',
    erro: '#ff8f8f', ok: '#6edc9a', 'ok-fundo': '#10281d', veu: '#000000', dica: '#9096ae',
  },
  // Claro (opção C): fundo cinza-azulado claro, cartões brancos, acento azul.
  claro: {
    fundo: '#f3f6fa', sup: '#ffffff', sup2: '#ebf0f6', acento: '#0b5fcc', 'sobre-acento': '#ffffff',
    'acento-escuro': '#d9e8ff', selecionado: '#e3eeff', texto: '#0f1b2a', fraco: '#4d5d70', suave: '#33445a',
    linha: '#d3dce7', borda: '#7b8aa0', aviso: '#945700', 'aviso-fundo': '#fff1d6', 'aviso-texto': '#6b4000',
    erro: '#b42318', ok: '#13733a', 'ok-fundo': '#e4f4ea', veu: '#0f1b2a', dica: '#5f6c7d',
  },
}

/** Cor de cada protocolo por tema (mesmos ids gravados; só o tom muda). Ordem = src/dominio/cores.ts. */
export const CORES_POR_TEMA: Record<Tema, Record<string, string>> = {
  preto: { azul: '#5db4ff', rosa: '#ff85b8', amarelo: '#f2e26e', violeta: '#d99cff', celeste: '#9fe3ff', magenta: '#f08ae0', prata: '#c9cfda', lima: '#cfee7c' },
  indigo: { azul: '#5db4ff', rosa: '#ff85b8', amarelo: '#f2e26e', violeta: '#d29cff', celeste: '#9fe3ff', magenta: '#f08ae0', prata: '#c9cfda', lima: '#cfee7c' },
  // amarelo #7A6200 do desenho virou #746200: ficava a 13° do âmbar de aviso (#945700); agora 15°+.
  claro: { azul: '#3f4fd9', rosa: '#c0267a', amarelo: '#746200', violeta: '#7b3fc4', celeste: '#0b6e8c', magenta: '#9b2aae', prata: '#596577', lima: '#4a6e00' },
}

/** Barra do sistema (meta theme-color) e esquema de cores nativo (barras de rolagem, campos de data). */
export const META_TEMA: Record<Tema, { themeColor: string; esquema: 'dark' | 'light' }> = {
  preto: { themeColor: PALETAS.preto.fundo, esquema: 'dark' },
  indigo: { themeColor: PALETAS.indigo.fundo, esquema: 'dark' },
  claro: { themeColor: PALETAS.claro.fundo, esquema: 'light' },
}

/** Textos da escolha em Ajustes (rótulo curto + descrição). */
export const ROTULO_TEMA: Record<PreferenciaTema, { nome: string; descricao: string }> = {
  preto: { nome: 'Preto', descricao: 'Fundo preto, destaque branco' },
  indigo: { nome: 'Índigo', descricao: 'Azul-noite, destaque lilás' },
  claro: { nome: 'Claro', descricao: 'Fundo claro, destaque azul' },
  auto: { nome: 'Automático', descricao: 'Igual ao aparelho' },
}

/**
 * Pares texto/fundo que aparecem nas telas (contraste mínimo 4,5:1 em todos os temas).
 * [cor do texto, cor do fundo]
 */
export const PARES_TEXTO: readonly [Token, Token][] = [
  ...(['texto', 'fraco', 'suave', 'acento', 'aviso', 'erro', 'ok', 'dica'] as const).flatMap((t) =>
    (['fundo', 'sup', 'sup2', 'selecionado'] as const).map((f) => [t, f] as [Token, Token]),
  ),
  ['aviso-texto', 'aviso-fundo'], ['aviso', 'aviso-fundo'], ['texto', 'aviso-fundo'],
  ['ok', 'ok-fundo'], ['texto', 'ok-fundo'], ['fraco', 'ok-fundo'],
  // cartão "Próxima dose" (fundo no acento) e botões cheios
  ['sobre-acento', 'acento'], ['acento-escuro', 'acento'], ['acento', 'sup'],
  ['sobre-acento', 'ok'], ['sobre-acento', 'erro'], ['fraco', 'sup2'],
]

/** Bordas e contornos que precisam ser vistos (mínimo 3:1, regra de componentes de interface). */
export const PARES_CONTORNO: readonly [Token, Token][] = [
  ['borda', 'fundo'], ['borda', 'sup'], ['acento', 'fundo'], ['acento', 'sup'], ['sobre-acento', 'acento'],
]

export function luminancia(hex: string): number {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
