// T10 Hoje (painel), E10 Hoje vazio, M10 doses de um dia, N73 backup atrasado, M66 primeiro backup, N06 reativar avisos.
// De cima para baixo: doses de hoje (ação principal), a semana, avisos, próximas doses e atalhos de peso e estoque.
// As contas ficam em dominio/painel.ts (puras e testadas); aqui só se mostra.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { repo, useBase, useConfig, type Base } from '../dados/index.ts'
import { type Slot, type StatusSlot } from '../dominio/agenda.ts'
import { dataCurta, dataDiaMes, dataLonga, diaDe, diaRelativo, difDias, horaDe, parseDia, somaDias } from '../dominio/datas.ts'
import { fmtNum } from '../dominio/calculos.ts'
import { textoDoItem, textoDoRegistro } from './dose-texto.ts'
import { nomeProtocolo, nomeSubstancia } from '../dominio/nomes.ts'
import {
  alertasPainel,
  dosesDoDia,
  indexarPorDia,
  proximasDoses,
  resumirDia,
  resumoEstoquePainel,
  resumoPeso,
  resumoSemana,
  saudacao,
  type Alerta,
  type DoseDoDia,
  type ResumoDia,
  type ResumoSemana,
} from '../dominio/painel.ts'
import { bordaCor, PontoCor } from '../ui/cor.tsx'
import type { Aplicacao, Frasco, Protocolo } from '../dominio/tipos.ts'
import { Carregando, Dialogo, Sheet, Tela, Vazio } from '../ui/base.tsx'
import { IcoAlerta, IcoCalendario, IcoCheck, IcoEngrenagem, IcoEstoque, IcoMais, IcoPeso, IcoProtocolos, IcoSeta, IcoSino, IcoX } from '../ui/icones.tsx'
import { FrascoVencido, useDoseUI } from './dose.tsx'
import { PrePermissao, AvisosBloqueados } from './inicio.tsx'
import { useToast } from '../ui/toast.tsx'
import { BotaoAcao } from '../ui/acao.tsx'
import { CheckAnimado, NumeroAnimado, TudoFeito } from '../ui/celebracao.tsx'
import { useListaComSaida } from '../ui/base.tsx'
import { useMudou, useRecente } from '../ui/movimento.ts'

function useAgora(intervalo = 30000) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), intervalo)
    return () => window.clearInterval(t)
  }, [intervalo])
  return agora
}

function CabecalhoHoje({ hoje, agora }: { hoje: string; agora: Date }) {
  return (
    <div className="flex items-end justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-fraco">{saudacao(agora)} · {dataLonga(hoje)}</span>
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Hoje</h1>
      </div>
      <Link to="/ajustes" aria-label="Configurações" className="icone-btn border border-linha bg-sup"><IcoEngrenagem tam={22} /></Link>
    </div>
  )
}

