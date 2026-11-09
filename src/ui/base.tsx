// Peças visuais reaproveitadas pelas telas.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import { IcoCheck, IcoFechar, IcoVoltar, IcoX } from './icones.tsx'
import { useVoltar } from './navegar.ts'

/** Coluna central de celular (390px de referência; não quebra em telas maiores). */
export function Tela({ children, className = '', semPadding = false }: { children: ReactNode; className?: string; semPadding?: boolean }) {
  return (
    <div className={`mx-auto flex w-full max-w-[480px] flex-col ${semPadding ? '' : 'gap-5 px-5 pb-8 pt-[max(24px,env(safe-area-inset-top))]'} ${className}`}>
      {children}
    </div>
  )
}

/** Cabeçalho com voltar (ou fechar), título e ação à direita. */
export function Cabecalho({
  titulo,
  sub,
  voltar,
  fechar,
  direita,
  grande = false,
}: {
  titulo: ReactNode
  sub?: ReactNode
  voltar?: string | (() => void) | true
  fechar?: string | (() => void)
  direita?: ReactNode
  grande?: boolean
}) {
  const nav = useNavigate()
  const voltarOu = useVoltar()
  const acao = voltar ?? fechar
  const clicar = () => {
    if (typeof acao === 'function') acao()
    else if (typeof acao === 'string') nav(acao)
    else voltarOu('/hoje')
  }
  return (
    <div className="flex items-center gap-1">
      {acao !== undefined && (
        <button type="button" onClick={clicar} aria-label={fechar ? 'Cancelar' : 'Voltar'} className="icone-btn -ml-2.5">
          {fechar ? <IcoFechar /> : <IcoVoltar />}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {sub && <span className="text-[13px] font-semibold text-fraco">{sub}</span>}
        <h1 className={`${grande ? 'text-[32px] leading-tight' : 'text-2xl'} font-extrabold tracking-tight break-words`}>{titulo}</h1>
      </div>
      {direita}
    </div>
  )
}

export function Passo({ n, total = 4 }: { n: number; total?: number }) {
  return <span className="text-[13px] font-bold tracking-wide text-acento uppercase">Passo {n} de {total}</span>
}

/** Fundo escurecido + painel. Fecha com Esc e ao tocar fora. */
function Camada({ aoFechar, children, alinhar }: { aoFechar?: () => void; children: ReactNode; alinhar: 'baixo' | 'centro' }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar?.()
    window.addEventListener('keydown', tecla)
    const ov = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = ov
    }
  }, [aoFechar])
  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex justify-center bg-veu/85 ${alinhar === 'baixo' ? 'items-end' : 'items-center px-4'}`}
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar?.()}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Bottom sheet (M..). */
export function Sheet({ titulo, sub, aoFechar, children }: { titulo: ReactNode; sub?: ReactNode; aoFechar?: () => void; children: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <Camada aoFechar={aoFechar} alinhar="baixo">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-sup px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))] outline-none"
      >
        <span aria-hidden="true" className="h-[5px] w-10 self-center rounded-full bg-borda" />
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={id} className="text-[22px] font-extrabold">{titulo}</h2>
            {sub && <span className="text-[15px] font-semibold text-fraco">{sub}</span>}
          </div>
          {aoFechar && (
            <button type="button" onClick={aoFechar} aria-label="Fechar" className="icone-btn -mr-2.5">
              <IcoFechar tam={22} />
            </button>
          )}
        </div>
        {children}
      </div>
    </Camada>
  )
}

/** Diálogo de confirmação (alertdialog). */
export function Dialogo({ titulo, aoFechar, children, icone }: { titulo: ReactNode; aoFechar?: () => void; children: ReactNode; icone?: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <Camada aoFechar={aoFechar} alinhar="centro">
      <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={id} className="flex max-h-[90dvh] w-full max-w-[420px] flex-col gap-4 overflow-y-auto rounded-2xl border border-linha bg-sup px-6 pt-7 pb-6 outline-none">
        {icone}
        <h2 id={id} className="text-[22px] font-extrabold">{titulo}</h2>
        {children}
      </div>
    </Camada>
  )
}

export function Vazio({ titulo, texto, children, icone }: { titulo: string; texto: ReactNode; children?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-2 py-10 text-center">
      {icone && <span className="flex h-16 w-16 items-center justify-center rounded-full bg-selecionado text-acento">{icone}</span>}
      <h2 className="text-[22px] font-extrabold">{titulo}</h2>
      <p className="m-0 text-[15px] leading-relaxed text-suave">{texto}</p>
      {children}
    </div>
  )
}

/** Link para um item que não existe mais (apagado, ou endereço digitado errado). */
export function NaoAchou({ titulo, texto = 'Ele pode ter sido apagado.', para = '/hoje', rotulo = 'Ir para Hoje' }: { titulo: string; texto?: string; para?: string; rotulo?: string }) {
  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo={titulo} voltar />
      <p className="m-0 text-[15px] leading-relaxed text-suave">{texto}</p>
      <Link to={para} className="btn-primario">{rotulo}</Link>
    </Tela>
  )
}

/** Depois disso, "Carregando…" vira uma mensagem com saída (nunca fica girando para sempre). */
export const TETO_CARREGANDO_MS = 8000

export function Carregando() {
  const [demorou, setDemorou] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), TETO_CARREGANDO_MS)
    return () => clearTimeout(t)
  }, [])
  if (demorou) {
    return (
      <div role="alert" className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 px-2 text-center">
        <b className="text-lg">Está demorando mais que o normal</b>
        <p className="m-0 text-[15px] text-suave">Seus dados continuam salvos neste aparelho.</p>
        <button type="button" className="btn-primario" onClick={() => window.location.reload()}>Recarregar</button>
        <a href="#/hoje" className="btn-texto">Ir para Hoje</a>
      </div>
    )
  }
  return (
    <div role="status" className="flex min-h-[40dvh] items-center justify-center text-fraco">
      Carregando…
    </div>
  )
}

/** Status sempre com ícone + texto (nunca só cor). */
export function StatusTomada({ status }: { status: 'feita' | 'pulada' }) {
  return status === 'feita' ? (
    <span className="inline-flex items-center gap-1 font-bold text-ok"><IcoCheck tam={14} /> Tomada</span>
  ) : (
    <span className="inline-flex items-center gap-1 font-bold text-erro"><IcoX tam={14} /> Perdida (não feita)</span>
  )
}

export function Nota({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'aviso' }) {
  return (
    <p className={`m-0 rounded-xl px-4 py-3 text-sm leading-relaxed ${tipo === 'aviso' ? 'bg-aviso-fundo font-semibold text-aviso-texto' : 'bg-sup2 text-suave'}`}>
      {children}
    </p>
  )
}

/** Grupo de chips de escolha única. */
export function Chips<T extends string | number>({ opcoes, valor, aoMudar, rotulo }: { opcoes: { v: T; t: string }[]; valor: T | undefined; aoMudar: (v: T) => void; rotulo?: string }) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button key={String(o.v)} type="button" className="chip" aria-pressed={valor === o.v} onClick={() => aoMudar(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

export function Linha({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-[52px] items-center gap-3 border-t border-sup2 px-4 first:border-t-0 ${className}`}>{children}</div>
}

export function Secao({ titulo, children, direita }: { titulo: string; children: ReactNode; direita?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">{titulo}</h2>
        {direita}
      </div>
      {children}
    </section>
  )
}
