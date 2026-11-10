// Aviso (toast) do app, um componente só para todos os avisos (N31 e os demais).
// Tema escuro, entra de baixo com mola, barrinha mostra quanto falta para sumir (pausa com o dedo
// em cima), arrastar para o lado dispensa, sai descendo. "festa" = celebração do registro de dose.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react'
import { IcoAlerta, IcoInfo } from './icones.tsx'
import { CheckAnimado } from './celebracao.tsx'
import { mensagemDeErro } from '../dados/repo.ts'
import { criarRelogio, decidirArraste, reduzirMovimento, vibrar, type Relogio } from './movimento.ts'

export interface ToastDados {
  titulo: string
  texto?: string
  desfazer?: () => void | Promise<void>
  tipo?: 'ok' | 'info' | 'erro'
  /** Celebração (check que se desenha + onda). Usado ao registrar dose. */
  festa?: boolean
  duracao?: number
}

export const DURACAO_AVISO_MS = 6000
const SAIDA_MS = 180

const Ctx = createContext<(t: ToastDados) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

type Atual = ToastDados & { id: number }

/** `alto`: telas com a barra de abas embaixo (o aviso fica acima dela); sem abas, fica perto da borda. */
export function ToastProvider({ children, alto = true }: { children: ReactNode; alto?: boolean }) {
  const [atual, setAtual] = useState<Atual | null>(null)
  const [saindo, setSaindo] = useState(false)
  const seq = useRef(0)
  const mostrar = useCallback((t: ToastDados) => {
    seq.current++
    setSaindo(false)
    setAtual({ ...t, id: seq.current })
  }, [])
  /** Some com a animação de saída (ou na hora, com "reduzir movimento"). */
  const fechar = useCallback((id: number, animar = true) => {
    if (!animar || reduzirMovimento()) {
      setAtual((a) => (a?.id === id ? null : a))
      return
    }
    setSaindo(true)
    setTimeout(() => {
      setAtual((a) => (a?.id === id ? null : a))
      setSaindo(false)
    }, SAIDA_MS)
  }, [])
  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div aria-live="polite" className={`vt-avisos pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${alto ? 'bottom-[96px]' : 'bottom-[max(16px,env(safe-area-inset-bottom))]'}`}>
        {atual && <Aviso key={atual.id} t={atual} saindo={saindo} fechar={fechar} mostrar={mostrar} />}
      </div>
    </Ctx.Provider>
  )
}

function Aviso({ t, saindo, fechar, mostrar }: { t: Atual; saindo: boolean; fechar: (id: number, animar?: boolean) => void; mostrar: (t: ToastDados) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const relogio = useRef<Relogio | null>(null)
  const [pausado, setPausado] = useState(false)
  const duracao = t.duracao ?? DURACAO_AVISO_MS
  const arraste = useRef<{ x0: number; dx: number; ativo: boolean; ponteiro: number } | null>(null)

  useEffect(() => {
    const r = criarRelogio(duracao, () => fechar(t.id))
    relogio.current = r
    return () => r.parar()
  }, [duracao, fechar, t.id])

  const pausar = () => {
    relogio.current?.pausar()
    setPausado(true)
  }
  const retomar = () => {
    relogio.current?.retomar()
    setPausado(false)
  }

  const desfazer = async () => {
    const f = t.desfazer
    vibrar(10)
    relogio.current?.parar()
    fechar(t.id)
    try {
      await f?.()
    } catch (e) {
      mostrar({ tipo: 'erro', titulo: 'Não deu para desfazer', texto: mensagemDeErro(e) })
    }
  }

  // Arrastar para o lado dispensa. O arraste só começa depois de 8 px (um toque no Desfazer continua sendo toque).
  const baixo = (e: PE<HTMLDivElement>) => {
    arraste.current = { x0: e.clientX, dx: 0, ativo: false, ponteiro: e.pointerId }
    pausar()
  }
  const mover = (e: PE<HTMLDivElement>) => {
    const a = arraste.current
    const el = ref.current
    if (!a || !el || a.ponteiro !== e.pointerId) return
    a.dx = e.clientX - a.x0
    if (!a.ativo && Math.abs(a.dx) > 8) {
      a.ativo = true
      el.removeAttribute('data-voltando')
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // sem captura: segue arrastando enquanto o dedo estiver em cima
      }
    }
    if (a.ativo) {
      el.style.transform = `translateX(${a.dx}px)`
      el.style.opacity = String(Math.max(0.2, 1 - Math.abs(a.dx) / el.offsetWidth))
    }
  }
  const soltar = () => {
    const a = arraste.current
    const el = ref.current
    arraste.current = null
    if (!a || !el || !a.ativo) return retomar()
    el.setAttribute('data-voltando', '')
    if (decidirArraste(a.dx, el.offsetWidth) === 'dispensar') {
      relogio.current?.parar()
      el.style.transform = `translateX(${Math.sign(a.dx) * el.offsetWidth * 1.1}px)`
      el.style.opacity = '0'
      setTimeout(() => fechar(t.id, false), reduzirMovimento() ? 0 : 200)
    } else {
      el.style.transform = ''
      el.style.opacity = ''
      retomar()
    }
  }

  const icone =
    t.tipo === 'info' ? (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-selecionado text-acento"><IcoInfo tam={20} /></span>
    ) : t.tipo === 'erro' ? (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-aviso-fundo text-aviso"><IcoAlerta tam={20} /></span>
    ) : (
      <CheckAnimado tam={36} festa={t.festa} />
    )

  return (
    <div
      ref={ref}
      role="status"
      data-saindo={saindo || undefined}
      data-pausado={pausado || undefined}
      data-festa={t.festa || undefined}
      onPointerDown={baixo}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{ touchAction: 'pan-y' }}
      className={`aviso-anima pointer-events-auto relative flex w-full max-w-[448px] items-center gap-3 overflow-hidden rounded-2xl border bg-sup2 py-2 pr-2 pl-3 select-none ${t.tipo === 'erro' ? 'border-aviso/60' : t.festa ? 'border-ok/50' : 'border-borda/60'}`}
    >
      {icone}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5">
        <b className="text-[15px] text-texto">{t.titulo}</b>
        {t.texto && <span className="text-[13px] break-words text-fraco">{t.texto}</span>}
      </span>
      {t.desfazer && (
        <button type="button" className="h-11 shrink-0 rounded-xl bg-selecionado px-4 text-[15px] font-extrabold text-acento" onClick={() => void desfazer()}>
          Desfazer
        </button>
      )}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-linha">
        <span className="tempo-anima block h-full w-full bg-acento/80" style={{ animationDuration: `${duracao}ms` }} />
      </span>
    </div>
  )
}