function doseTexto(base: Base, s: Slot): string {
  return textoDoItem(base, s.itemId)
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function Hoje() {
  const base = useBase()
  const agora = useAgora()
  const hoje = diaDe(agora)
  const abrir = useDoseUI()
  const nav = useNavigate()
  const toast = useToast()
  const ultimoBackup = useConfig('ultimoBackup')
  const adiado = useConfig('backupAdiadoAte')
  const reativar = useConfig('reativarAvisos')
  const [dialogo, setDialogo] = useState<null | 'backup' | 'pre' | 'bloq' | { frasco: Frasco }>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)

  // Todas as contas do painel de uma vez: só refazem quando os dados mudam ou o relógio anda (30 s),
  // não a cada toque/diálogo. Calculado antes dos retornos abaixo (hooks precisam rodar sempre).
  const painel = useMemo(() => {
    if (!base) return undefined
    const porDia = indexarPorDia(base.aplicacoes)
    return {
      porDia,
      hojeDoses: dosesDoDia(base.protocolos, base.itens, porDia, hoje, agora),
      semana: resumoSemana(base.protocolos, base.itens, base.aplicacoes, agora, porDia),
      proximas: proximasDoses(base.protocolos, base.itens, agora),
      alertas: alertasPainel(base, agora, porDia),
      peso: resumoPeso(base.medicoes),
      estoque: resumoEstoquePainel(base, hoje),
    }
  }, [base, agora, hoje])

  const slots = (painel?.hojeDoses ?? []).map((d) => ({ s: d.slot, st: d.status as StatusSlot }))
  const feitas = slots.filter((x) => x.st === 'feita').length
  const tudoFeito = slots.length > 0 && feitas === slots.length
  const proxHoje = slots.find((x) => x.st === 'pendente') ?? slots.find((x) => x.st === 'atrasada')
  const pronto = !!base && ultimoBackup.carregado
  const acabouAgora = useMudou(tudoFeito, pronto) && tudoFeito
  const trocouProxima = useMudou(proxHoje ? proxHoje.s.chave + proxHoje.s.itemId : '', pronto)
  const avulsas = useListaComSaida(
    base
      ? base.aplicacoes
          .filter((a) => diaDe(new Date(a.dataHora)) === hoje && !slots.some((x) => x.s.itemId === a.itemId && x.s.chave === a.previsto))
          .sort((a, b) => a.dataHora.localeCompare(b.dataHora))
      : [],
    (a) => a.id,
  )

  if (!base || !painel || !ultimoBackup.carregado) return <Tela><CabecalhoHoje hoje={hoje} agora={agora} /><Carregando /></Tela>

  if (base.protocolos.length === 0) {
    return (
      <Tela>
        <CabecalhoHoje hoje={hoje} agora={agora} />
        <Vazio icone={<IcoProtocolos tam={30} />} titulo="Nada para hoje ainda" texto="Cadastre o protocolo que você já segue. As doses do dia aparecem aqui, com um botão para registrar.">
          <Link to="/novo" className="btn-primario">Criar protocolo</Link>
          <Link to="/restaurar" className="btn-texto">Tenho um backup</Link>
        </Vazio>
      </Tela>
    )
  }

  const futura = proxHoje ? undefined : painel.proximas[0]?.doses[0]

  const clicarDose = (s: Slot, st: StatusSlot | 'futura', aplicacaoId?: string) => {
    if (st === 'atrasada') abrir({ tipo: 'atrasada', slot: s })
    else if (st === 'pendente') abrir({ tipo: 'registrar', itemId: s.itemId, slot: s })
    else if (st === 'feita' || st === 'pulada') {
      const id = aplicacaoId ?? base.aplicacoes.find((a) => a.itemId === s.itemId && a.previsto === s.chave)?.id
      if (id) abrir({ tipo: 'opcoes', aplicacaoId: id })
    }
  }

  const semFrascoIds = new Set(painel.alertas.flatMap((a) => (a.tipo === 'sem-frasco' ? [a.itemId] : [])))

  const diasBackup = ultimoBackup.valor ? difDias(diaDe(new Date(ultimoBackup.valor)), hoje) : null
  const adiadoAtivo = !!adiado.valor && adiado.valor > hoje
  const mostrarN73 = diasBackup !== null && diasBackup > 30 && !adiadoAtivo
  const mostrarSemBackup = diasBackup === null && !adiadoAtivo

  // dia aberto na folha: recalculado a cada render para refletir um registro feito com a folha aberta
  const resumoAberto = diaAberto ? (painel.semana.dias.find((d) => d.dia === diaAberto) ?? resumirDia(diaAberto, dosesDoDia(base.protocolos, base.itens, painel.porDia, diaAberto, agora))) : null

  return (
    <Tela>
      <CabecalhoHoje hoje={hoje} agora={agora} />

      {reativar.valor && (
        <div role="status" className="card flex flex-col gap-2 p-4">
          <span className="flex items-start gap-2 text-[15px] font-semibold"><IcoSino tam={20} className="mt-0.5 shrink-0 text-acento" /> Seus dados voltaram, mas os avisos ficam ligados a cada aparelho. Ative de novo neste.</span>
          <div className="flex gap-2">
            <button type="button" className="btn-texto flex-1" onClick={() => repo.delConfig('reativarAvisos')}>Agora não</button>
            <button type="button" className="btn-primario h-11 flex-1" onClick={() => setDialogo('pre')}>Ativar avisos</button>
          </div>
        </div>
      )}

      {proxHoje ? (
        <ProximaDose key={proxHoje.s.chave + proxHoje.s.itemId} trocou={trocouProxima} atrasada={proxHoje.st === 'atrasada'} horario={proxHoje.s.horario} nome={nomeSubstancia(proxHoje.s.substanciaId, base.subs)} dose={doseTexto(base, proxHoje.s)} registrar={() => clicarDose(proxHoje.s, proxHoje.st)} />
      ) : tudoFeito ? (
        <TudoFeito total={slots.length} animar={acabouAgora}>
          {futura && <span className="mt-1 text-[13px] font-semibold text-suave">Próxima: {diaRelativo(futura.dia, hoje).toLowerCase()} às {futura.horario} · {nomeSubstancia(futura.substanciaId, base.subs)}</span>}
        </TudoFeito>
      ) : futura ? (
        <div className="card anima-entrada flex flex-col gap-1 p-5">
          <span className="text-[13px] font-bold tracking-wide text-fraco uppercase">Próxima dose</span>
          <span className="text-xl font-extrabold">{nomeSubstancia(futura.substanciaId, base.subs)}</span>
          <span className="text-[15px] text-suave">{diaRelativo(futura.dia, hoje)} às {futura.horario} · {doseTexto(base, futura)}</span>
        </div>
      ) : null}

      <section aria-labelledby="t-doses-hoje" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 id="t-doses-hoje" className="text-[17px] font-bold">Doses de hoje</h2>
          {slots.length > 0 && <span className="text-[13px] font-semibold text-fraco"><NumeroAnimado valor={feitas} /> de {slots.length}</span>}
        </div>
        {slots.length === 0 && <p className="m-0 card p-4 text-[15px] text-suave">Nenhuma dose prevista para hoje.</p>}
        {slots.map(({ s, st }, k) => {
          const ap = base.aplicacoes.find((a) => a.itemId === s.itemId && a.previsto === s.chave)
          return (
            <LinhaDose
              key={s.chave + s.itemId}
              k={k}
              s={s}
              st={st}
              ap={ap}
              prot={base.protocolos.find((p) => p.id === s.protocoloId)}
              nome={nomeSubstancia(s.substanciaId, base.subs)}
              dose={st === 'feita' && ap ? textoDoRegistro(base, ap) : doseTexto(base, s)}
              semFrasco={(st === 'pendente' || st === 'atrasada') && semFrascoIds.has(s.itemId)}
              clicar={() => clicarDose(s, st)}
            />
          )
        })}
        {avulsas.map(({ item: a, saindo }) => (
          <LinhaAvulsa key={a.id} a={a} saindo={saindo} dose={textoDoRegistro(base, a)} nome={nomeSubstancia(a.substanciaId, base.subs)} prot={base.protocolos.find((p) => p.id === a.protocoloId)} abrir={() => abrir({ tipo: 'opcoes', aplicacaoId: a.id })} />
        ))}
      </section>

      <SuaSemana semana={painel.semana} hoje={hoje} base={base} abrirDia={setDiaAberto} />

      <Atencao
        alertas={painel.alertas}
        base={base}
        hoje={hoje}
        abrirFrasco={(f) => setDialogo({ frasco: f })}
        abrirOntem={(doses) => (doses.length === 1 ? abrir({ tipo: 'atrasada', slot: doses[0] }) : setDiaAberto(somaDias(hoje, -1)))}
      >
        {mostrarN73 && (
          <div role="status" className="flex flex-col gap-2 rounded-xl bg-aviso-fundo p-4">
            <span className="text-sm font-semibold text-aviso-texto">Seu último backup foi há {diasBackup} dias. Salve uma cópia para não perder seus registros.</span>
            <div className="flex gap-2">
              <button type="button" className="btn-texto flex-1 text-aviso-texto" onClick={() => repo.setConfig('backupAdiadoAte', somaDias(hoje, 7))}>Lembrar depois</button>
              <Link to="/ajustes/backup" className="btn-primario h-11 flex-1">Fazer backup</Link>
            </div>
          </div>
        )}
      </Atencao>

      <ProximasDoses grupos={painel.proximas} base={base} hoje={hoje} />

      <Atalhos peso={painel.peso} estoque={painel.estoque} base={base} />

      {mostrarSemBackup && (
        <button type="button" onClick={() => setDialogo('backup')} className="card flex min-h-11 items-center px-4 py-3 text-left text-sm font-semibold text-suave">
          Ainda sem backup ·<b className="ml-1 text-acento">Fazer agora</b>
        </button>
      )}

      {resumoAberto && (
        <FolhaDia
          r={resumoAberto}
          hoje={hoje}
          base={base}
          fechar={() => setDiaAberto(null)}
          clicar={(d) => {
            setDiaAberto(null)
            clicarDose(d.slot, d.status, d.aplicacaoId)
          }}
        />
      )}
      {dialogo === 'backup' && (
        <Dialogo titulo="Faça seu primeiro backup" aoFechar={() => setDialogo(null)}>
          <p className="m-0 text-[15px] leading-relaxed text-suave">Seus registros existem só neste aparelho. Se você apagar o app, limpar os dados do navegador ou perder o celular sem um backup, eles não voltam.</p>
          <p className="m-0 text-[15px] text-suave">Leva menos de um minuto. Guarde o arquivo num lugar só seu.</p>
          <button type="button" className="btn-primario" onClick={() => nav('/ajustes/backup')}>Fazer backup agora</button>
          <BotaoAcao className="btn-texto" acao={async () => { await repo.setConfig('backupAdiadoAte', somaDias(hoje, 1)); setDialogo(null) }}>Lembrar amanhã</BotaoAcao>
        </Dialogo>
      )}
      {typeof dialogo === 'object' && dialogo !== null && (
        <FrascoVencido frasco={dialogo.frasco} base={base} aoFechar={() => setDialogo(null)} manter={() => setDialogo(null)} />
      )}
      {dialogo === 'pre' && (
        <PrePermissao
          aoFechar={() => setDialogo(null)}
          aoTerminar={(r) => {
            if (r === 'ativado') {
              setDialogo(null)
              toast({ titulo: 'Avisos ativados', texto: 'Neste aparelho' })
            } else setDialogo('bloq')
          }}
        />
      )}
      {dialogo === 'bloq' && <AvisosBloqueados aoFechar={() => { setDialogo(null); void repo.delConfig('reativarAvisos') }} />}
    </Tela>
  )
}

