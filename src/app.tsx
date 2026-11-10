// Casca do app: guarda do aviso 18+, abas, faixas globais (offline, nova versão, espaço cheio).
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useRouteError } from 'react-router'
import { useConfig, useBase, repo } from './dados/index.ts'
import { EVENTO_ARMAZENAMENTO_CHEIO, ehCotaCheia, mensagemDeErro } from './dados/repo.ts'
import { Carregando, Dialogo } from './ui/base.tsx'
import { IcoAlerta, IcoEstoque, IcoHoje, IcoNuvemOff, IcoPeso, IcoProtocolos } from './ui/icones.tsx'
import { ToastProvider, useToast } from './ui/toast.tsx'
import { DoseUIProvider } from './telas/dose.tsx'
import { EVENTO_HORA_DOSE, iniciarAgendador } from './sistema/avisos.ts'
import type { Slot } from './dominio/agenda.ts'
import { nomeSubstancia } from './dominio/nomes.ts'

/** Rotas que funcionam sem aceite do aviso. */
const PUBLICAS = ['/boas-vindas', '/aviso', '/saida', '/restaurar', '/privacidade', '/termos']
const ABAS = ['/hoje', '/protocolos', '/peso', '/estoque']

export interface AtualizacaoSW {
  disponivel: boolean
  atualizar: () => void
}
let atualizacao: AtualizacaoSW = { disponivel: false, atualizar: () => {} }
const ouvintesSW = new Set<() => void>()
export function avisarNovaVersao(atualizar: () => void) {
  atualizacao = { disponivel: true, atualizar }
  ouvintesSW.forEach((f) => f())
}

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return on
}

function Faixas() {
  const online = useOnline()
  const [sw, setSw] = useState(atualizacao)
  const [depois, setDepois] = useState(false)
  useEffect(() => {
    const f = () => setSw({ ...atualizacao })
    ouvintesSW.add(f)
    return () => void ouvintesSW.delete(f)
  }, [])
  return (
    <>
      {!online && (
        <div role="status" className="sticky top-0 z-30 flex items-center gap-2.5 bg-sup2 px-4 py-2.5 pt-[max(10px,env(safe-area-inset-top))] text-sm">
          <IcoNuvemOff tam={20} className="shrink-0 text-fraco" />
          <span><b>Sem internet.</b> Tudo continua funcionando e salvo no aparelho.</span>
        </div>
      )}
      {sw.disponivel && !depois && (
        <div role="status" className="fixed inset-x-0 bottom-[96px] z-40 flex justify-center px-4">
          <div className="flex w-full max-w-[448px] items-center gap-2 rounded-xl border border-linha bg-sup p-2 pl-4">
            <span className="flex flex-1 flex-col"><b className="text-[15px]">Nova versão disponível</b><span className="text-[13px] text-fraco">Seus dados não mudam.</span></span>
            <button type="button" className="btn-texto text-suave" onClick={() => setDepois(true)}>Depois</button>
            <button type="button" className="h-11 rounded-[10px] bg-acento px-4 font-bold text-sobre-acento" onClick={sw.atualizar}>Atualizar</button>
          </div>
        </div>
      )}
    </>
  )
}

function EspacoCheio() {
  const [aberto, setAberto] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    const f = () => setAberto(true)
    window.addEventListener(EVENTO_ARMAZENAMENTO_CHEIO, f)
    return () => window.removeEventListener(EVENTO_ARMAZENAMENTO_CHEIO, f)
  }, [])
  if (!aberto) return null
  return (
    <Dialogo titulo="Não deu para salvar" aoFechar={() => setAberto(false)} icone={<IcoAlerta className="text-aviso" tam={28} />}>
      <p className="m-0 text-[15px] text-suave">O espaço do app neste aparelho acabou. Nada do que já estava salvo foi perdido.</p>
      <p className="m-0 text-[15px] text-suave">As fotos são o que mais ocupa. Faça um backup e depois apague fotos antigas, ou libere espaço no aparelho.</p>
      <button type="button" className="btn-primario" onClick={() => { setAberto(false); nav('/ajustes/backup') }}>Fazer backup</button>
      <button type="button" className="btn-secundario" onClick={() => { setAberto(false); nav('/peso/fotos') }}>Ver fotos</button>
    </Dialogo>
  )
}

/** Aviso dentro do app quando chega a hora de uma dose (canal "dentro do app"). */
function AvisoNoApp() {
  const toast = useToast()
  const base = useBase()
  useEffect(() => {
    const f = (e: Event) => {
      const s = (e as CustomEvent<Slot>).detail
      if (document.visibilityState === 'visible' && base) toast({ tipo: 'info', titulo: 'Hora do seu registro', texto: `${nomeSubstancia(s.substanciaId, base.subs)} · ${s.horario}` })
    }
    window.addEventListener(EVENTO_HORA_DOSE, f)
    return () => window.removeEventListener(EVENTO_HORA_DOSE, f)
  }, [toast, base])
  return null
}

