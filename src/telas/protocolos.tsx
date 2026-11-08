// T20 Protocolos (+E20), T25/T27 detalhe, M21 ações, M22 pausar, M23 encerrar, T31 histórico.
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { repo, useBase, type Base } from '../dados/index.ts'
import { estadoEfetivo, frequenciaCurta, descreverFrequencia, progresso, proximosSlots, resumoDoDia, slotsDoDia, statusSlot, terminouEm } from '../dominio/agenda.ts'
import { dataBr, dataCurta, dataDiaMes, diaDe, difDias, diaRelativo, hojeStr, horaDe, nomeMes, somaDias, dataMedia } from '../dominio/datas.ts'
import { fmtDose } from '../dominio/calculos.ts'
import { nomeProtocolo, nomeSubstancia } from '../dominio/nomes.ts'
import type { EstadoProtocolo, Protocolo } from '../dominio/tipos.ts'
import { Carregando, Dialogo, NaoAchou, Nota, Sheet, StatusTomada, Tela, Vazio } from '../ui/base.tsx'
import { IcoCopiar, IcoEditar, IcoMais, IcoPausa, IcoPlay, IcoParar, IcoPontos, IcoProtocolos, IcoVoltar, IcoSeta, IcoBaixo, IcoLixo } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'
import { useDoseUI } from './dose.tsx'

