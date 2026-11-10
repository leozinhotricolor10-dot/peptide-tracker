// Registro de dose: M31/M35 registrar (simples/blend), M32 atrasada, M33 pular, M34 apagar,
// E51 frasco sem saldo, M51 frasco vencido (ao escolher frasco). Abertos por useDoseUI().
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { repo, useBase, type Base } from '../dados/index.ts'
import type { Slot } from '../dominio/agenda.ts'
import { diaDe, horaDe, instante, dataBr, dataCurta, diaRelativo, hojeStr } from '../dominio/datas.ts'
import { dataLimite, erroNumero, fmtDose, fmtNum, lerNumero, saldoFrasco } from '../dominio/calculos.ts'
import type { Aplicacao, Frasco, UnidadeDose } from '../dominio/tipos.ts'
import { escolherFrasco } from '../dominio/estoque.ts'
import { nomeComMg, nomeSubstancia } from '../dominio/nomes.ts'
import { Chips, Dialogo, Nota, Sheet } from '../ui/base.tsx'
import { IcoAlerta } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'
import { BotaoAcao } from '../ui/acao.tsx'
import { mensagemDeErro, novoId } from '../dados/repo.ts'
import { comOtimismo, marcarRecente, vibrar } from '../ui/movimento.ts'

type Pedido =
  | { tipo: 'registrar'; itemId: string; slot?: Slot; outroHorario?: boolean }
  | { tipo: 'editar'; aplicacaoId: string }
  | { tipo: 'atrasada'; slot: Slot }
  | { tipo: 'pular'; slot: Slot }
  | { tipo: 'opcoes'; aplicacaoId: string }
  | { tipo: 'apagar'; aplicacaoId: string }

const Ctx = createContext<(p: Pedido) => void>(() => {})
export const useDoseUI = () => useContext(Ctx)

export const LOCAIS = ['Abdômen esq.', 'Abdômen dir.', 'Coxa esq.', 'Coxa dir.', 'Braço esq.', 'Braço dir.', 'Outro']
export const UNIDADES: UnidadeDose[] = ['mg', 'mcg', 'UI', 'mL', 'unidades']
export const MOTIVOS = ['Esqueci', 'Sem produto', 'Viagem', 'Decidi não fazer', 'Outro']

function paraInputLocal(d: Date): string {
  return `${diaDe(d)}T${horaDe(d)}`
}

export function descreverFrasco(f: Frasco, base: Base): string {
  const nome = nomeSubstancia(f.substanciaId, base.subs)
  const quando = f.status === 'reconstituido' && f.reconstituidoEm ? `aberto em ${dataCurta(f.reconstituidoEm)}` : f.status === 'fechado' ? 'fechado' : f.status
  return `${nomeComMg(nome, f.mgTotal)} · ${quando}`
}

export function frascoComSaldo(f: Frasco, base: Base): boolean {
  if (f.status !== 'fechado' && f.status !== 'reconstituido') return false
  return saldoFrasco(f, base.aplicacoes).mgRestante > 0
}

export function DoseUIProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const base = useBase()
  const fechar = () => setPedido(null)
  // Mudou de tela (ex.: botão voltar do celular): a folha aberta fecha junto, não fica por cima da outra tela.
  const { pathname } = useLocation()
  useEffect(() => setPedido(null), [pathname])
  return (
    <Ctx.Provider value={setPedido}>
      {children}
      {pedido && base && <Conteudo pedido={pedido} base={base} fechar={fechar} trocar={setPedido} />}
    </Ctx.Provider>
  )
}

function Conteudo({ pedido, base, fechar, trocar }: { pedido: Pedido; base: Base; fechar: () => void; trocar: (p: Pedido) => void }) {
  switch (pedido.tipo) {
    case 'registrar':
      return <Registrar base={base} itemId={pedido.itemId} slot={pedido.slot} outroHorario={pedido.outroHorario} fechar={fechar} trocar={trocar} />
    case 'editar': {
      const ap = base.aplicacoes.find((a) => a.id === pedido.aplicacaoId)
      return ap ? <Registrar base={base} itemId={ap.itemId} edicao={ap} fechar={fechar} trocar={trocar} /> : null
    }
    case 'atrasada':
      return <Atrasada base={base} slot={pedido.slot} fechar={fechar} trocar={trocar} />
    case 'pular':
      return <Pular base={base} slot={pedido.slot} fechar={fechar} trocar={trocar} />
    case 'opcoes':
      return <Opcoes base={base} id={pedido.aplicacaoId} fechar={fechar} trocar={trocar} />
    case 'apagar':
      return <Apagar base={base} id={pedido.aplicacaoId} fechar={fechar} trocar={trocar} />
  }
}

