// Micro-celebração: círculo que "estala", check que se desenha e uma onda que se expande uma vez.
// Só transform/opacity e stroke-dashoffset num SVG pequeno. Com "reduzir movimento", aparece pronto.
import type { ReactNode } from 'react'
import { useNumeroAnimado } from './movimento.ts'

/** Número que rola do valor antigo ao novo quando muda (saldo, contadores, peso). */
export function NumeroAnimado({ valor, formatar = (v) => String(Math.round(v)) }: { valor: number; formatar?: (v: number) => string }) {
  const v = useNumeroAnimado(valor)
  return <span className="tabular-nums">{formatar(v)}</span>
}

/** Check desenhado dentro de um círculo. `festa` acrescenta a onda (registrar dose, tudo feito). */
export function CheckAnimado({
  tam = 32,
  festa = false,
  animar = true,
  grande = false,
  className = 'bg-ok-fundo text-ok',
}: {
  tam?: number
  festa?: boolean
  animar?: boolean
  grande?: boolean
  className?: string
}) {
  const icone = Math.round(tam * 0.56)
  return (
    <span
      data-celebracao={animar && festa ? '' : undefined}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${animar ? 'check-estala' : ''} ${className}`}
      style={{ width: tam, height: tam }}
      aria-hidden="true"
    >
      {animar && festa && (
        <>
          <span className="onda absolute inset-0 rounded-full border-2 border-current" />
          {grande && <span className="onda onda-2 absolute inset-0 rounded-full border-2 border-current" />}
        </>
      )}
      <svg width={icone} height={icone} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grande ? 2.4 : 2.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className={animar ? 'traco-desenha' : ''} />
      </svg>
    </span>
  )
}

/** Cartão "Tudo feito hoje" (Hoje), com a celebração um pouco maior quando acabou de acontecer. */
export function TudoFeito({ total, animar, children }: { total: number; animar: boolean; children?: ReactNode }) {
  return (
    <div role="status" className={`card relative flex items-center gap-4 overflow-hidden border-ok/40 bg-ok-fundo p-5 ${animar ? 'tudo-feito-entra' : ''}`}>
      <CheckAnimado tam={56} festa grande animar={animar} className="bg-ok text-sobre-acento" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[22px] leading-tight font-extrabold text-texto">Tudo feito hoje</span>
        <span className="text-[15px] font-semibold text-ok">
          {total === 1 ? 'A dose de hoje está registrada' : `As ${total} doses de hoje estão registradas`}
        </span>
        {children}
      </span>
    </div>
  )
}
