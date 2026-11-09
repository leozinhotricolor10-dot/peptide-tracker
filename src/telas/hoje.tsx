// T10 Hoje, E10 Hoje vazio, N73 backup atrasado, M66 primeiro backup, N06 reativar avisos, alertas de frasco.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { repo, useBase, useConfig, type Base } from '../dados/index.ts'
import { proximosSlots, slotsDoDia, statusSlot, type Slot, type StatusSlot } from '../dominio/agenda.ts'
import { dataLonga, diaDe, diaRelativo, difDias, horaDe, somaDias } from '../dominio/datas.ts'
import { LIMITE_ACABANDO, dataLimite, fmtDose, saldoFrasco } from '../dominio/calculos.ts'
import { nomeSubstancia } from '../dominio/nomes.ts'
import type { Frasco } from '../dominio/tipos.ts'
import { Carregando, Dialogo, Tela, Vazio } from '../ui/base.tsx'
import { IcoAlerta, IcoCheck, IcoEngrenagem, IcoProtocolos, IcoSeta, IcoSino, IcoX } from '../ui/icones.tsx'
import { FrascoVencido, useDoseUI } from './dose.tsx'
import { PrePermissao, AvisosBloqueados } from './inicio.tsx'
import { useToast } from '../ui/toast.tsx'

export const DIAS_AVISO_VENCIMENTO = 14

function useAgora(intervalo = 30000) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), intervalo)
    return () => window.clearInterval(t)
  }, [intervalo])
  return agora
}

function CabecalhoHoje({ hoje }: { hoje: string }) {
  return (
    <div className="flex items-end justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-fraco">{dataLonga(hoje)}</span>
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Hoje</h1>
      </div>
      <Link to="/ajustes" aria-label="Configurações" className="icone-btn border border-linha bg-sup"><IcoEngrenagem tam={22} /></Link>
    </div>
  )
}