function Registrar({
  base,
  itemId,
  slot,
  edicao,
  outroHorario,
  fechar,
  trocar,
}: {
  base: Base
  itemId: string
  slot?: Slot
  edicao?: Aplicacao
  outroHorario?: boolean
  fechar: () => void
  trocar: (p: Pedido) => void
}) {
  const toast = useToast()
  const nav = useNavigate()
  const item = base.itens.find((i) => i.id === itemId)
  const subId = edicao?.substanciaId ?? item?.substanciaId
  const sub = subId ? base.subs.get(subId) : undefined
  const blend = sub?.tipo === 'blend'
  const nome = sub?.nome ?? 'Dose'
  const frascos = base.frascos.filter((f) => f.substanciaId === subId && (f.status === 'fechado' || f.status === 'reconstituido' || f.id === edicao?.frascoId))

  const ultimo = useMemo(
    () =>
      base.aplicacoes
        .filter((a) => a.substanciaId === subId && a.status === 'feita' && a.id !== edicao?.id)
        .sort((a, b) => b.dataHora.localeCompare(a.dataHora))[0],
    [base.aplicacoes, subId, edicao?.id],
  )
  const frascoPadrao = (() => {
    if (edicao) return edicao.frascoId ?? ''
    // o ligado à linha (ou o último usado) se tem saldo e não venceu; senão o mais antigo não vencido
    if (!subId) return ''
    return escolherFrasco({ substanciaId: subId, preferidos: [item?.frascoId, ultimo?.frascoId], frascos: base.frascos, aplicacoes: base.aplicacoes, hoje: hojeStr() })?.id ?? ''
  })()

  const inicioHora = edicao ? new Date(edicao.dataHora) : outroHorario && slot ? instante(slot.dia, slot.horario) : new Date()
  const [quando, setQuando] = useState(paraInputLocal(inicioHora))
  const [doseTxt, setDoseTxt] = useState(fmtNum(edicao?.doseValor ?? item?.doseValor ?? 0).replace(/\./g, ''))
  const [unidade, setUnidade] = useState<UnidadeDose>(edicao?.doseUnidade ?? item?.doseUnidade ?? 'mg')
  const [local, setLocal] = useState<string | undefined>(edicao?.local)
  const [frascoId, setFrascoId] = useState(frascoPadrao)
  const [obs, setObs] = useState(edicao?.observacao ?? '')
  const [erro, setErro] = useState('')
  const [dialogo, setDialogo] = useState<'sem-saldo' | 'vencido' | null>(null)
  const [vencidoOk, setVencidoOk] = useState(false)
  const [salvando, setSalvando] = useState(false)

  if (!item && !edicao) return null
  const frascoSel = base.frascos.find((f) => f.id === frascoId)
  const limite = frascoSel ? dataLimite(frascoSel) : undefined
  const vencido = !!limite && limite < hojeStr()

  const salvar = async (ignorarVencido = vencidoOk) => {
    const dose = lerNumero(doseTxt)
    if (dose === null || dose <= 0) return setErro(erroNumero(doseTxt, 'Informe a dose aplicada (número maior que zero).'))
    const d = new Date(quando)
    if (!quando || Number.isNaN(d.getTime())) return setErro('Informe a data e a hora.')
    if (d.getTime() > Date.now() + 5 * 60000) return setErro('O horário não pode ser no futuro. Confira a data e a hora.')
    if (vencido && !ignorarVencido) return setDialogo('vencido')
    if (salvando) return
    setSalvando(true)
    // Otimista: a celebração (vibração, aviso com check, destaque na lista) começa no toque, junto
    // com a gravação. Se a gravação falhar, o aviso vira erro e a folha continua aberta com o motivo.
    const id = edicao?.id ?? novoId()
    let gravacao: Promise<Aplicacao> | undefined
    await comOtimismo(
      () =>
        (gravacao = repo.registrarAplicacao({
          id,
          protocoloId: edicao?.protocoloId ?? item!.protocoloId,
          itemId: edicao?.itemId ?? item!.id,
          substanciaId: subId!,
          previsto: edicao ? edicao.previsto : slot?.chave,
          dataHora: d.toISOString(),
          doseValor: dose,
          doseUnidade: unidade,
          local,
          frascoId: frascoId || undefined,
          status: 'feita',
          observacao: obs.trim() || undefined,
        })),
      {
        antes: () => {
          vibrar(edicao ? 10 : 18)
          if (!edicao) marcarRecente(id)
          toast({
            festa: !edicao,
            titulo: edicao ? 'Registro atualizado' : 'Dose registrada',
            texto: `${nome} · ${horaDe(d)}`,
            desfazer: edicao
              ? async () => {
                  await gravacao
                  await repo.restaurarAplicacao(edicao)
                }
              : async () => {
                  await gravacao
                  await repo.apagarAplicacao(id)
                },
          })
        },
        depois: () => fechar(),
        falhou: (e) => {
          setSalvando(false)
          setErro(mensagemDeErro(e))
          toast({ tipo: 'erro', titulo: edicao ? 'Não deu para atualizar' : 'Não deu para registrar a dose', texto: 'Nada foi salvo. O motivo está na folha.' })
        },
      },
    )
  }

  const frascoAcabou = async () => {
    if (frascoSel) {
      try {
        await repo.statusFrasco(frascoSel.id, 'acabou')
      } catch (e) {
        return setErro(mensagemDeErro(e))
      }
    }
    const outro = frascos.find((f) => f.id !== frascoSel?.id && frascoComSaldo(f, base))
    if (outro) {
      setFrascoId(outro.id)
      toast({ tipo: 'info', titulo: 'Frasco marcado como acabado', texto: 'Selecionamos outro frasco com saldo' })
    } else {
      setFrascoId('')
      setDialogo('sem-saldo')
    }
  }

  const titulo = edicao ? 'Editar registro' : 'Registrar dose'
  const sub2 = `${nome}${slot ? ` · dose das ${slot.horario}` : edicao?.previsto ? ` · dose das ${edicao.previsto.slice(11)}` : ''}`

  return (
    <>
      <Sheet titulo={titulo} sub={sub2} aoFechar={fechar}>
        {blend && <Nota>Blend cadastrado por você. Os componentes ficam no cadastro do blend.</Nota>}
        <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-[1.3fr_1fr]">
          <label className="rotulo">
            Horário
            <input type="datetime-local" className="campo" value={quando} onChange={(e) => setQuando(e.target.value)} />
          </label>
          <div className="rotulo">
            <label htmlFor="dose-valor">{blend ? 'Dose do blend' : 'Dose aplicada'}</label>
            <div className="flex gap-1.5">
              <input id="dose-valor" inputMode="decimal" className="campo min-w-0" value={doseTxt} onChange={(e) => { setDoseTxt(e.target.value); setErro('') }} />
              <select aria-label="Unidade" className="campo w-auto shrink-0 px-2 text-sm" value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeDose)}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
        {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-[13px] font-bold text-fraco">Local da aplicação <span className="font-medium">(opcional)</span></legend>
          <Chips rotulo="Local da aplicação" opcoes={LOCAIS.map((l) => ({ v: l, t: l }))} valor={local} aoMudar={(v) => setLocal(local === v ? undefined : v)} />
          {ultimo?.local && (
            <span className="text-[13px] text-fraco">
              Último registrado: {ultimo.local.toLowerCase()}, {diaRelativo(diaDe(new Date(ultimo.dataHora)), hojeStr()).toLowerCase()} {horaDe(new Date(ultimo.dataHora))}.
            </span>
          )}
        </fieldset>
        <label className="rotulo">
          Frasco usado
          <select className="campo text-[15px] font-semibold" value={frascoId} onChange={(e) => { setFrascoId(e.target.value); setVencidoOk(false) }}>
            <option value="">Sem frasco ligado</option>
            {frascos.map((f) => <option key={f.id} value={f.id}>{descreverFrasco(f, base)}</option>)}
          </select>
        </label>
        {vencido && <p className="m-0 flex items-center gap-2 text-sm font-semibold text-aviso"><IcoAlerta tam={16} /> Este frasco passou da data informada ({dataBr(limite!)}).</p>}
        {!edicao && <button type="button" className="link -mt-2 self-start" onClick={frascoAcabou}>{frascoSel ? 'Frasco acabou?' : frascos.length ? 'Nenhum frasco com saldo?' : 'Cadastrar frasco'}</button>}
        <label className="rotulo">
          <span>Observação <span className="font-medium">(opcional)</span></span>
          <textarea rows={2} className="campo h-auto py-2.5 text-[15px] font-medium" placeholder="Como foi, algo a lembrar" value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        {blend && <p className="m-0 text-[13px] text-fraco">Fica registrada a dose do blend como você informou. O app não divide por componente.</p>}
        <button type="button" className="btn-primario" onClick={() => salvar()}>Salvar registro</button>
        {slot && !edicao && <button type="button" className="btn-texto -mt-2" onClick={() => trocar({ tipo: 'pular', slot })}>Não fiz esta dose</button>}
      </Sheet>
      {dialogo === 'sem-saldo' && (
        <Dialogo titulo={base.frascos.some((f) => f.substanciaId === subId) ? `Nenhum frasco de ${nome} com saldo` : `Nenhum frasco de ${nome} cadastrado`} aoFechar={() => setDialogo(null)}>
          <p className="m-0 text-[15px] leading-relaxed text-suave">
            {base.frascos.some((f) => f.substanciaId === subId) ? 'Pelos seus registros, o último frasco acabou. ' : ''}Você pode cadastrar um frasco ou registrar a dose sem ligar a um frasco.
          </p>
          <button type="button" className="btn-primario" onClick={() => { fechar(); nav(`/estoque/frasco/novo?sub=${subId}`) }}>Cadastrar frasco</button>
          <button type="button" className="btn-secundario" onClick={() => { setDialogo(null); void salvar() }}>Registrar sem frasco</button>
          <button type="button" className="btn-texto" onClick={() => setDialogo(null)}>Voltar</button>
        </Dialogo>
      )}
      {dialogo === 'vencido' && frascoSel && (
        <FrascoVencido
          frasco={frascoSel}
          base={base}
          aoFechar={() => setDialogo(null)}
          manter={() => { setVencidoOk(true); setDialogo(null); void salvar(true) }}
          descartado={() => { setFrascoId(''); setDialogo(null) }}
          rotuloManter="Usar mesmo assim e salvar"
        />
      )}
    </>
  )
}