const ROTULO_ESTADO: Record<EstadoProtocolo, string> = { ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Concluído' }

function SeloEstado({ estado }: { estado: EstadoProtocolo }) {
  const cls = estado === 'ativo' ? 'bg-ok-fundo text-ok' : estado === 'pausado' ? 'bg-aviso-fundo text-aviso' : 'bg-sup2 text-fraco'
  const Ico = estado === 'ativo' ? IcoPlay : estado === 'pausado' ? IcoPausa : IcoParar
  return <span className={`selo shrink-0 ${cls}`}><Ico tam={12} /> {ROTULO_ESTADO[estado]}</span>
}

function linhasDe(base: Base, p: Protocolo) {
  return base.itens.filter((i) => i.protocoloId === p.id)
}

export function Protocolos() {
  const base = useBase()
  const [aba, setAba] = useState<EstadoProtocolo>('ativo')
  const hoje = hojeStr()
  const cabecalho = (
    <div className="flex items-center justify-between">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Protocolos</h1>
      <Link to="/novo" className="flex h-11 items-center gap-1.5 rounded-[10px] bg-acento px-4 text-[15px] font-bold text-sobre-acento"><IcoMais tam={20} /> Novo</Link>
    </div>
  )
  if (!base) return <Tela>{cabecalho}<Carregando /></Tela>
  if (!base.protocolos.length) {
    return (
      <Tela>
        <h1 className="text-[32px] font-extrabold">Protocolos</h1>
        <Vazio icone={<IcoProtocolos tam={30} />} titulo="Nenhum protocolo ainda" texto="Um protocolo aqui é o registro do que você já decidiu usar: substância, dose, horários e por quanto tempo.">
          <Link to="/novo" className="btn-primario">Criar protocolo</Link>
        </Vazio>
      </Tela>
    )
  }
  const porEstado = (e: EstadoProtocolo) =>
    base.protocolos.filter((p) => estadoEfetivo(p, hoje) === e).sort((a, b) => b.inicio.localeCompare(a.inicio))
  const lista = porEstado(aba)
  return (
    <Tela>
      {cabecalho}
      <div role="tablist" aria-label="Estado" className="grid grid-cols-3 gap-1 rounded-xl bg-sup p-1">
        {(['ativo', 'pausado', 'encerrado'] as const).map((e) => (
          <button key={e} type="button" role="tab" aria-selected={aba === e} onClick={() => setAba(e)} className={`h-11 rounded-[10px] text-sm font-bold ${aba === e ? 'bg-selecionado text-acento' : 'text-fraco'}`}>
            {e === 'ativo' ? 'Ativos' : e === 'pausado' ? 'Pausados' : 'Concluídos'}
            {porEstado(e).length > 0 && ` (${porEstado(e).length})`}
          </button>
        ))}
      </div>
      {lista.length === 0 && <p className="m-0 card p-4 text-[15px] text-suave">Nenhum protocolo {aba === 'ativo' ? 'ativo' : aba === 'pausado' ? 'pausado' : 'concluído'}.</p>}
      {lista.map((p) => {
        const itens = linhasDe(base, p)
        const pr = progresso(p, hoje)
        const total = p.fim ? difDias(p.inicio, p.fim) + 1 : 0
        const feito = total ? Math.min(1, Math.max(0, (difDias(p.inicio, hoje) + 1) / total)) : 0
        return (
          <Link key={p.id} to={`/protocolos/${p.id}`} className="card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[19px] font-extrabold tracking-tight break-words">{nomeProtocolo(p, base.itens, base.subs)}</span>
                <span className="text-[13px] text-fraco">{pr.texto} · iniciado em {dataDiaMes(p.inicio)}</span>
              </div>
              <SeloEstado estado={estadoEfetivo(p, hoje)} />
            </div>
            {total > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-sup2" role="progressbar" aria-label="Andamento do protocolo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(feito * 100)}>
                <div className="h-full rounded-full bg-acento" style={{ width: `${feito * 100}%` }} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 border-t border-sup2 pt-3">
              {itens.map((i) => (
                <span key={i.id} className="flex flex-wrap justify-between gap-x-3 text-[15px]">
                  <b className="break-words">{nomeSubstancia(i.substanciaId, base.subs)}</b>
                  <span className="text-suave">{fmtDose(i.doseValor, i.doseUnidade)} · {frequenciaCurta(i.frequencia, i.horarios)}</span>
                </span>
              ))}
            </div>
            {estadoEfetivo(p, hoje) === 'pausado' && <span className="text-[13px] font-semibold text-aviso">{p.pausadoAte ? `Pausado até ${dataCurta(p.pausadoAte)}` : 'Pausado sem data de volta'}</span>}
            {pr.pausaDeCiclo && estadoEfetivo(p, hoje) === 'ativo' && (
              <span className="rounded-lg bg-sup2 px-3 py-2 text-[13px] font-semibold text-suave">Pausa de ciclo · próximo ciclo começa em {pr.diasAteVoltar} dia{pr.diasAteVoltar === 1 ? '' : 's'}</span>
            )}
          </Link>
        )
      })}
    </Tela>
  )
}

export function DetalheProtocolo() {
  const { id } = useParams()
  const base = useBase()
  const nav = useNavigate()
  const abrir = useDoseUI()
  const toast = useToast()
  const [acao, setAcao] = useState<null | 'menu' | 'pausar' | 'encerrar' | 'apagar'>(null)
  if (!base) return <Tela><Carregando /></Tela>
  const p = base.protocolos.find((x) => x.id === id)
  if (!p) return <NaoAchou titulo="Protocolo não encontrado" para="/protocolos" rotulo="Ver protocolos" />
  const hoje = hojeStr()
  const agora = new Date()
  const itens = linhasDe(base, p)
  const nome = nomeProtocolo(p, base.itens, base.subs)
  const estado = estadoEfetivo(p, hoje)
  const pr = progresso(p, hoje)
  const proximas = proximosSlots([p], itens, agora, 4)
  const registros = base.aplicacoes.filter((a) => a.protocoloId === p.id).sort((a, b) => b.dataHora.localeCompare(a.dataHora))
  const blends = itens.filter((i) => base.subs.get(i.substanciaId)?.tipo === 'blend')

  const registrarAgora = () => {
    const doDia = slotsDoDia([p], itens, hoje).map((s) => ({ s, st: statusSlot(s, base.aplicacoes, agora) }))
    const alvo = doDia.find((x) => x.st === 'atrasada') ?? doDia.find((x) => x.st === 'pendente')
    if (alvo) abrir({ tipo: 'registrar', itemId: alvo.s.itemId, slot: alvo.s })
    else if (itens[0]) abrir({ tipo: 'registrar', itemId: itens[0].id })
  }

  return (
    <Tela className="min-h-dvh">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="icone-btn -ml-2.5"><IcoVoltar /></button>
        <button type="button" onClick={() => setAcao('menu')} aria-label="Mais ações" className="icone-btn -mr-2.5"><IcoPontos tam={22} /></button>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight break-words">{nome}</h1>
          <SeloEstado estado={estado} />
        </div>
        <span className="text-sm text-fraco">Iniciado em {dataBr(p.inicio)}{p.fim ? ` · até ${dataBr(p.fim)}` : ' · sem data de fim'}</span>
      </div>

      {estado === 'pausado' && (
        <Nota tipo="aviso">{p.pausadoAte ? `Pausado até ${dataBr(p.pausadoAte)}. ` : 'Pausado sem data de volta. '}Os lembretes param durante a pausa; o histórico fica como está.</Nota>
      )}
      {estado === 'encerrado' && (
        <Nota>
          {p.estado === 'encerrado' ? 'Encerrado' : 'Terminou'} em {terminouEm(p, hoje) ? dataBr(terminouEm(p, hoje)!) : '—'}. O histórico continua salvo. Dá para duplicar para um novo ciclo
          {p.estado !== 'encerrado' ? ' ou editar a duração para continuar' : ''}.
        </Nota>
      )}

      <div className="card flex flex-col">
        {itens.map((i) => {
          const s = base.subs.get(i.substanciaId)
          return (
            <div key={i.id} className="flex flex-col gap-1 border-t border-sup2 px-4 py-3 first:border-t-0">
              <span className="flex flex-wrap items-center gap-2 text-base font-bold">
                {s?.nome ?? 'Substância'}
                {s?.tipo === 'blend' && <span className="selo border border-borda text-suave">Blend</span>}
              </span>
              <span className="text-sm text-suave">{fmtDose(i.doseValor, i.doseUnidade)} · {descreverFrequencia(i.frequencia, i.horarios)}</span>
            </div>
          )
        })}
      </div>
      {blends.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[13px] leading-relaxed text-fraco">A dose é registrada para o blend inteiro, pelo nome que você deu. O app não divide por componente.</p>
          {blends.map((b) => {
            const frasco = base.frascos.find((f) => f.substanciaId === b.substanciaId && f.status !== 'descartado' && f.status !== 'acabou')
            return (
              <div key={b.id} className="flex flex-wrap gap-x-4">
                <Link className="link" to={`/novo/blend?id=${b.substanciaId}`}>Ver ou editar o cadastro do blend</Link>
                {frasco && <Link className="link" to={`/estoque/frasco/${frasco.id}/reconstituir`}>Ver frasco e reconstituição</Link>}
              </div>
            )
          })}
        </div>
      )}

      <div className="card flex items-center justify-between px-4 py-3">
        <span className="text-[15px] font-bold">{pr.texto}</span>
        <span className="text-sm text-fraco">{p.ciclo ? `Ciclo ${p.ciclo.diasOn} sim / ${p.ciclo.diasOff} não${pr.pausaDeCiclo ? ' · em pausa' : ''}` : 'Sem ciclo'}</span>
      </div>

      {estado !== 'encerrado' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[17px] font-bold">Próximas doses</h2>
          {proximas.length === 0 && <p className="m-0 text-sm text-fraco">{estado === 'pausado' ? 'Nenhuma enquanto estiver pausado.' : 'Nenhuma dose prevista.'}</p>}
          {proximas.map((s) => (
            <div key={s.chave + s.itemId} className="flex min-h-11 items-center justify-between border-b border-sup2 text-[15px]">
              <span>{diaRelativo(s.dia, hoje)} · <b>{nomeSubstancia(s.substanciaId, base.subs)}</b></span>
              <span className="font-bold">{s.horario}</span>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">Últimos registros</h2>
          <Link className="link" to={`/historico?p=${p.id}`}>Ver histórico</Link>
        </div>
        {registros.length === 0 && <p className="m-0 text-sm text-fraco">Nenhum registro ainda.</p>}
        {registros.slice(0, 3).map((a) => {
          const d = new Date(a.dataHora)
          return (
            <button key={a.id} type="button" onClick={() => abrir({ tipo: 'opcoes', aplicacaoId: a.id })} className="flex min-h-11 items-center justify-between gap-2 border-b border-sup2 text-left text-[15px]">
              <span>{diaRelativo(diaDe(d), hoje)} {horaDe(d)} · {nomeSubstancia(a.substanciaId, base.subs)}</span>
              <span className="text-sm"><StatusTomada status={a.status} /></span>
            </button>
          )
        })}
      </section>

      {estado !== 'encerrado' && <button type="button" className="btn-primario mt-auto" onClick={registrarAgora}>Registrar dose agora</button>}

      {acao === 'menu' && (
        <Sheet titulo={nome} aoFechar={() => setAcao(null)}>
          <div className="flex flex-col">
            {p.estado !== 'encerrado' && (
              <button type="button" className="flex min-h-14 items-center gap-3.5 rounded-[10px] px-3 text-base font-bold" onClick={() => nav(`/protocolos/${p.id}/editar`)}>
                <IcoEditar /> Editar
              </button>
            )}
            {estado === 'ativo' && (
              <button type="button" className="flex min-h-14 items-center gap-3.5 rounded-[10px] px-3 text-base font-bold" onClick={() => setAcao('pausar')}>
                <IcoPausa /> Pausar
              </button>
            )}
            {estado === 'pausado' && (
              <button
                type="button"
                className="flex min-h-14 items-center gap-3.5 rounded-[10px] px-3 text-base font-bold"
                onClick={async () => {
                  await repo.retomarProtocolo(p.id)
                  setAcao(null)
                  toast({ titulo: 'Protocolo retomado', texto: nome })
                }}
              >
                <IcoPlay /> Retomar
              </button>
            )}
            <button type="button" className="flex min-h-14 items-center gap-3.5 rounded-[10px] px-3 text-base font-bold" onClick={() => nav(`/protocolos/${p.id}/duplicar`)}>
              <IcoCopiar /> Duplicar para novo ciclo
            </button>
            {estado !== 'encerrado' && (
              <button type="button" className="flex min-h-14 items-center gap-3.5 rounded-[10px] px-3 text-base font-bold text-erro" onClick={() => setAcao('encerrar')}>
                <IcoParar /> Encerrar protocolo
              </button>
            )}
            <button type="button" className="flex min-h-14 items-center gap-3.5 rounded-[10px] px-3 text-base font-bold text-erro" onClick={() => setAcao('apagar')}>
              <IcoLixo /> Apagar protocolo
            </button>
          </div>
          <button type="button" className="btn-neutro" onClick={() => setAcao(null)}>Cancelar</button>
        </Sheet>
      )}
      {acao === 'pausar' && <Pausar protocolo={p} nome={nome} fechar={() => setAcao(null)} />}
      {acao === 'encerrar' && (
        <Dialogo titulo={`Encerrar ${nome}?`} aoFechar={() => setAcao(null)}>
          <ul className="m-0 flex flex-col gap-2 pl-5 text-[15px] leading-relaxed text-suave">
            <li>Os lembretes deste protocolo param.</li>
            <li>O histórico continua salvo em Concluídos.</li>
            <li>Dá para duplicar depois para um novo ciclo.</li>
          </ul>
          <button
            type="button"
            className="btn-perigo"
            onClick={async () => {
              await repo.encerrarProtocolo(p.id)
              setAcao(null)
              toast({ tipo: 'info', titulo: 'Protocolo encerrado', texto: nome })
              nav('/protocolos')
            }}
          >
            Encerrar
          </button>
          <button type="button" className="btn-neutro" onClick={() => setAcao(null)}>Manter ativo</button>
        </Dialogo>
      )}
      {acao === 'apagar' && (
        <Dialogo titulo={`Apagar ${nome}?`} aoFechar={() => setAcao(null)}>
          <p className="m-0 text-[15px] leading-relaxed text-suave">
            Apaga o protocolo e {registros.length === 1 ? '1 registro de dose' : `${registros.length} registros de dose`} dele, sem volta. Frascos e substâncias continuam no app.
          </p>
          {registros.length > 0 && <p className="m-0 text-sm text-fraco">Para guardar o histórico, prefira “Encerrar protocolo”.</p>}
          <button
            type="button"
            className="btn-perigo"
            onClick={async () => {
              await repo.apagarProtocolo(p.id)
              toast({ tipo: 'info', titulo: 'Protocolo apagado', texto: nome })
              nav('/protocolos', { replace: true })
            }}
          >
            Apagar
          </button>
          <button type="button" className="btn-neutro" onClick={() => setAcao(null)}>Cancelar</button>
        </Dialogo>
      )}
    </Tela>
  )
}

function Pausar({ protocolo, nome, fechar }: { protocolo: Protocolo; nome: string; fechar: () => void }) {
  const toast = useToast()
  const [comData, setComData] = useState(true)
  const [ate, setAte] = useState(somaDias(hojeStr(), 14))
  const [erro, setErro] = useState('')
  return (
    <Dialogo titulo={`Pausar ${nome}?`} aoFechar={fechar}>
      <p className="m-0 text-[15px] text-suave">Os lembretes param durante a pausa. O histórico fica como está.</p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-fraco">Voltar quando?</legend>
        <label className="card flex min-h-[52px] items-center gap-3 px-4 text-[15px] font-semibold">
          <input type="radio" name="pausa" className="h-5 w-5" checked={comData} onChange={() => setComData(true)} />
          Em uma data
          {comData && <input type="date" aria-label="Data de volta" className="campo ml-auto h-11 w-auto px-2 text-sm" value={ate} min={somaDias(hojeStr(), 1)} onChange={(e) => { setAte(e.target.value); setErro('') }} />}
        </label>
        <label className="card flex min-h-[52px] items-center gap-3 px-4 text-[15px] font-semibold">
          <input type="radio" name="pausa" className="h-5 w-5" checked={!comData} onChange={() => setComData(false)} />
          Sem data, eu retomo
        </label>
      </fieldset>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      <button
        type="button"
        className="btn-primario"
        onClick={async () => {
          if (comData && (!ate || ate <= hojeStr())) return setErro('Escolha uma data a partir de amanhã.')
          await repo.pausarProtocolo(protocolo.id, comData ? ate : undefined)
          fechar()
          toast({ tipo: 'info', titulo: 'Protocolo pausado', texto: comData ? `Volta em ${dataBr(ate)}` : 'Sem data de volta' })
        }}
      >
        Pausar
      </button>
      <button type="button" className="btn-texto" onClick={fechar}>Cancelar</button>
    </Dialogo>
  )
}

export function Historico() {
  const base = useBase()
  const nav = useNavigate()
  const abrir = useDoseUI()
  const [params, setParams] = useSearchParams()
  const filtro = params.get('p') ?? ''
  const hoje = hojeStr()
  const [mes, setMes] = useState(() => hoje.slice(0, 7))
  if (!base) return <Tela><Carregando /></Tela>

  const protocolos = filtro ? base.protocolos.filter((p) => p.id === filtro) : base.protocolos
  const regs = base.aplicacoes.filter((a) => !filtro || a.protocoloId === filtro).sort((a, b) => b.dataHora.localeCompare(a.dataHora))
  const [ano, m] = mes.split('-').map(Number)
  const primeiro = new Date(ano, m - 1, 1)
  const diasNoMes = new Date(ano, m, 0).getDate()
  let previstas = 0
  let feitas = 0
  const dias = Array.from({ length: diasNoMes }, (_, k) => {
    const dia = diaDe(new Date(ano, m - 1, k + 1))
    if (dia > hoje) return { dia, n: k + 1, st: 'futuro' as const }
    const r = resumoDoDia(protocolos, base.itens, regs, dia)
    previstas += r.previstas
    feitas += r.feitas
    const st = r.previstas === 0 ? ('nada' as const) : r.feitas === r.previstas ? ('todas' as const) : r.feitas > 0 ? ('parte' as const) : ('nenhuma' as const)
    return { dia, n: k + 1, st }
  })
  const doMes = regs.filter((a) => diaDe(new Date(a.dataHora)).startsWith(mes))
  const grupos = new Map<string, typeof doMes>()
  for (const a of doMes) {
    const d = diaDe(new Date(a.dataHora))
    grupos.set(d, [...(grupos.get(d) ?? []), a])
  }
  const mudarMes = (delta: number) => {
    const d = new Date(ano, m - 1 + delta, 1)
    setMes(diaDe(d).slice(0, 7))
  }
  const rotuloSt = { todas: 'todas feitas', parte: 'parte feita', nenhuma: 'nenhuma feita', nada: 'sem dose prevista', futuro: '' }

  return (
    <Tela>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="icone-btn -ml-2.5"><IcoVoltar /></button>
        <h1 className="text-2xl font-extrabold">Histórico</h1>
        <label className="relative ml-auto">
          <span className="sr-only">Filtrar por protocolo</span>
          <select
            className="h-11 max-w-[170px] appearance-none rounded-[14px] border border-borda bg-sup pr-8 pl-3 text-sm font-bold"
            value={filtro}
            onChange={(e) => setParams(e.target.value ? { p: e.target.value } : {}, { replace: true })}
          >
            <option value="">Todos</option>
            {base.protocolos.map((p) => <option key={p.id} value={p.id}>{nomeProtocolo(p, base.itens, base.subs)}</option>)}
          </select>
          <IcoBaixo tam={16} className="pointer-events-none absolute top-3.5 right-2.5" />
        </label>
      </div>

      <section aria-label={`Calendário de ${nomeMes(m - 1)}`} className="card flex flex-col gap-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <button type="button" className="icone-btn" aria-label="Mês anterior" onClick={() => mudarMes(-1)}><IcoVoltar tam={20} /></button>
          <div className="flex flex-col items-center">
            <b className="text-base capitalize">{nomeMes(m - 1)} {ano}</b>
            <span className="text-[13px] text-fraco">{feitas} de {previstas} doses até agora</span>
          </div>
          <button type="button" className="icone-btn" aria-label="Próximo mês" disabled={mes >= hoje.slice(0, 7)} onClick={() => mudarMes(1)}><IcoSeta tam={20} /></button>
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 text-center text-xs font-bold text-fraco">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: primeiro.getDay() }, (_, i) => <span key={'v' + i} />)}
          {dias.map((d) => (
            <span
              key={d.dia}
              aria-label={`${d.n} de ${nomeMes(m - 1)}${rotuloSt[d.st] ? ': ' + rotuloSt[d.st] : ''}`}
              className={`flex h-[38px] items-center justify-center rounded-full text-[13px] font-bold ${
                d.st === 'todas' ? 'bg-ok text-sobre-acento' : d.st === 'parte' ? 'border-2 border-ok text-ok' : d.st === 'nenhuma' ? 'border border-dashed border-borda text-suave' : 'text-[#7d9aa8]'
              } ${d.dia === hoje ? 'underline underline-offset-4' : ''}`}
            >
              {d.n}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3.5 text-xs font-semibold text-suave">
          <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-ok" />Todas tomadas</span>
          <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-ok" />Parte</span>
          <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border border-dashed border-borda" />Nenhuma</span>
        </div>
      </section>

      {doMes.length === 0 && <p className="m-0 card p-4 text-[15px] text-suave">Nenhum registro em {nomeMes(m - 1)}.</p>}
      {[...grupos.entries()].map(([dia, lista]) => (
        <div key={dia} className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-fraco">{dataMedia(dia)}{dia === hoje ? ' · hoje' : ''}</span>
          <div className="card flex flex-col">
            {lista.map((a) => {
              const d = new Date(a.dataHora)
              const fr = a.frascoId ? base.frascos.find((f) => f.id === a.frascoId) : undefined
              const extra = [a.local, fr ? `frasco ${fr.reconstituidoEm ? `aberto em ${dataCurta(fr.reconstituidoEm)}` : `${fr.mgTotal} mg`}` : '', a.motivo ? `Motivo: ${a.motivo.toLowerCase()}` : '', a.observacao].filter(Boolean).join(' · ')
              return (
                <div key={a.id} className="flex items-center gap-3 border-t border-sup2 py-2.5 pr-1.5 pl-4 first:border-t-0">
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px]">
                      <StatusTomada status={a.status} /> <span className="font-bold">· {horaDe(d)}{a.status === 'feita' ? ` · ${fmtDose(a.doseValor, a.doseUnidade)}` : ''}</span>
                    </span>
                    <span className="text-[13px] text-fraco">{nomeSubstancia(a.substanciaId, base.subs)}{extra ? ` · ${extra}` : ''}</span>
                  </span>
                  <button type="button" aria-label={`Opções do registro das ${horaDe(d)}`} className="icone-btn text-fraco" onClick={() => abrir({ tipo: 'opcoes', aplicacaoId: a.id })}><IcoPontos /></button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </Tela>
  )
}
