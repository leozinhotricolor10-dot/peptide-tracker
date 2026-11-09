// Toast com Desfazer (N31). Some em 6 s.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { IcoCheck, IcoInfo } from './icones.tsx'
import { mensagemDeErro } from '../dados/repo.ts'

interface ToastDados {
  titulo: string
  texto?: string
  desfazer?: () => void | Promise<void>
  tipo?: 'ok' | 'info'
}

const Ctx = createContext<(t: ToastDados) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [atual, setAtual] = useState<(ToastDados & { id: number }) | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const mostrar = useCallback((t: ToastDados) => {
    window.clearTimeout(timer.current)
    setAtual({ ...t, id: Date.now() })
  }, [])
  useEffect(() => {
    if (!atual) return
    timer.current = window.setTimeout(() => setAtual(null), 6000)
    return () => window.clearTimeout(timer.current)
  }, [atual])
  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[96px] z-50 flex justify-center px-4">
        {atual && (
          <div role="status" key={atual.id} className="aviso-anima pointer-events-auto flex w-full max-w-[448px] items-center gap-3 rounded-xl bg-texto py-2 pr-2 pl-4 text-sobre-acento">
            {atual.tipo === 'info' ? <IcoInfo tam={22} className="text-[#00695C]" /> : <IcoCheck tam={22} className="text-[#0B6B48]" />}
            <span className="flex flex-1 flex-col gap-0.5 py-1">
              <b className="text-[15px]">{atual.titulo}</b>
              {atual.texto && <span className="text-[13px] text-[#3D5663]">{atual.texto}</span>}
            </span>
            {atual.desfazer && (
              <button
                type="button"
                className="h-11 rounded-xl px-3.5 text-[15px] font-extrabold text-[#00695C]"
                onClick={async () => {
                  const f = atual.desfazer
                  setAtual(null)
                  try {
                    await f?.()
                  } catch (e) {
                    mostrar({ tipo: 'info', titulo: 'Não deu para desfazer', texto: mensagemDeErro(e) })
                  }
                }}
              >
                Desfazer
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}