/** M51: frasco passou da data. Não bloqueia: a pessoa decide. */
export function FrascoVencido({
  frasco,
  base,
  aoFechar,
  manter,
  descartado,
  rotuloManter = 'Manter na lista',
}: {
  frasco: Frasco
  base: Base
  aoFechar: () => void
  manter: () => void
  descartado?: () => void
  rotuloManter?: string
}) {
  const nav = useNavigate()
  const limite = dataLimite(frasco)
  const passou = !!limite && limite < hojeStr()
  const s = saldoFrasco(frasco, base.aplicacoes)
  const nome = nomeSubstancia(frasco.substanciaId, base.subs)
  return (
    <Dialogo titulo={passou ? `Frasco de ${nome} passou da data` : `Frasco de ${nome} vence em breve`} aoFechar={aoFechar} icone={<IcoAlerta className="text-aviso" tam={28} />}>
      <p className="m-0 text-[15px] leading-relaxed text-suave">
        Você informou usar até <b className="text-texto">{limite ? dataBr(limite) : '—'}</b>.
        {s.mlRestante !== null ? ` Restam cerca de ${fmtNum(s.mlRestante, 2)} mL pelos registros.` : ` Restam cerca de ${fmtNum(s.mgRestante, 3)} mg pelos registros.`}
      </p>
      <p className="m-0 text-[15px] leading-relaxed text-suave">O que fazer com ele é decisão sua. Marcar como descartado tira o frasco da lista de uso.</p>
      <BotaoAcao
        className="btn-primario"
        ocupadoTexto="Gravando…"
        acao={async () => {
          await repo.statusFrasco(frasco.id, 'descartado')
          descartado?.()
          aoFechar()
        }}
      >
        Marcar como descartado
      </BotaoAcao>
      <button type="button" className="btn-secundario" onClick={manter}>{rotuloManter}</button>
      <button type="button" className="btn-texto" onClick={() => { aoFechar(); nav(`/estoque/frasco/${frasco.id}`) }}>Corrigir a data</button>
    </Dialogo>
  )
}