function doseTexto(base: Base, s: Slot): string {
  const it = base.itens.find((i) => i.id === s.itemId)
  return it ? fmtDose(it.doseValor, it.doseUnidade) : ''
}

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

  if (!base || !ultimoBackup.carregado) return <Tela><CabecalhoHoje hoje={hoje} /><Carregando /></Tela>

  if (base.protocolos.length === 0) {
    return (
      <Tela>
        <CabecalhoHoje hoje={hoje} />
        <Vazio icone={<IcoProtocolos tam={30} />} titulo="Nada para hoje ainda" texto="Cadastre o protocolo que você já segue. As doses do dia aparecem aqui, com um botão para registrar.">
          <Link to="/novo" className="btn-primario">Criar protocolo</Link>
          <Link to="/restaurar" className="btn-texto">Tenho um backup</Link>
        </Vazio>
      </Tela>
    )
  }

  const slots = slotsDoDia(base.protocolos, base.itens, hoje).map((s) => ({ s, st: statusSlot(s, base.aplicacoes, agora) }))
  const feitas = slots.filter((x) => x.st === 'feita').length
  const proxHoje = slots.find((x) => x.st === 'pendente') ?? slots.find((x) => x.st === 'atrasada')
  const futura = proxHoje ? undefined : proximosSlots(base.protocolos, base.itens, new Date(somaDias(hoje, 1) + 'T00:00:00'), 1)[0]

  const clicar = (s: Slot, st: StatusSlot) => {
    if (st === 'atrasada') abrir({ tipo: 'atrasada', slot: s })
    else if (st === 'pendente') abrir({ tipo: 'registrar', itemId: s.itemId, slot: s })
    else {
      const ap = base.aplicacoes.find((a) => a.itemId === s.itemId && a.previsto === s.chave)
      if (ap) abrir({ tipo: 'opcoes', aplicacaoId: ap.id })
    }
  }

  // alertas de frasco (vencendo/vencido e acabando)
  const alertas: { f: Frasco; texto: string }[] = []
  for (const f of base.frascos) {
    if (f.status !== 'fechado' && f.status !== 'reconstituido') continue
    const nome = nomeSubstancia(f.substanciaId, base.subs)
    const lim = dataLimite(f)
    if (lim) {
      const d = difDias(hoje, lim)
      if (d < 0) alertas.push({ f, texto: `Frasco de ${nome} passou da data` })
      else if (d <= DIAS_AVISO_VENCIMENTO) alertas.push({ f, texto: d === 0 ? `Frasco de ${nome} vence hoje` : `Frasco de ${nome} vence em ${d} dia${d > 1 ? 's' : ''}` })
    }
    const s = saldoFrasco(f, base.aplicacoes)
    if (f.mgTotal > 0 && s.dosesFeitas > 0 && s.mgRestante / f.mgTotal <= LIMITE_ACABANDO) alertas.push({ f, texto: `Frasco de ${nome} está acabando` })
  }

  const diasBackup = ultimoBackup.valor ? difDias(diaDe(new Date(ultimoBackup.valor)), hoje) : null
  const adiadoAtivo = !!adiado.valor && adiado.valor > hoje
  const mostrarN73 = diasBackup !== null && diasBackup > 30 && !adiadoAtivo
  const mostrarSemBackup = diasBackup === null && !adiadoAtivo

  return (
    <Tela>
      <CabecalhoHoje hoje={hoje} />

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
        <div className="flex flex-col gap-4 rounded-2xl bg-acento p-5 text-sobre-acento">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold tracking-wide text-acento-escuro uppercase">{proxHoje.st === 'atrasada' ? 'Dose atrasada' : 'Próxima dose'}</span>
            <span className="rounded-full bg-sup px-2.5 py-1 text-[13px] font-bold text-acento">{proxHoje.s.horario}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[26px] leading-tight font-extrabold break-words">{nomeSubstancia(proxHoje.s.substanciaId, base.subs)}</span>
            <span className="text-[15px] font-medium text-acento-escuro">{doseTexto(base, proxHoje.s)}</span>
          </div>
          <button type="button" className="btn h-12 bg-sup text-acento" onClick={() => clicar(proxHoje.s, proxHoje.st)}>Registrar dose</button>
        </div>
      ) : futura ? (
        <div className="card flex flex-col gap-1 p-5">
          <span className="text-[13px] font-bold tracking-wide text-fraco uppercase">Próxima dose</span>
          <span className="text-xl font-extrabold">{nomeSubstancia(futura.substanciaId, base.subs)}</span>
          <span className="text-[15px] text-suave">{diaRelativo(futura.dia, hoje)} às {futura.horario} · {doseTexto(base, futura)}</span>
        </div>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">Doses de hoje</h2>
          {slots.length > 0 && <span className="text-[13px] font-semibold text-fraco">{feitas} de {slots.length}</span>}
        </div>
        {slots.length === 0 && <p className="m-0 card p-4 text-[15px] text-suave">Nenhuma dose prevista para hoje.</p>}
        {slots.map(({ s, st }) => {
          const ap = base.aplicacoes.find((a) => a.itemId === s.itemId && a.previsto === s.chave)
          return (
            <button key={s.chave + s.itemId} type="button" onClick={() => clicar(s, st)} className="card flex min-h-[64px] items-center gap-3.5 px-4 py-3 text-left">
              {st === 'feita' ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok-fundo text-ok"><IcoCheck tam={18} /></span>
              ) : st === 'pulada' ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sup2 text-erro"><IcoX tam={16} /></span>
              ) : (
                <span className={`h-8 w-8 shrink-0 rounded-full border-2 ${st === 'atrasada' ? 'border-aviso' : 'border-borda'}`} aria-hidden="true" />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-bold break-words">{nomeSubstancia(s.substanciaId, base.subs)}</span>
                <span className={`text-[13px] font-semibold ${st === 'atrasada' ? 'text-aviso' : st === 'pulada' ? 'text-erro' : st === 'feita' ? 'text-ok' : 'text-fraco'}`}>
                  {st === 'feita' && ap ? `✓ Tomada às ${horaDe(new Date(ap.dataHora))} · ${fmtDose(ap.doseValor, ap.doseUnidade)}` : st === 'pulada' ? '✕ Não feita' : st === 'atrasada' ? `${doseTexto(base, s)} · atrasada` : `${doseTexto(base, s)} · pendente`}
                </span>
              </span>
              <span className="text-sm font-bold">{s.horario}</span>
            </button>
          )
        })}
        {base.aplicacoes
          .filter((a) => diaDe(new Date(a.dataHora)) === hoje && !slots.some((x) => x.s.itemId === a.itemId && x.s.chave === a.previsto))
          .sort((a, b) => a.dataHora.localeCompare(b.dataHora))
          .map((a) => (
            <button key={a.id} type="button" onClick={() => abrir({ tipo: 'opcoes', aplicacaoId: a.id })} className="card flex min-h-[64px] items-center gap-3.5 px-4 py-3 text-left">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.status === 'feita' ? 'bg-ok-fundo text-ok' : 'bg-sup2 text-erro'}`}>
                {a.status === 'feita' ? <IcoCheck tam={18} /> : <IcoX tam={16} />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-bold break-words">{nomeSubstancia(a.substanciaId, base.subs)}</span>
                <span className={`text-[13px] font-semibold ${a.status === 'feita' ? 'text-ok' : 'text-erro'}`}>
                  {a.status === 'feita' ? `✓ Tomada · ${fmtDose(a.doseValor, a.doseUnidade)}` : '✕ Não feita'} · {a.previsto ? 'horário antigo' : 'registro avulso'}
                </span>
              </span>
              <span className="text-sm font-bold">{horaDe(new Date(a.dataHora))}</span>
            </button>
          ))}
      </section>

      {alertas.map((a, i) => (
        <button key={a.f.id + i} type="button" onClick={() => setDialogo({ frasco: a.f })} className="flex min-h-[52px] items-center gap-3 rounded-xl bg-aviso-fundo px-4 py-3 text-left">
          <IcoAlerta tam={22} className="shrink-0 text-aviso" />
          <span className="flex-1 text-sm font-semibold text-aviso-texto">{a.texto}</span>
          <IcoSeta tam={18} className="text-aviso" />
        </button>
      ))}

      {mostrarN73 && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-aviso-fundo p-4">
          <span className="text-sm font-semibold text-aviso-texto">Seu último backup foi há {diasBackup} dias. Salve uma cópia para não perder seus registros.</span>
          <div className="flex gap-2">
            <button type="button" className="btn-texto flex-1 text-aviso-texto" onClick={() => repo.setConfig('backupAdiadoAte', somaDias(hoje, 7))}>Lembrar depois</button>
            <Link to="/ajustes/backup" className="btn-primario h-11 flex-1">Fazer backup</Link>
          </div>
        </div>
      )}
      {mostrarSemBackup && (
        <button type="button" onClick={() => setDialogo('backup')} className="card flex min-h-11 items-center px-4 py-3 text-left text-sm font-semibold text-suave">
          Ainda sem backup ·<b className="ml-1 text-acento">Fazer agora</b>
        </button>
      )}

      {dialogo === 'backup' && (
        <Dialogo titulo="Faça seu primeiro backup" aoFechar={() => setDialogo(null)}>
          <p className="m-0 text-[15px] leading-relaxed text-suave">Seus registros existem só neste aparelho. Se você apagar o app, limpar os dados do navegador ou perder o celular sem um backup, eles não voltam.</p>
          <p className="m-0 text-[15px] text-suave">Leva menos de um minuto. Guarde o arquivo num lugar só seu.</p>
          <button type="button" className="btn-primario" onClick={() => nav('/ajustes/backup')}>Fazer backup agora</button>
          <button type="button" className="btn-texto" onClick={async () => { await repo.setConfig('backupAdiadoAte', somaDias(hoje, 1)); setDialogo(null) }}>Lembrar amanhã</button>
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