function ProximaDose({ trocou, atrasada, horario, nome, dose, registrar }: { trocou: boolean; atrasada: boolean; horario: string; nome: string; dose: string; registrar: () => void }) {
  return (
    <div className={`flex flex-col gap-4 rounded-2xl bg-acento p-5 text-sobre-acento ${trocou ? 'anima-troca' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold tracking-wide text-acento-escuro uppercase">{atrasada ? 'Dose atrasada' : 'Próxima dose'}</span>
        <span className="rounded-full bg-sup px-2.5 py-1 text-[13px] font-bold text-acento">{horario}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[26px] leading-tight font-extrabold break-words">{nome}</span>
        <span className="text-[15px] font-medium text-acento-escuro">{dose}</span>
      </div>
      <button type="button" className="btn h-12 bg-sup text-acento" onClick={registrar}>Registrar dose</button>
    </div>
  )
}

/** Ícone do estado de uma dose (sempre junto de um texto). */
function IconeStatus({ st, mudou = false }: { st: StatusSlot | 'futura'; mudou?: boolean }) {
  if (st === 'feita') return <CheckAnimado tam={32} festa={mudou} animar={mudou} />
  if (st === 'pulada') return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sup2 text-erro"><IcoX tam={16} /></span>
  return <span className={`h-8 w-8 rounded-full border-2 ${st === 'atrasada' ? 'border-aviso' : 'border-borda'} ${st === 'futura' ? 'border-dashed' : ''}`} aria-hidden="true" />
}

/** Cartão de uma dose do dia. Quando o estado muda (registrar, desfazer), o ícone e o texto trocam com animação. */
function LinhaDose({ k, s, st, ap, prot, nome, dose, semFrasco, clicar }: { k: number; s: Slot; st: StatusSlot; ap?: Aplicacao; prot?: Protocolo; nome: string; dose: string; semFrasco: boolean; clicar: () => void }) {
  const mudou = useMudou(st)
  const recente = useRecente(ap?.id)
  return (
    <button type="button" onClick={clicar} data-estado={st} style={{ '--i': k, ...bordaCor(prot) } as CSSProperties} className={`card tocavel anima-entrada flex min-h-[64px] items-center gap-3.5 border-l-[5px] px-4 py-3 text-left ${recente && st === 'feita' ? 'anima-brilho' : ''}`}>
      <span key={st} className={`flex h-8 w-8 shrink-0 items-center justify-center ${mudou && st !== 'feita' ? 'anima-troca' : ''}`}>
        <IconeStatus st={st} mudou={mudou} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold break-words">{nome}</span>
        <span key={st} className={`text-[13px] font-semibold ${mudou ? 'anima-texto' : ''} ${st === 'atrasada' ? 'text-aviso' : st === 'pulada' ? 'text-erro' : st === 'feita' ? 'text-ok' : 'text-fraco'}`}>
          {st === 'feita' && ap ? `✓ Tomada às ${horaDe(new Date(ap.dataHora))} · ${dose}` : st === 'pulada' ? '✕ Não feita' : st === 'atrasada' ? `${dose} · atrasada` : `${dose} · pendente`}
        </span>
        {semFrasco && (
          <span className="mt-0.5 flex items-center gap-1 self-start rounded-full bg-aviso-fundo px-2 py-0.5 text-xs font-bold text-aviso-texto"><IcoAlerta tam={12} /> Sem frasco no estoque</span>
        )}
      </span>
      <span className="text-sm font-bold">{s.horario}</span>
    </button>
  )
}

/** Registro de hoje fora dos horários previstos (avulso ou de um horário antigo). */
function LinhaAvulsa({ a, saindo, dose, nome, prot, abrir }: { a: Aplicacao; saindo: boolean; dose: string; nome: string; prot?: Protocolo; abrir: () => void }) {
  const recente = useRecente(a.id)
  return (
    <button type="button" onClick={abrir} disabled={saindo} style={bordaCor(prot)} className={`card tocavel flex min-h-[64px] items-center gap-3.5 border-l-[5px] px-4 py-3 text-left ${saindo ? 'anima-sai' : recente ? 'anima-nova anima-brilho' : 'anima-entrada'}`}>
      {a.status === 'feita' ? (
        <CheckAnimado tam={32} festa={recente} animar={recente} />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sup2 text-erro"><IcoX tam={16} /></span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold break-words">{nome}</span>
        <span className={`text-[13px] font-semibold ${a.status === 'feita' ? 'text-ok' : 'text-erro'}`}>
          {a.status === 'feita' ? `✓ Tomada · ${dose}` : '✕ Não feita'} · {a.previsto ? 'horário antigo' : 'registro avulso'}
        </span>
      </span>
      <span className="text-sm font-bold">{horaDe(new Date(a.dataHora))}</span>
    </button>
  )
}

// ---------- Sua semana ----------

const SEMANA_3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "9 a 15 de nov" / "28 de dez a 3 de jan" */
function intervaloSemana(a: string, b: string): string {
  const [da, db] = [dataDiaMes(a).split('/'), dataDiaMes(b).split('/')]
  return da[1] === db[1] ? `${da[0]} a ${db[0]} de ${db[1]}` : `${da[0]} de ${da[1]} a ${db[0]} de ${db[1]}`
}

/** Texto completo do dia para leitor de tela e para a folha: "2 previstas · 1 tomada · 1 sem registro". */
function contagemDia(r: ResumoDia, hoje: string): string {
  if (r.previstas === 0) return 'Nenhuma dose prevista'
  const partes = [plural(r.previstas, 'prevista', 'previstas')]
  if (r.dia <= hoje) partes.push(plural(r.feitas, 'tomada', 'tomadas'))
  if (r.puladas) partes.push(plural(r.puladas, 'não feita', 'não feitas'))
  if (r.semRegistro) partes.push(`${r.semRegistro} sem registro`)
  if (r.aFazer && r.dia <= hoje) partes.push(plural(r.aFazer, 'a fazer', 'a fazer'))
  return partes.join(' · ')
}

function SuaSemana({ semana, hoje, base, abrirDia }: { semana: ResumoSemana; hoje: string; base: Base; abrirDia: (dia: string) => void }) {
  const dias = semana.dias
  return (
    <section aria-labelledby="t-semana" className="anima-entrada flex flex-col gap-2.5" style={{ '--i': 2 } as CSSProperties}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="t-semana" className="text-[17px] font-bold">Sua semana</h2>
        <span className="text-[13px] font-semibold text-fraco">{intervaloSemana(dias[0].dia, dias[6].dia)}</span>
      </div>
      <div className="-mx-2 grid grid-cols-7 gap-0.5">
        {dias.map((r) => (
          <CelulaDia key={r.dia} r={r} hoje={hoje} base={base} abrir={() => abrirDia(r.dia)} />
        ))}
      </div>
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-suave">
        {semana.previstas === 0 ? (
          <span>Nenhuma dose prevista nesta semana.</span>
        ) : (
          <span>
            <b className="text-texto"><NumeroAnimado valor={semana.feitas} /> de {semana.previstas}</b> {semana.previstas === 1 ? 'dose tomada' : 'doses tomadas'} nesta semana
          </span>
        )}
        {semana.sequencia > 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-fundo px-2.5 py-0.5 text-[13px] font-bold text-ok">
            <IcoCheck tam={13} /> Tudo feito nos últimos {semana.sequencia} dias de dose
          </span>
        )}
      </p>
    </section>
  )
}

function CelulaDia({ r, hoje, base, abrir }: { r: ResumoDia; hoje: string; base: Base; abrir: () => void }) {
  const ehHoje = r.dia === hoje
  const futuro = r.dia > hoje
  const completo = r.previstas > 0 && r.feitas === r.previstas
  const mudou = useMudou(`${r.feitas}/${r.previstas}`)
  const cores = r.protocolos.slice(0, 3).map((id) => base.protocolos.find((p) => p.id === id))
  const status =
    r.previstas === 0 ? (
      <span className="text-[13px] font-bold text-fraco">–</span>
    ) : futuro ? (
      <span className="flex items-center gap-0.5 text-xs font-bold text-fraco"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-current" />{r.previstas}</span>
    ) : completo ? (
      <span className="flex items-center gap-0.5 text-xs font-bold text-ok"><IcoCheck tam={12} />{r.feitas}/{r.previstas}</span>
    ) : (
      <span className={`flex items-center gap-0.5 text-xs font-bold ${r.semRegistro ? 'text-aviso' : 'text-suave'}`}><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-[1.5px] border-current" />{r.feitas}/{r.previstas}</span>
    )
  return (
    <button
      type="button"
      onClick={abrir}
      aria-current={ehHoje ? 'date' : undefined}
      aria-label={`${ehHoje ? 'Hoje, ' : ''}${dataLonga(r.dia)}: ${contagemDia(r, hoje).toLowerCase()}`}
      className={`tocavel flex min-h-[88px] min-w-0 flex-col items-center justify-between gap-1 rounded-xl border px-0.5 py-2 ${ehHoje ? 'border-acento bg-selecionado' : 'border-linha bg-sup'}`}
    >
      <span className={`text-[11px] font-bold uppercase ${ehHoje ? 'text-acento' : 'text-fraco'}`}>{ehHoje ? 'hoje' : SEMANA_3[parseDia(r.dia).getDay()]}</span>
      <span className={`text-[17px] leading-none font-extrabold ${futuro || ehHoje ? 'text-texto' : 'text-suave'}`}>{parseDia(r.dia).getDate()}</span>
      <span aria-hidden="true" className="flex h-1.5 items-center gap-0.5">
        {cores.map((p, k) => <PontoCor key={k} protocolo={p} tam={6} />)}
      </span>
      <span key={mudou ? `${r.feitas}/${r.previstas}` : 'x'} className={mudou ? 'anima-troca' : ''}>{status}</span>
    </button>
  )
}

/** M10 Doses de um dia (tocar num dia da semana ou no aviso de ontem). Dias passados registram pelo fluxo de dose atrasada. */
function FolhaDia({ r, hoje, base, fechar, clicar }: { r: ResumoDia; hoje: string; base: Base; fechar: () => void; clicar: (d: DoseDoDia) => void }) {
  const rel = difDias(hoje, r.dia)
  const titulo = rel === 0 ? 'Hoje' : rel === 1 ? 'Amanhã' : rel === -1 ? 'Ontem' : dataLonga(r.dia).split(',')[0]
  return (
    <Sheet titulo={`${titulo}, ${dataCurta(r.dia)}`} sub={contagemDia(r, hoje)} aoFechar={fechar}>
      {r.previstas === 0 && <p className="m-0 card p-4 text-[15px] text-suave">Nenhuma dose prevista neste dia.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {r.doses.map((d) => (
          <li key={d.slot.chave + d.slot.itemId}>
            <LinhaDoDia d={d} hoje={hoje} base={base} clicar={() => clicar(d)} />
          </li>
        ))}
      </ul>
      {r.dia < hoje && r.semRegistro > 0 && <p className="m-0 text-[13px] text-fraco">Toque numa dose sem registro para dizer o que aconteceu. O app só guarda o que você informar.</p>}
      {r.dia <= hoje && r.previstas > 0 && <Link to="/historico" onClick={fechar} className="link self-start">Ver histórico do mês</Link>}
    </Sheet>
  )
}

function LinhaDoDia({ d, hoje, base, clicar }: { d: DoseDoDia; hoje: string; base: Base; clicar: () => void }) {
  const ap = d.aplicacaoId ? base.aplicacoes.find((a) => a.id === d.aplicacaoId) : undefined
  const prot = base.protocolos.find((p) => p.id === d.slot.protocoloId)
  const dose = doseTexto(base, d.slot)
  const texto =
    d.status === 'feita' && ap
      ? `✓ Tomada às ${horaDe(new Date(ap.dataHora))} · ${textoDoRegistro(base, ap)}`
      : d.status === 'pulada'
        ? '✕ Não feita'
        : d.status === 'atrasada'
          ? d.slot.dia < hoje
            ? `${dose} · sem registro`
            : `${dose} · atrasada`
          : d.status === 'futura'
            ? `${dose} · prevista`
            : `${dose} · pendente`
  const cor = d.status === 'feita' ? 'text-ok' : d.status === 'pulada' ? 'text-erro' : d.status === 'atrasada' ? 'text-aviso' : 'text-fraco'
  const conteudo = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center"><IconeStatus st={d.status} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold break-words">{nomeSubstancia(d.slot.substanciaId, base.subs)}</span>
        <span className={`text-[13px] font-semibold ${cor}`}>{texto}</span>
      </span>
      <span className="text-sm font-bold">{d.slot.horario}</span>
    </>
  )
  const cls = 'card flex min-h-[60px] w-full items-center gap-3.5 border-l-[5px] px-4 py-2.5 text-left'
  if (d.status === 'futura') return <div style={bordaCor(prot)} className={cls}>{conteudo}</div>
  return <button type="button" onClick={clicar} style={bordaCor(prot)} className={`${cls} tocavel`}>{conteudo}</button>
}

// ---------- Atenção ----------

function CartaoAviso({ tom, icone, titulo, texto, acao, para, onClick, prot }: { tom: 'aviso' | 'neutro'; icone: ReactNode; titulo: string; texto: string; acao: string; para?: string; onClick?: () => void; prot?: Protocolo }) {
  const aviso = tom === 'aviso'
  const cls = `tocavel flex min-h-[60px] w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${aviso ? 'bg-aviso-fundo' : 'card border-l-[5px]'}`
  const corpo = (
    <>
      <span className={`shrink-0 ${aviso ? 'text-aviso' : 'text-acento'}`}>{icone}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-sm font-bold ${aviso ? 'text-aviso-texto' : ''}`}>{titulo}</span>
        <span className={`text-[13px] ${aviso ? 'text-aviso-texto' : 'text-fraco'}`}>{texto}</span>
      </span>
      <span className={`flex shrink-0 items-center text-[13px] font-bold ${aviso ? 'text-aviso' : 'text-acento'}`}>{acao}<IcoSeta tam={16} /></span>
    </>
  )
  const estilo = !aviso ? bordaCor(prot) : undefined
  if (para) return <Link to={para} style={estilo} className={cls}>{corpo}</Link>
  return <button type="button" onClick={onClick} style={estilo} className={cls}>{corpo}</button>
}