function Abas() {
  const itens = [
    { to: '/hoje', t: 'Hoje', I: IcoHoje },
    { to: '/protocolos', t: 'Protocolos', I: IcoProtocolos },
    { to: '/peso', t: 'Peso', I: IcoPeso },
    { to: '/estoque', t: 'Estoque', I: IcoEstoque },
  ]
  const { pathname } = useLocation()
  const ativa = Math.max(0, itens.findIndex((x) => x.to === pathname))
  return (
    <nav aria-label="Navegação principal" className="vt-abas fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-sup">
      <div className="relative mx-auto grid max-w-[480px] grid-cols-4 gap-1 px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {/* fundo da aba escolhida: um só, desliza de uma aba para a outra (só transform) */}
        <span
          aria-hidden="true"
          className="aba-indicador absolute top-2 left-3 h-[52px] rounded-[10px] bg-selecionado"
          style={{ width: 'calc((100% - 1.5rem - 0.75rem) / 4)', transform: `translateX(calc(${ativa} * (100% + 0.25rem)))` }}
        />
        {itens.map(({ to, t, I }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[10px] ${isActive ? 'text-acento' : 'text-fraco'}`}>
            {({ isActive }) => (
              <>
                <I tam={24} />
                <span className={`text-[11px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{t}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function Raiz() {
  const aceite = useConfig('aceite')
  const loc = useLocation()
  useEffect(() => {
    if (aceite.valor) {
      void repo.normalizarPausas()
      iniciarAgendador()
    }
  }, [aceite.valor])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])
  if (!aceite.carregado) return <Carregando />
  const publica = PUBLICAS.some((p) => loc.pathname.startsWith(p))
  if (!aceite.valor && !publica) return <Navigate to="/boas-vindas" replace />
  const comAbas = ABAS.includes(loc.pathname)
  return (
    <ToastProvider alto={comAbas}>
      <DoseUIProvider>
        <Faixas />
        <main className={comAbas ? 'pb-[96px]' : ''}>
          <Outlet />
        </main>
        {comAbas && <Abas />}
        <EspacoCheio />
        <AvisoNoApp />
        <FalhaSilenciosa />
      </DoseUIProvider>
    </ToastProvider>
  )
}

/** '/' decide para onde ir. */
export function Inicio() {
  const aceite = useConfig('aceite')
  const onb = useConfig('onboarding')
  if (!aceite.carregado || !onb.carregado) return <Carregando />
  if (!aceite.valor) return <Navigate to="/boas-vindas" replace />
  if (!onb.valor) return <Navigate to="/instalar?primeiro=1" replace />
  return <Navigate to="/hoje" replace />
}

/** Tela de erro (no lugar de uma tela branca) quando algo quebra, ex.: armazenamento do navegador bloqueado. */
export function ErroGeral(): ReactNode {
  const erro = useRouteError()
  const banco = erro instanceof Error && /IndexedDB|Database|Dexie|MissingAPI|InvalidState|Open/i.test(`${erro.name} ${erro.message}`)
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-5 text-center">
      <h1 className="text-2xl font-extrabold">Algo deu errado</h1>
      <p className="m-0 text-[15px] leading-relaxed text-suave">
        {banco
          ? 'O navegador não deixou o app abrir o armazenamento deste aparelho. Isso acontece em janela anônima ou com dados do site bloqueados. Abra numa janela normal.'
          : 'Seus dados continuam salvos neste aparelho. Recarregue o app para continuar.'}
      </p>
      <button type="button" className="btn-primario" onClick={() => window.location.reload()}>Recarregar</button>
      <a href="#/hoje" className="btn-texto" onClick={() => setTimeout(() => window.location.reload(), 0)}>Ir para Hoje</a>
    </div>
  )
}

/** Falha inesperada fora da tela (ex.: ao salvar): avisa em vez de falhar calado. */
function FalhaSilenciosa() {
  const toast = useToast()
  useEffect(() => {
    const f = (e: PromiseRejectionEvent) => {
      if (ehCotaCheia(e.reason)) return // já tratado por EspacoCheio
      toast({ tipo: 'info', titulo: 'Algo não deu certo', texto: mensagemDeErro(e.reason) })
    }
    window.addEventListener('unhandledrejection', f)
    return () => window.removeEventListener('unhandledrejection', f)
  }, [toast])
  return null
}

export function NaoEncontrada(): ReactNode {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
      <Link to="/hoje" className="btn-primario">Ir para Hoje</Link>
    </div>
  )
}
