// Ações que gravam: nenhum botão "morto". Enquanto grava, o botão mostra que está trabalhando e
// não aceita toque duplo; se falhar (ou demorar demais), aparece o motivo em pt-BR logo abaixo.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { mensagemDeErro } from '../dados/repo.ts'

/** Roda uma ação assíncrona com estado de "ocupado" e erro visível. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const rodando = useRef(false)
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])
  const rodar = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (rodando.current) return false
    rodando.current = true
    setOcupado(true)
    setErro('')
    try {
      await fn()
      return true
    } catch (e) {
      if (montado.current) setErro(mensagemDeErro(e))
      return false
    } finally {
      rodando.current = false
      if (montado.current) setOcupado(false)
    }
  }, [])
  return { ocupado, erro, rodar, limparErro: () => setErro('') }
}

/** Botão que grava. `acao` pode lançar erro: ele vira mensagem embaixo do botão. */
export function BotaoAcao({
  acao,
  className,
  children,
  ocupadoTexto,
  disabled,
}: {
  acao: () => Promise<unknown>
  className: string
  children: ReactNode
  ocupadoTexto?: string
  disabled?: boolean
}) {
  const { ocupado, erro, rodar } = useAcao()
  return (
    <>
      <button type="button" className={className} disabled={disabled || ocupado} aria-busy={ocupado} onClick={() => void rodar(acao)}>
        {ocupado && ocupadoTexto ? ocupadoTexto : children}
      </button>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
    </>
  )
}