function Atencao({ alertas, base, hoje, abrirFrasco, abrirOntem, children }: { alertas: Alerta[]; base: Base; hoje: string; abrirFrasco: (f: Frasco) => void; abrirOntem: (doses: Slot[]) => void; children?: ReactNode }) {
  const temFilhos = Array.isArray(children) ? children.some(Boolean) : !!children
  if (!alertas.length && !temFilhos) return null
  const prot = (id: string) => base.protocolos.find((p) => p.id === id)
  const sub = (id: string) => nomeSubstancia(id, base.subs)
  return (
    <section aria-labelledby="t-atencao" className="anima-entrada flex flex-col gap-2.5" style={{ '--i': 3 } as CSSProperties}>
      <h2 id="t-atencao" className="text-[17px] font-bold">Atenção</h2>
      {alertas.map((a) => {
        switch (a.tipo) {
          case 'ontem': {
            const um = a.doses.length === 1
            const s = a.doses[0]
            return (
              <CartaoAviso
                key="ontem"
                tom="neutro"
                prot={um ? prot(s.protocoloId) : undefined}
                icone={<IcoCalendario tam={22} />}
                titulo={um ? `Ontem às ${s.horario} · ${sub(s.substanciaId)}` : `Ontem: ${a.doses.length} doses sem registro`}
                texto={um ? 'Sem registro. Diga o que aconteceu.' : 'Veja o dia e diga o que aconteceu.'}
                acao={um ? 'Registrar' : 'Ver'}
                onClick={() => abrirOntem(a.doses)}
              />
            )
          }
          case 'vencimento': {
            const f = base.frascos.find((x) => x.id === a.frascoId)
            if (!f) return null
            const titulo = a.dias < 0 ? `Frasco de ${sub(a.substanciaId)} passou da data` : a.dias === 0 ? `Frasco de ${sub(a.substanciaId)} vence hoje` : `Frasco de ${sub(a.substanciaId)} vence em ${plural(a.dias, 'dia', 'dias')}`
            return <CartaoAviso key={'v' + a.frascoId} tom="aviso" icone={<IcoAlerta tam={22} />} titulo={titulo} texto="Você decide: descartar, manter ou corrigir a data." acao="Decidir" onClick={() => abrirFrasco(f)} />
          }
          case 'acabando':
            return (
              <CartaoAviso
                key={'a' + a.frascoId}
                tom="aviso"
                icone={<IcoEstoque tam={22} />}
                titulo={a.doses === null ? `Frasco de ${sub(a.substanciaId)} está acabando` : a.doses === 0 ? `Frasco de ${sub(a.substanciaId)}: menos de 1 dose` : `Frasco de ${sub(a.substanciaId)}: ${plural(a.doses, 'dose restante', 'doses restantes')}`}
                texto="Nenhum outro frasco desta substância no Estoque."
                acao="Adicionar"
                para={`/estoque/frasco/novo?sub=${a.substanciaId}&item=${a.itemId}`}
              />
            )
          case 'sem-frasco': {
            const p = prot(a.protocoloId)
            const varias = base.itens.filter((x) => x.protocoloId === a.protocoloId).length > 1
            return (
              <Link key={'s' + a.itemId} to={`/estoque/frasco/novo?sub=${a.substanciaId}&item=${a.itemId}`} style={bordaCor(p)} className="card tocavel flex min-h-[52px] items-center gap-3 border-l-[5px] px-4 py-3">
                <IcoEstoque tam={22} className="shrink-0 text-acento" />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-bold">Adicione o frasco para acompanhar o estoque</span>
                  <span className="text-[13px] text-fraco">{p ? nomeProtocolo(p, base.itens, base.subs) : ''}{varias ? ` · ${sub(a.substanciaId)}` : ''} · sem frasco no estoque</span>
                </span>
                <IcoSeta tam={18} className="text-acento" />
              </Link>
            )
          }
          case 'termina': {
            const p = prot(a.protocoloId)
            if (!p) return null
            const quando = a.dias === 0 ? 'hoje' : a.dias === 1 ? 'amanhã' : diaRelativo(a.fim, hoje).toLowerCase()
            return (
              <CartaoAviso key={'t' + a.protocoloId} tom="neutro" prot={p} icone={<IcoProtocolos tam={22} />} titulo={`${nomeProtocolo(p, base.itens, base.subs)} termina ${quando}`} texto={`Último dia: ${dataCurta(a.fim)}`} acao="Ver" para={`/protocolos/${p.id}`} />
            )
          }
        }
      })}
      {children}
    </section>
  )
}

