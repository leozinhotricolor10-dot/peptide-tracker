// Cores do app: um tema só, claro (fundo cinza-azulado, cartões brancos, acento azul).
// As cores valem de verdade no CSS (src/index.css, bloco @theme); aqui fica a mesma tabela para os
// testes de contraste (paleta.test.ts confere que o CSS e esta tabela são iguais), para o
// index.html, o manifesto e a página 404 (mesma cor de fundo, sem piscar no carregamento).
// Nenhum componente usa hex: usam as classes do Tailwind (bg-sup, text-acento...) e, para a cor do
// protocolo, var(--prot-<id>) (tons em src/dominio/cores.ts).

export type Token =
  | 'fundo' | 'sup' | 'sup2' | 'acento' | 'sobre-acento' | 'acento-escuro' | 'selecionado'
  | 'texto' | 'fraco' | 'suave' | 'linha' | 'borda' | 'aviso' | 'aviso-fundo' | 'aviso-texto'
  | 'erro' | 'ok' | 'ok-fundo' | 'veu' | 'dica'

export const PALETA: Record<Token, string> = {
  fundo: '#f3f6fa', sup: '#ffffff', sup2: '#ebf0f6', acento: '#0b5fcc', 'sobre-acento': '#ffffff',
  'acento-escuro': '#d9e8ff', selecionado: '#e3eeff', texto: '#0f1b2a', fraco: '#4d5d70', suave: '#33445a',
  linha: '#d3dce7', borda: '#7b8aa0', aviso: '#945700', 'aviso-fundo': '#fff1d6', 'aviso-texto': '#6b4000',
  erro: '#b42318', ok: '#13733a', 'ok-fundo': '#e4f4ea', veu: '#0f1b2a', dica: '#5f6c7d',
}

/** Força do véu atrás de folhas e diálogos (porcentagem da cor `veu`). */
export const VEU_FORCA = '55%'

/** Barra do sistema (meta theme-color, manifesto) e esquema de cores nativo (barras de rolagem, campos de data). */
export const COR_BARRA = PALETA.fundo
export const ESQUEMA = 'light'

/**
 * Pares texto/fundo que aparecem nas telas (contraste mínimo 4,5:1).
 * [cor do texto, cor do fundo]
 */
export const PARES_TEXTO: readonly [Token, Token][] = [
  ...(['texto', 'fraco', 'suave', 'acento', 'aviso', 'erro', 'ok', 'dica'] as const).flatMap((t) =>
    (['fundo', 'sup', 'sup2', 'selecionado'] as const).map((f) => [t, f] as [Token, Token]),
  ),
  ['aviso-texto', 'aviso-fundo'], ['aviso', 'aviso-fundo'], ['texto', 'aviso-fundo'],
  ['ok', 'ok-fundo'], ['texto', 'ok-fundo'], ['fraco', 'ok-fundo'],
  // cartão "Próxima dose" (fundo no acento), botões cheios e legenda das fotos (véu escuro)
  ['sobre-acento', 'acento'], ['acento-escuro', 'acento'], ['sobre-acento', 'ok'], ['sobre-acento', 'erro'], ['sobre-acento', 'veu'],
  ['acento', 'sup'], ['fraco', 'sup2'],
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