function Atrasada({ base, slot, fechar, trocar }: { base: Base; slot: Slot; fechar: () => void; trocar: (p: Pedido) => void }) {
  const nome = nomeSubstancia(slot.substanciaId, base.subs)
  return (
    <Sheet titulo="Ainda não registrada" sub={`${nome} · prevista ${slot.dia === hojeStr() ? '' : diaRelativo(slot.dia, hojeStr()).toLowerCase() + ' '}às ${slot.horario}`} aoFechar={fechar}>
      <span className="text-[15px] font-bold">O que aconteceu com esta dose?</span>
      <button type="button" className="btn-primario" onClick={() => trocar({ tipo: 'registrar', itemId: slot.itemId, slot })}>Fiz agora</button>
      <button type="button" className="btn-secundario" onClick={() => trocar({ tipo: 'registrar', itemId: slot.itemId, slot, outroHorario: true })}>Fiz, mas em outro horário</button>
      <button type="button" className="btn-neutro" onClick={() => trocar({ tipo: 'pular', slot })}>Não fiz</button>
      <p className="m-0 text-[13px] text-fraco">O app não diz se você deve aplicar ou não. Ele só guarda o que você informar.</p>
    </Sheet>
  )
}

function Pular({ base, slot, fechar, trocar }: { base: Base; slot: Slot; fechar: () => void; trocar: (p: Pedido) => void }) {
  const toast = useToast()
  const [motivo, setMotivo] = useState<string | undefined>()
  const item = base.itens.find((i) => i.id === slot.itemId)
  const nome = nomeSubstancia(slot.substanciaId, base.subs)
  return (
    <Sheet titulo="Marcar como não feita" aoFechar={fechar}>
      <p className="m-0 text-[15px] leading-relaxed text-suave">
        {nome} · {slot.horario}. Fica no histórico como “não feita” e o lembrete desta dose para.
      </p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-bold text-fraco">Motivo (opcional)</legend>
        <Chips rotulo="Motivo" opcoes={MOTIVOS.map((m) => ({ v: m, t: m }))} valor={motivo} aoMudar={(v) => setMotivo(motivo === v ? undefined : v)} />
      </fieldset>
      <BotaoAcao
        className="btn-primario"
        ocupadoTexto="Gravando…"
        acao={async () => {
          const ap = await repo.registrarAplicacao({
            protocoloId: slot.protocoloId,
            itemId: slot.itemId,
            substanciaId: slot.substanciaId,
            previsto: slot.chave,
            dataHora: instante(slot.dia, slot.horario).toISOString(),
            doseValor: item?.doseValor ?? 0,
            doseUnidade: item?.doseUnidade ?? 'mg',
            status: 'pulada',
            motivo,
          })
          fechar()
          toast({ tipo: 'info', titulo: 'Marcada como não feita', texto: `${nome} · ${slot.horario}`, desfazer: async () => { await repo.apagarAplicacao(ap.id) } })
        }}
      >
        Salvar como não feita
      </BotaoAcao>
      <button type="button" className="btn-texto" onClick={() => trocar({ tipo: 'atrasada', slot })}>Voltar</button>
    </Sheet>
  )
}