// ---------- Próximas doses ----------

function ProximasDoses({ grupos, base, hoje }: { grupos: { dia: string; doses: Slot[] }[]; base: Base; hoje: string }) {
  if (!grupos.length) return null
  return (
    <section aria-labelledby="t-proximas" className="anima-entrada flex flex-col gap-2" style={{ '--i': 4 } as CSSProperties}>
      <div className="flex items-center justify-between">
        <h2 id="t-proximas" className="text-[17px] font-bold">Próximas doses</h2>
        <Link to="/protocolos" className="link px-1">Ver tudo</Link>
      </div>
      <div className="card flex flex-col overflow-hidden">
        {grupos.map((g) => (
          <div key={g.dia} className="flex flex-col border-t border-sup2 first:border-t-0">
            <span className="px-4 pt-2.5 text-[13px] font-bold text-fraco">{difDias(hoje, g.dia) === 1 ? 'Amanhã' : dataLonga(g.dia).split(',')[0]} · {dataCurta(g.dia)}</span>
            {g.doses.map((s) => {
              const p = base.protocolos.find((x) => x.id === s.protocoloId)
              return (
                <Link key={s.chave + s.itemId} to={`/protocolos/${s.protocoloId}`} className="tocavel flex min-h-[48px] items-center gap-3 px-4">
                  <span className="w-12 shrink-0 text-sm font-bold tabular-nums">{s.horario}</span>
                  <PontoCor protocolo={p} tam={10} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{nomeSubstancia(s.substanciaId, base.subs)}</span>
                  <span className="max-w-[48%] text-right text-[13px] text-fraco">{doseTexto(base, s)}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------- Atalhos: peso e estoque ----------

function Atalhos({ peso, estoque, base }: { peso: ReturnType<typeof resumoPeso>; estoque: ReturnType<typeof resumoEstoquePainel>; base: Base }) {
  const kg = (v: number) => `${fmtNum(v, 1)} kg`
  const variacao = !peso ? '' : peso.registros < 2 ? `registrado em ${dataDiaMes(peso.ultimo.data)}` : peso.variacao === 0 ? `igual a ${dataDiaMes(peso.primeiro.data)}` : `${peso.variacao > 0 ? '+' : '−'}${kg(Math.abs(peso.variacao))} desde ${dataDiaMes(peso.primeiro.data)}`
  const perto = estoque.maisPerto
  return (
    <section aria-labelledby="t-atalhos" className="anima-entrada flex flex-col gap-2.5" style={{ '--i': 5 } as CSSProperties}>
      <h2 id="t-atalhos" className="text-[17px] font-bold">Peso e estoque</h2>
      <div className="card flex flex-col">
        <div className="flex items-center gap-1 border-b border-sup2 pr-2">
          <Link to="/peso" className="tocavel flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5">
            <IcoPeso tam={22} className="shrink-0 text-acento" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{peso ? kg(peso.ultimo.kg) : 'Peso'}</span>
              <span className="text-[13px] text-fraco">{peso ? variacao : 'Nenhum peso registrado'}</span>
            </span>
          </Link>
          <Link to="/peso/medicao/nova" className="tocavel flex h-11 shrink-0 items-center gap-1 rounded-full border border-borda px-3 text-sm font-bold text-acento">
            <IcoMais tam={16} /> Registrar
          </Link>
        </div>
        <Link to="/estoque" className="tocavel flex min-h-[60px] items-center gap-3 px-4 py-2.5">
          <IcoEstoque tam={22} className="shrink-0 text-acento" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{estoque.emUso === 0 ? 'Nenhum frasco em uso' : plural(estoque.emUso, 'frasco em uso', 'frascos em uso')}</span>
            {perto && <span className="text-[13px] text-fraco">{nomeSubstancia(perto.substanciaId, base.subs)}: {perto.doses === 0 ? 'menos de 1 dose' : plural(perto.doses, 'dose restante', 'doses restantes')}</span>}
          </span>
          <IcoSeta tam={18} className="text-acento" />
        </Link>
      </div>
    </section>
  )
}
