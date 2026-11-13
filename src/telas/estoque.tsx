// T40 Estoque (+E50), T51 novo/editar frasco, T52 reconstituição, T53 reconstituição de blend, M51 vencido.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { repo, useBase, type Base } from '../dados/index.ts'
import { buscar } from '../dominio/sugestoes.ts'
import { dataBr, dataDiaMes, diaDe, difDias, hojeStr } from '../dominio/datas.ts'
import {
  LIMITE_ACABANDO,
  UNIDADES_POR_ML,
  concentracaoMgMl,
  custoPorDose,
  dataLimite,
  erroNumero,
  fmtDose,
  fmtNum,
  fmtReais,
  lerNumero,
  paraMg,
  rendimento,
  saldoFrasco,
  somaComponentesMg,
  unidadesNaSeringa,
  volumeDaDoseMl,
} from '../dominio/calculos.ts'
import { nomeComMg, nomeProtocolo, nomeSubstancia } from '../dominio/nomes.ts'
import type { Frasco, ItemProtocolo, Substancia, UnidadeDose } from '../dominio/tipos.ts'
import { NumeroAnimado } from '../ui/celebracao.tsx'
import { Cabecalho, Carregando, Chips, Dialogo, NaoAchou, Nota, Tela, Vazio } from '../ui/base.tsx'
import { useVoltar } from '../ui/navegar.ts'
import { IcoAlerta, IcoEstoque, IcoMais } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'
import { BotaoAcao, useAcao } from '../ui/acao.tsx'
import { mensagemDeErro } from '../dados/repo.ts'
import { FrascoVencido, UNIDADES } from './dose.tsx'
import { DIAS_AVISO_VENCIMENTO } from '../dominio/painel.ts'
import { corDe } from '../dominio/cores.ts'
import { dosesRestantes } from '../dominio/estoque.ts'
import { fmtUnidades, unidadesDaDose } from '../dominio/unidades.ts'
import { PontoCor } from '../ui/cor.tsx'

function itemDoFrasco(base: Base, f: Frasco): ItemProtocolo | undefined {
  const ativos = new Set(base.protocolos.filter((p) => p.estado !== 'encerrado').map((p) => p.id))
  const cands = base.itens.filter((i) => i.substanciaId === f.substanciaId && ativos.has(i.protocoloId))
  return cands.find((i) => i.frascoId === f.id) ?? cands[0]
}

/** "Cada dose de 2 mg = 10 un na seringa" (frasco reconstituído e dose que converte); senão null. */
function cadaDose(base: Base, f: Frasco, item: ItemProtocolo): string | null {
  const d = unidadesDaDose(item.doseValor, item.doseUnidade, f, base.subs.get(f.substanciaId)?.tipo === 'blend')
  if (d.unidades === null || d.unidade === 'mL') return null
  return `Cada dose de ${fmtNum(d.valor)} ${d.unidade} = ${fmtUnidades(d.unidades)} na seringa`
}

function seloFrasco(f: Frasco, base: Base, hoje: string): { t: string; cls: string } {
  if (f.status === 'acabou') return { t: 'Acabou', cls: 'bg-sup2 text-fraco' }
  if (f.status === 'descartado') return { t: 'Descartado', cls: 'bg-sup2 text-fraco' }
  const lim = dataLimite(f)
  if (lim) {
    const d = difDias(hoje, lim)
    if (d < 0) return { t: '⚠ Vencido', cls: 'bg-aviso-fundo text-aviso' }
    if (d <= DIAS_AVISO_VENCIMENTO) return { t: `⚠ Vence em ${d} dia${d === 1 ? '' : 's'}`, cls: 'bg-aviso-fundo text-aviso' }
  }
  const s = saldoFrasco(f, base.aplicacoes)
  if (s.dosesFeitas > 0 && f.mgTotal > 0 && s.mgRestante / f.mgTotal <= LIMITE_ACABANDO) return { t: '⚠ Acabando', cls: 'bg-aviso-fundo text-aviso' }
  return f.status === 'fechado' ? { t: 'Lacrado', cls: 'bg-sup2 text-suave' } : { t: '● Em uso', cls: 'bg-ok-fundo text-ok' }
}