function Opcoes({ base, id, fechar, trocar }: { base: Base; id: string; fechar: () => void; trocar: (p: Pedido) => void }) {
  const ap = base.aplicacoes.find((a) => a.id === id)
  if (!ap) return null
  const d = new Date(ap.dataHora)
  return (
    <Sheet titulo="Registro" sub={`${nomeSubstancia(ap.substanciaId, base.subs)} · ${dataCurta(diaDe(d))} às ${horaDe(d)}`} aoFechar={fechar}>
      {ap.status === 'feita' && <button type="button" className="btn-secundario" onClick={() => trocar({ tipo: 'editar', aplicacaoId: id })}>Editar</button>}
      <button type="button" className="btn-neutro text-erro" onClick={() => trocar({ tipo: 'apagar', aplicacaoId: id })}>Apagar registro</button>
      <button type="button" className="btn-texto" onClick={fechar}>Cancelar</button>
    </Sheet>
  )
}

function Apagar({ base, id, fechar, trocar }: { base: Base; id: string; fechar: () => void; trocar: (p: Pedido) => void }) {
  const toast = useToast()
  const ap = base.aplicacoes.find((a) => a.id === id)
  if (!ap) return null
  const d = new Date(ap.dataHora)
  const nome = nomeSubstancia(ap.substanciaId, base.subs)
  return (
    <Dialogo titulo="Apagar este registro?" aoFechar={fechar}>
      <p className="m-0 text-[15px] leading-relaxed text-suave">
        <b className="text-texto">{nome} · {dataCurta(diaDe(d))} às {horaDe(d)} · {ap.status === 'feita' ? fmtDose(ap.doseValor, ap.doseUnidade) : 'não feita'}</b>
        {ap.frascoId && ap.status === 'feita' && <><br />O saldo do frasco volta a contar esta dose.</>}
      </p>
      <BotaoAcao
        className="btn-perigo"
        ocupadoTexto="Apagando…"
        acao={async () => {
          const apagada = await repo.apagarAplicacao(id)
          fechar()
          toast({ tipo: 'info', titulo: 'Registro apagado', texto: `${nome} · ${horaDe(d)}`, desfazer: apagada ? () => repo.restaurarAplicacao(apagada) : undefined })
        }}
      >
        Apagar
      </BotaoAcao>
      {ap.status === 'feita' && <button type="button" className="btn-secundario" onClick={() => trocar({ tipo: 'editar', aplicacaoId: id })}>Editar em vez de apagar</button>}
      <button type="button" className="btn-texto" onClick={fechar}>Cancelar</button>
    </Dialogo>
  )
}
