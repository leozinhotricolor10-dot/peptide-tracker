// Voltar com saída garantida: se a tela foi aberta direto (link, F5 numa aba nova, atalho),
// não há tela anterior do app e o "voltar" do navegador não faria nada. Aí vai para `alternativa`.
import { useCallback } from 'react'
import { useNavigate } from 'react-router'

/** O roteador guarda em history.state.idx a posição dentro do app (0 = primeira tela aberta). */
export function temTelaAnterior(estadoHistorico: unknown): boolean {
  const idx = (estadoHistorico as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' && idx > 0
}

export function useVoltar(): (alternativa: string) => void {
  const nav = useNavigate()
  return useCallback(
    (alternativa: string) => {
      if (temTelaAnterior(typeof window !== 'undefined' ? window.history.state : null)) nav(-1)
      else nav(alternativa, { replace: true })
    },
    [nav],
  )
}