export function Estoque() {
  const base = useBase()
  const [vencido, setVencido] = useState<Frasco | null>(null)
  const [verAntigos, setVerAntigos] = useState(false)
  const cab = (
    <div className="flex items-center justify-between">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Estoque</h1>
      <Link to="/estoque/frasco/novo" className="flex h-11 items-center gap-1.5 rounded-[10px] bg-acento px-4 text-[15px] font-bold text-sobre-acento"><IcoMais tam={20} /> Frasco</Link>
    </div>
  )
  if (!base) return <Tela>{cab}<Carregando /></Tela>
  if (!base.frascos.length) {
    return (
      <Tela>
        <h1 className="text-[32px] font-extrabold">Estoque</h1>
        <Vazio icone={<IcoEstoque tam={30} />} titulo="Nenhum frasco cadastrado" texto="Cadastre seus frascos para ver quanto resta, quando vencem e as unidades na seringa. É opcional: o app funciona sem isso.">
          <Link to="/estoque/frasco/novo" className="btn-primario">Adicionar frasco</Link>
        </Vazio>
      </Tela>
    )
  }
  const hoje = hojeStr()
  const emUso = base.frascos.filter((f) => f.status === 'fechado' || f.status === 'reconstituido')
  const antigos = base.frascos.filter((f) => !emUso.includes(f))
  const vencendo = emUso.filter((f) => {
    const l = dataLimite(f)
    return l && difDias(hoje, l) <= DIAS_AVISO_VENCIMENTO
  }).length
  const mes = hoje.slice(0, 7)
  const gastoMes = base.frascos.filter((f) => (f.compradoEm ?? diaDe(new Date(f.criadoEm))).startsWith(mes)).reduce((s, f) => s + (f.custo ?? 0), 0)

  const card = (f: Frasco, k = 0) => {
    const nome = nomeSubstancia(f.substanciaId, base.subs)
    const s = saldoFrasco(f, base.aplicacoes)
    const selo = seloFrasco(f, base, hoje)
    const item = itemDoFrasco(base, f)
    const custo = item ? custoPorDose(f, item.doseValor, item.doseUnidade) : null
    const lim = dataLimite(f)
    const frac = s.mlRestante !== null && f.diluenteMl ? s.mlRestante / f.diluenteMl : f.mgTotal ? s.mgRestante / f.mgTotal : 0
    const aberto = lim && difDias(hoje, lim) <= DIAS_AVISO_VENCIMENTO && (f.status === 'fechado' || f.status === 'reconstituido')
    const prot = item ? base.protocolos.find((p) => p.id === item.protocoloId) : undefined
    const emUsoF = f.status === 'fechado' || f.status === 'reconstituido'
    const doses = item && emUsoF ? dosesRestantes(f, base.aplicacoes, item.doseValor, item.doseUnidade) : null
    const cada = item && emUsoF ? cadaDose(base, f, item) : null
    return (
      <div key={f.id} style={{ '--i': k, ...(prot && emUsoF ? { borderLeftColor: corDe(prot).hex } : {}) } as CSSProperties} className={`card anima-entrada flex flex-col gap-2.5 p-4 ${prot && emUsoF ? 'border-l-[5px]' : ''} ${selo.cls.includes('aviso') ? 'border-aviso' : ''}`}>
        <Link to={`/estoque/frasco/${f.id}`} className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[17px] font-extrabold break-words">{nomeComMg(nome, f.mgTotal)}</span>
            <span className="text-[13px] text-fraco">
              {f.status === 'reconstituido' && f.reconstituidoEm ? `Reconstituído em ${dataDiaMes(f.reconstituidoEm)} · ${fmtNum(f.diluenteMl ?? 0)} mL` : f.status === 'fechado' ? `Fechado${f.validade ? ` · validade ${dataBr(f.validade)}` : ''}` : f.lote ? `Lote ${f.lote}` : 'Fora de uso'}
            </span>
          </span>
          <span className={`selo shrink-0 ${selo.cls}`}>{selo.t}</span>
        </Link>
        {(f.status === 'reconstituido' || f.status === 'fechado') && (
          <>
            <div className="flex flex-col gap-1">
              <span className="flex justify-between gap-2 text-sm font-semibold">
                <span>Restante</span>
                <span>{s.mlRestante !== null ? <><NumeroAnimado valor={s.mlRestante} formatar={(v) => fmtNum(v, 2)} /> mL de {fmtNum(f.diluenteMl ?? 0)} mL</> : <><NumeroAnimado valor={s.mgRestante} formatar={(v) => fmtNum(v, 3)} /> mg de {fmtNum(f.mgTotal)} mg</>}</span>
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-sup2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} aria-label="Saldo do frasco">
                <div className={`barra-anima h-full w-full rounded-full ${frac <= LIMITE_ACABANDO ? 'bg-aviso' : 'bg-acento'}`} style={{ transform: `translateX(${(Math.max(0, Math.min(1, frac)) - 1) * 100}%)` }} />
              </div>
              {doses !== null && <span className="text-sm font-semibold text-suave">{doses === 0 ? 'Menos de 1 dose restante' : `≈ ${doses} dose${doses === 1 ? '' : 's'} restante${doses === 1 ? '' : 's'}`} com {fmtDose(item!.doseValor, item!.doseUnidade)}</span>}
              {cada && <span className="text-sm text-suave">{cada}</span>}
              {s.naoContabilizadas > 0 && <span className="text-xs text-fraco">{s.naoContabilizadas} registro(s) sem conversão para mg (em UI, ou em mL/unidades antes de reconstituir) não entram na conta.</span>}
            </div>
            {prot && (
              <Link to={`/protocolos/${prot.id}`} className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-suave">
                <PontoCor protocolo={prot} /> Protocolo: <span className="text-texto">{nomeProtocolo(prot, base.itens, base.subs)}</span>
              </Link>
            )}
            <div className="flex flex-wrap justify-between gap-x-3 border-t border-sup2 pt-2.5 text-[13px] text-suave">
              <span>{lim ? `Validade: ${dataDiaMes(lim)}` : 'Sem validade informada'}</span>
              {custo !== null && <span>Custo: {fmtReais(custo)} por dose</span>}
            </div>
            <div className="flex flex-wrap gap-x-4">
              {f.status === 'fechado' ? (
                <Link to={`/estoque/frasco/${f.id}/reconstituir`} className="link">Reconstituir</Link>
              ) : (
                <Link to={`/estoque/frasco/${f.id}/reconstituir`} className="link">Ver conta da seringa</Link>
              )}
              {aberto && <button type="button" className="link text-aviso" onClick={() => setVencido(f)}>Decidir sobre a validade</button>}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <Tela>
      {cab}
      <div className="grid grid-cols-3 gap-2">
        <div className="card flex flex-col gap-0.5 p-3"><span className="text-xs font-bold text-fraco">Em uso</span><b className="text-xl">{emUso.length}</b></div>
        <div className={`card flex flex-col gap-0.5 p-3 ${vencendo ? 'border-aviso/40 bg-aviso-fundo' : ''}`}><span className={`text-xs font-bold ${vencendo ? 'text-aviso-texto' : 'text-fraco'}`}>Vencem em {DIAS_AVISO_VENCIMENTO} dias</span><b className={`text-xl ${vencendo ? 'text-aviso' : ''}`}>{vencendo}</b></div>
        <div className="card flex flex-col gap-0.5 p-3"><span className="text-xs font-bold text-fraco">Gasto no mês</span><b className="text-base">{fmtReais(gastoMes)}</b></div>
      </div>
      {emUso.length === 0 && <p className="m-0 card p-4 text-[15px] text-suave">Nenhum frasco em uso.</p>}
      {emUso.sort((a, b) => (a.status === b.status ? 0 : a.status === 'reconstituido' ? -1 : 1)).map((f, k) => card(f, k))}
      {antigos.length > 0 && (
        <>
          <button type="button" className="link" aria-expanded={verAntigos} onClick={() => setVerAntigos(!verAntigos)}>
            {verAntigos ? 'Esconder' : 'Ver'} acabados e descartados ({antigos.length})
          </button>
          {verAntigos && antigos.map((f, k) => card(f, k))}
        </>
      )}
      {vencido && <FrascoVencido frasco={vencido} base={base} aoFechar={() => setVencido(null)} manter={() => setVencido(null)} />}
    </Tela>
  )
}

/** Busca de substância compacta (mesma lista do T21). */
function EscolherSubstancia({ base, valor, aoEscolher }: { base: Base; valor?: string; aoEscolher: (s: Substancia) => void }) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(!valor)
  const { erro, rodar } = useAcao()
  const res = useMemo(() => buscar(texto, base.substancias, undefined, 8), [texto, base.substancias])
  const atual = valor ? base.subs.get(valor) : undefined
  if (!aberto && atual) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-borda bg-sup px-3 py-2">
        <span className="flex flex-col"><b className="text-base">{atual.nome}</b><span className="text-xs text-fraco">{atual.tipo === 'blend' ? 'Blend' : 'Simples'}</span></span>
        <button type="button" className="link" onClick={() => setAberto(true)}>Trocar</button>
      </div>
    )
  }
  const q = texto.trim()
  return (
    <div className="flex flex-col gap-2">
      <input type="search" className="campo font-semibold" aria-label="Buscar substância" placeholder="Buscar ou digitar o nome" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div role="listbox" aria-label="Substâncias" className="card flex flex-col overflow-hidden">
        {res.map((r) => {
          const nome = r.origem === 'minha' ? r.substancia.nome : r.sugestao.nome
          return (
            <button
              key={r.origem === 'minha' ? r.substancia.id : r.sugestao.id}
              type="button"
              role="option"
              aria-selected={false}
              className="flex min-h-12 items-center justify-between border-t border-sup2 px-4 text-left font-bold first:border-t-0"
              onClick={() => void rodar(async () => {
                const s = r.origem === 'minha' ? r.substancia : await repo.usarSugestao(r.sugestao)
                aoEscolher(s)
                setAberto(false)
              })}
            >
              {nome}
              <span className={`selo ${r.origem === 'minha' ? 'bg-selecionado text-acento' : 'bg-sup2 text-fraco'}`}>{r.origem === 'minha' ? 'Sua' : 'Lista'}</span>
            </button>
          )
        })}
        {q && (
          <>
            <button type="button" className="flex min-h-12 items-center gap-2 border-t border-sup2 px-4 text-left text-[15px] font-bold text-acento" onClick={() => void rodar(async () => { aoEscolher(await repo.substanciaPorNome(q)); setAberto(false) })}>
              <IcoMais tam={18} /> Criar “{q}”
            </button>
            <button type="button" className="flex min-h-12 items-center gap-2 border-t border-sup2 px-4 text-left text-[15px] font-bold text-acento" onClick={() => void rodar(async () => { aoEscolher(await repo.substanciaPorNome(q, 'blend')); setAberto(false) })}>
              <IcoMais tam={18} /> É um blend? Criar “{q}” como blend
            </button>
          </>
        )}
      </div>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
    </div>
  )
}

