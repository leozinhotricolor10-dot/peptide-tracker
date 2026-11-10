// Transição entre telas com a View Transitions API (Chrome/Edge/Android e Safari recentes).
// Onde não existe, a troca é a de sempre (sem animação). Direção: avançar entra da direita,
// voltar entra da esquerda, troca de aba (barra de baixo) e troca no mesmo lugar só esmaecem.
import type { createHashRouter } from 'react-router'
import { reduzirMovimento } from './movimento.ts'

export type Direcao = 'avancar' | 'voltar' | 'aba' | 'troca'

/** As 4 abas da barra de baixo. */
export const ABAS_PRINCIPAIS = ['/hoje', '/protocolos', '/peso', '/estoque']

/** Decide a direção a partir da posição no histórico (idx) e das rotas. */
export function direcaoDaTroca(antes: { idx: number; caminho: string }, depois: { idx: number; caminho: string }, abas = ABAS_PRINCIPAIS): Direcao {
  if (abas.includes(antes.caminho) && abas.includes(depois.caminho)) return 'aba'
  if (depois.idx > antes.idx) return 'avancar'
  if (depois.idx < antes.idx) return 'voltar'
  return 'troca'
}

function idxAtual(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : 0
}

/**
 * Liga as transições no roteador: toda navegação por link/botão pede a transição (o roteador
 * repete a mesma ao voltar pelo celular) e a direção fica em <html data-direcao>, que o CSS usa.
 */
export function ligarTransicoes(router: ReturnType<typeof createHashRouter>): void {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return
  const navegar = router.navigate.bind(router)
  router.navigate = ((to: unknown, opts?: Record<string, unknown>) =>
    typeof to === 'number' ? navegar(to as never, opts as never) : navegar(to as never, { viewTransition: !reduzirMovimento(), ...opts } as never)) as typeof router.navigate
  let antes = { idx: idxAtual(), caminho: router.state.location.pathname, chave: router.state.location.key }
  router.subscribe((estado) => {
    const loc = estado.location
    if (loc.key === antes.chave) return
    const depois = { idx: idxAtual(), caminho: loc.pathname, chave: loc.key }
    document.documentElement.dataset.direcao = direcaoDaTroca(antes, depois)
    antes = depois
  })
}