/** Uma tela nova por frasco: ir de um frasco para "Novo frasco" não leva junto o que estava preenchido. */
export function FormFrasco() {
  const { id } = useParams()
  return <FormFrascoTela key={id ?? 'novo'} />
}

function FormFrascoTela() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const base = useBase()
  const nav = useNavigate()
  const voltarOu = useVoltar()
  const toast = useToast()
  const acoes = useAcao()
  const apagado = useRef(false)
  const existente = id ? base?.frascos.find((f) => f.id === id) : undefined
  const [subId, setSubId] = useState<string | undefined>(params.get('sub') ?? undefined)
  // "Adicione o frasco" de um protocolo: o frasco novo já fica ligado àquela linha.
  const itemLigar = !id ? base?.itens.find((i) => i.id === params.get('item')) : undefined
  const [mg, setMg] = useState('')
  const [validade, setValidade] = useState('')
  const [lote, setLote] = useState('')
  const [compra, setCompra] = useState(hojeStr())
  const [custo, setCusto] = useState('')
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(!id)
  const [confirmaData, setConfirmaData] = useState<null | (() => void)>(null)
  const [apagar, setApagar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (existente && !pronto) {
      setSubId(existente.substanciaId)
      setMg(fmtNum(existente.mgTotal))
      setValidade(existente.validade ?? '')
      setLote(existente.lote ?? '')
      setCompra(existente.compradoEm ?? '')
      setCusto(existente.custo !== undefined ? fmtNum(existente.custo, 2) : '')
      setPronto(true)
    }
  }, [existente, pronto])
  // Acabou de ser apagado aqui: a lista do banco atualiza antes da troca de tela; não vira "Novo frasco".
  if (apagado.current && !existente) return <Tela><Carregando /></Tela>
  // Não existe (endereço errado, ou apagado em outra janela / gravação que terminou depois do aviso de demora).
  if (base && id && !existente) return <NaoAchou titulo="Frasco não encontrado" texto="Ele pode ter sido apagado." para="/estoque" rotulo="Ir para Estoque" />
  if (!base || !pronto) return <Tela><Carregando /></Tela>
  const sub = subId ? base.subs.get(subId) : undefined

  const salvar = async (depois: 'fechado' | 'reconstituir', forcar = false) => {
    if (!subId) return setErro('Escolha a substância.')
    const mgN = lerNumero(mg)
    if (mgN === null || mgN <= 0) return setErro(erroNumero(mg, 'Informe a quantidade no frasco (mg), do rótulo.'))
    const custoN = custo.trim() ? lerNumero(custo) : undefined
    if (custoN === null || (custoN !== undefined && custoN < 0)) return setErro(erroNumero(custo, 'Confira o custo.'))
    if (salvando) return
    setSalvando(true)
    if (!forcar && validade && validade < hojeStr() && validade !== existente?.validade) {
      setSalvando(false)
      return setConfirmaData(() => () => void salvar(depois, true))
    }
    let f: Frasco
    try {
      f = await repo.salvarFrasco({
      ...(existente ?? { status: 'fechado' as const }),
      id: existente?.id,
      substanciaId: subId,
      mgTotal: mgN,
      validade: validade || undefined,
      lote: lote.trim() || undefined,
      compradoEm: compra || undefined,
      custo: custoN ?? undefined,
      })
      if (itemLigar && itemLigar.substanciaId === subId) await repo.ligarFrasco(itemLigar.id, f.id)
    } catch (e) {
      setSalvando(false)
      return setErro(mensagemDeErro(e))
    }
    if (depois === 'reconstituir') nav(`/estoque/frasco/${f.id}/reconstituir`, { replace: true })
    else {
      toast({ titulo: existente ? 'Frasco atualizado' : 'Frasco salvo', texto: `${sub?.nome ?? ''} · ${fmtNum(mgN)} mg` })
      voltarOu('/estoque')
    }
  }

  const soma = sub?.tipo === 'blend' ? somaComponentesMg(sub.componentes) : null

  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo={existente ? 'Frasco' : 'Novo frasco'} fechar={() => voltarOu('/estoque')} />
      {itemLigar && (() => {
        const p = base.protocolos.find((x) => x.id === itemLigar.protocoloId)
        return p ? (
          <p className="m-0 flex items-center gap-2 rounded-xl bg-sup2 px-4 py-3 text-sm text-suave">
            <PontoCor protocolo={p} />
            <span>Vai ficar ligado ao protocolo <b className="text-texto">{nomeProtocolo(p, base.itens, base.subs)}</b>, para acompanhar o saldo.</span>
          </p>
        ) : null
      })()}
      <div className="rotulo">
        <span>Substância (simples ou blend)</span>
        <EscolherSubstancia base={base} valor={subId} aoEscolher={(s) => { setSubId(s.id); setErro(''); const sm = s.tipo === 'blend' ? somaComponentesMg(s.componentes) : null; if (sm && !mg) setMg(fmtNum(sm)) }} />
      </div>
      {sub?.tipo === 'blend' && (
        <Link to={`/novo/blend?id=${sub.id}`} className="link -mt-2">{sub.componentes?.length ? 'Ver componentes do blend' : 'Adicionar componentes ao blend (opcional)'}</Link>
      )}
      <label className="rotulo">
        Quantidade no frasco (mg){soma !== null ? ` · soma dos componentes: ${fmtNum(soma)} mg` : ''}
        <input className="campo" inputMode="decimal" value={mg} onChange={(e) => { setMg(e.target.value); setErro('') }} placeholder="Do rótulo" />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="rotulo">Validade<input type="date" className="campo px-2" value={validade} onChange={(e) => setValidade(e.target.value)} /></label>
        <label className="rotulo">Comprado em<input type="date" className="campo px-2" value={compra} onChange={(e) => setCompra(e.target.value)} /></label>
        <label className="rotulo">Lote (opcional)<input className="campo" value={lote} onChange={(e) => setLote(e.target.value)} /></label>
        <label className="rotulo">Custo R$ (opcional)<input className="campo" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} /></label>
      </div>
      <p className="m-0 text-[13px] text-fraco">Copie os dados do rótulo. O custo só serve para mostrar o custo por dose.</p>
      {existente && (() => {
        const it = itemDoFrasco(base, existente)
        const cada = it ? cadaDose(base, existente, it) : null
        return cada ? <Nota>{cada}, com a água informada ({fmtNum(existente.diluenteMl ?? 0)} mL).</Nota> : null
      })()}
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      <div className="mt-auto flex flex-col gap-2">
        {!existente ? (
          <>
            <button type="button" className="btn-primario" onClick={() => salvar('reconstituir')}>Salvar e reconstituir</button>
            <button type="button" className="btn-secundario" onClick={() => salvar('fechado')}>Salvar fechado</button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primario" onClick={() => salvar('fechado')}>Salvar</button>
            <Link to={`/estoque/frasco/${existente.id}/reconstituir`} className="btn-secundario">{existente.status === 'reconstituido' ? 'Reconstituição' : 'Reconstituir'}</Link>
            {(existente.status === 'fechado' || existente.status === 'reconstituido') ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-neutro text-sm" disabled={acoes.ocupado} onClick={() => void acoes.rodar(async () => { await repo.statusFrasco(existente.id, 'acabou'); toast({ tipo: 'info', titulo: 'Marcado como acabado', desfazer: () => repo.statusFrasco(existente.id, existente.status) }); voltarOu('/estoque') })}>Acabou</button>
                <button type="button" className="btn-neutro text-sm" disabled={acoes.ocupado} onClick={() => void acoes.rodar(async () => { await repo.statusFrasco(existente.id, 'descartado'); toast({ tipo: 'info', titulo: 'Marcado como descartado', desfazer: () => repo.statusFrasco(existente.id, existente.status) }); voltarOu('/estoque') })}>Descartar</button>
              </div>
            ) : (
              <button type="button" className="btn-neutro" disabled={acoes.ocupado} onClick={() => void acoes.rodar(async () => { await repo.statusFrasco(existente.id, existente.reconstituidoEm ? 'reconstituido' : 'fechado'); voltarOu('/estoque') })}>Voltar a usar este frasco</button>
            )}
            {acoes.erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{acoes.erro}</p>}
            <button type="button" className="btn-texto text-erro" onClick={() => setApagar(true)}>Apagar frasco</button>
          </>
        )}
      </div>
      {confirmaData && (
        <Dialogo titulo="Validade já passou" aoFechar={() => setConfirmaData(null)} icone={<IcoAlerta className="text-aviso" tam={28} />}>
          <p className="m-0 text-[15px] text-suave">A data de validade informada ({dataBr(validade)}) é anterior a hoje. Quer salvar assim mesmo?</p>
          <button type="button" className="btn-primario" onClick={() => { const f = confirmaData; setConfirmaData(null); f() }}>Salvar assim mesmo</button>
          <button type="button" className="btn-texto" onClick={() => setConfirmaData(null)}>Corrigir a data</button>
        </Dialogo>
      )}
      {apagar && existente && (
        <Dialogo titulo="Apagar este frasco?" aoFechar={() => setApagar(false)}>
          <p className="m-0 text-[15px] text-suave">Os registros de dose continuam no histórico, só deixam de apontar para este frasco. Para guardar o histórico do frasco, prefira “Acabou” ou “Descartar”.</p>
          <BotaoAcao
            className="btn-perigo"
            ocupadoTexto="Apagando…"
            acao={async () => {
              const nome = nomeComMg(sub?.nome ?? '', existente.mgTotal)
              const r = await repo.apagarFrasco(existente.id)
              apagado.current = true
              setApagar(false)
              toast(r
                ? { tipo: 'info', titulo: 'Frasco apagado', texto: nome, desfazer: () => repo.restaurarFrasco(r) }
                : { tipo: 'info', titulo: 'Este frasco já tinha sido apagado' })
              nav('/estoque', { replace: true })
            }}
          >
            Apagar
          </BotaoAcao>
          <button type="button" className="btn-texto" onClick={() => setApagar(false)}>Cancelar</button>
        </Dialogo>
      )}
    </Tela>
  )
}

function Conta({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-[13px] font-bold tracking-wide text-fraco uppercase">{titulo}</span>
      <b className="text-[26px] leading-tight">{valor}</b>
      {detalhe && <span className="text-sm text-suave">{detalhe}</span>}
    </div>
  )
}

export function Reconstituicao() {
  const { id } = useParams()
  const base = useBase()
  const voltarOu = useVoltar()
  const toast = useToast()
  const frasco = base?.frascos.find((f) => f.id === id)
  const [dil, setDil] = useState('')
  const [quando, setQuando] = useState(hojeStr())
  const [usarAte, setUsarAte] = useState('')
  const [itemId, setItemId] = useState<string>('')
  const [doseLivre, setDoseLivre] = useState('')
  const [uniLivre, setUniLivre] = useState<UnidadeDose>('mcg')
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    if (frasco && base && !pronto) {
      setDil(frasco.diluenteMl ? fmtNum(frasco.diluenteMl) : '')
      setQuando(frasco.reconstituidoEm ?? hojeStr())
      setUsarAte(frasco.usarAte ?? '')
      setItemId(itemDoFrasco(base, frasco)?.id ?? '')
      setPronto(true)
    }
  }, [frasco, base, pronto])
  if (base && !frasco) return <NaoAchou titulo="Frasco não encontrado" />
  if (!base || !pronto || !frasco) return <Tela><Carregando /></Tela>
  const sub = base.subs.get(frasco.substanciaId)
  const blend = sub?.tipo === 'blend'
  const dilN = lerNumero(dil)
  const conc = dilN ? concentracaoMgMl(frasco.mgTotal, dilN) : null
  const itensSub = base.itens.filter((i) => i.substanciaId === frasco.substanciaId && base.protocolos.find((p) => p.id === i.protocoloId)?.estado !== 'encerrado')
  const item = itensSub.find((i) => i.id === itemId)
  const dose = item ? { v: item.doseValor, u: item.doseUnidade } : lerNumero(doseLivre) ? { v: lerNumero(doseLivre)!, u: uniLivre } : null
  const volBlend = dose && (dose.u === 'mL' || dose.u === 'unidades') ? volumeDaDoseMl(dose.v, dose.u, null) : null
  const vol = dose ? (blend ? volBlend : volumeDaDoseMl(dose.v, dose.u, conc)) : null
  const rende = vol && dilN ? rendimento(dilN, vol) : null

  const salvar = async () => {
    if (!dilN || dilN <= 0) return setErro(erroNumero(dil, 'Informe quantos mL de diluente você usou.'))
    if (usarAte && quando && usarAte < quando) return setErro('A data “usar até” é anterior à data em que foi misturado.')
    try {
      await repo.salvarFrasco({ ...frasco, status: 'reconstituido', diluenteMl: dilN, reconstituidoEm: quando || hojeStr(), usarAte: usarAte || undefined })
    } catch (e) {
      return setErro(mensagemDeErro(e))
    }
    toast({ titulo: 'Reconstituição salva', texto: `${sub?.nome ?? ''} · ${fmtNum(dilN)} mL` })
    voltarOu('/estoque')
  }

  const doseMcg = dose ? paraMg(dose.v, dose.u) : null
  const comps = sub?.componentes ?? []
  const soma = somaComponentesMg(comps)

  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo="Reconstituição" sub={`${sub?.nome ?? ''} · ${blend ? 'blend' : `frasco de ${fmtNum(frasco.mgTotal)} mg`}`} voltar />
      {blend && (
        <section className="card flex flex-col p-4">
          <span className="mb-2 text-[13px] font-bold tracking-wide text-fraco uppercase">No frasco, como você informou</span>
          {comps.length === 0 && <span className="text-sm text-fraco">Nenhum componente informado. <Link to={`/novo/blend?id=${sub!.id}`} className="font-bold text-acento">Adicionar</Link></span>}
          {comps.map((c, i) => (
            <div key={i} className="flex min-h-9 items-center justify-between border-b border-sup2 text-[15px]">
              <span>{c.nome}</span><b>{c.quantidade !== undefined ? `${fmtNum(c.quantidade)} ${c.unidade ?? 'mg'}` : 'sem quantidade'}</b>
            </div>
          ))}
          {soma !== null && <div className="flex min-h-9 items-center justify-between text-[15px] font-extrabold"><span>Total</span><span>{fmtNum(soma)} mg</span></div>}
          <span className="mt-1 text-xs text-fraco">Frasco cadastrado com {fmtNum(frasco.mgTotal)} mg.</span>
        </section>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <label className="rotulo">Diluente (mL)<input className="campo" inputMode="decimal" value={dil} onChange={(e) => { setDil(e.target.value); setErro('') }} placeholder="Ex.: 2" /></label>
        <label className="rotulo">Misturado em<input type="date" className="campo px-2" value={quando} onChange={(e) => setQuando(e.target.value)} /></label>
      </div>
      <label className="rotulo">Usar até (você informa)<input type="date" className="campo" value={usarAte} onChange={(e) => setUsarAte(e.target.value)} /></label>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}

      {!blend && conc !== null && <Conta titulo="Concentração" valor={`${fmtNum(conc)} mg/mL`} detalhe={`${fmtNum(frasco.mgTotal)} mg ÷ ${fmtNum(dilN!)} mL`} />}

      {itensSub.length > 0 ? (
        <label className="rotulo">
          Dose do protocolo
          <select className="campo text-sm font-semibold" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {itensSub.map((i) => {
              const p = base.protocolos.find((x) => x.id === i.protocoloId)!
              return <option key={i.id} value={i.id}>{nomeProtocolo(p, base.itens, base.subs)} · {fmtDose(i.doseValor, i.doseUnidade)}</option>
            })}
            <option value="">Outra dose (digitar)</option>
          </select>
        </label>
      ) : (
        <Nota>Sem protocolo ligado a esta substância. Digite a dose que você definiu para ver a conversão.</Nota>
      )}
      {!item && (
        <div className="flex flex-col gap-2">
          <label className="rotulo">Dose que você definiu<input className="campo" inputMode="decimal" value={doseLivre} onChange={(e) => setDoseLivre(e.target.value)} /></label>
          <Chips rotulo="Unidade" opcoes={(blend ? (['mL', 'unidades'] as UnidadeDose[]) : UNIDADES).map((u) => ({ v: u, t: u }))} valor={uniLivre} aoMudar={setUniLivre} />
        </div>
      )}

      {dose && vol !== null && (
        <Conta
          titulo={item ? `Para a dose que você cadastrou (${fmtDose(dose.v, dose.u)})` : `Para a dose ${fmtDose(dose.v, dose.u)}`}
          valor={`${fmtNum(unidadesNaSeringa(vol))} unidades`}
          detalhe={
            !blend && doseMcg !== null && conc
              ? `${fmtNum(doseMcg * 1000)} mcg ÷ ${fmtNum(conc * 1000)} mcg/mL = ${fmtNum(vol)} mL · seringa de ${UNIDADES_POR_ML} unidades por mL`
              : `= ${fmtNum(vol)} mL · seringa de ${UNIDADES_POR_ML} unidades por mL`
          }
        />
      )}
      {dose && vol === null && (
        <Nota tipo="aviso">
          {dose.u === 'UI'
            ? 'Dose em UI não é convertida: o app não sabe quantas UI há em cada mg.'
            : blend
              ? 'Em blend, cadastre a dose em mL ou unidades para ver o volume. O app não converte mg de blend.'
              : 'Informe o diluente para ver a conversão.'}
        </Nota>
      )}
      {rende !== null && <Conta titulo="Rende, com essa dose" valor={`${rende} doses`} detalhe={`${fmtNum(dilN!)} mL ÷ ${fmtNum(vol!)} mL`} />}

      <Nota tipo="aviso">
        {blend
          ? 'Em blend, o app não calcula quanto de cada componente vai em cada dose. Mostra só o que você informou e converte volume.'
          : 'Confira a conta. A dose é decisão sua; o app só converte o número que você informou, sem arredondar.'}
      </Nota>
      <button type="button" className="btn-primario mt-auto" onClick={salvar}>Salvar</button>
    </Tela>
  )
}
