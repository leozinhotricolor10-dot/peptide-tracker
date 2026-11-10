// Painel da tela Hoje: a semana (seg a dom), as próximas doses, os avisos que pedem atenção e os
// atalhos de peso e estoque. Puro e testado (painel.test.ts). Só conta o que a pessoa cadastrou e
// registrou: não sugere dose, não julga e não tem meta.
import type { Aplicacao, Frasco, ItemProtocolo, Medicao, Protocolo } from './tipos.ts'
import { TOLERANCIA_ATRASO_MIN, estadoEfetivo, proximosSlots, slotsDoDia, type Slot, type StatusSlot } from './agenda.ts'
import { diaDe, diaSemana, difDias, instante, somaDias } from './datas.ts'
import { LIMITE_ACABANDO, dataLimite } from './calculos.ts'
import { estoqueDoItem, frascoUsavel } from './estoque.ts'

/** Dias antes da data limite do frasco em que o aviso "vence em N dias" aparece. */
export const DIAS_AVISO_VENCIMENTO = 14
/** Doses restantes no frasco (sem outro frasco da substância) a partir das quais aparece "frasco acabando". */
export const DOSES_ACABANDO = 2
/** Quantas doses a lista "Próximas doses" mostra. */
export const LIMITE_PROXIMAS = 5

/** Segunda-feira da semana do dia (a semana vai de segunda a domingo). */
export function inicioDaSemana(dia: string): string {
  return somaDias(dia, -((diaSemana(dia) + 6) % 7))
}

/** Os 7 dias (seg a dom) da semana que contém `dia`. */
export function diasDaSemana(dia: string): string[] {
  const seg = inicioDaSemana(dia)
  return Array.from({ length: 7 }, (_, k) => somaDias(seg, k))
}

/** Registros ligados a um horário previsto, agrupados pelo dia previsto. Feito uma vez por cálculo. */
export function indexarPorDia(aplicacoes: Aplicacao[]): Map<string, Aplicacao[]> {
  const m = new Map<string, Aplicacao[]>()
  for (const a of aplicacoes) {
    if (!a.previsto) continue
    const d = a.previsto.slice(0, 10)
    const l = m.get(d)
    if (l) l.push(a)
    else m.set(d, [a])
  }
  return m
}

/** Estado de um horário previsto no painel: os de Hoje mais 'futura' (dia que ainda não chegou). */
export type StatusPainel = StatusSlot | 'futura'

export interface DoseDoDia {
  slot: Slot
  status: StatusPainel
  /** Registro ligado (feita ou pulada). */
  aplicacaoId?: string
}

/**
 * Doses previstas num dia, com o estado de cada uma.
 * - Registro com o mesmo horário previsto: vale (como em Hoje).
 * - Dia que já passou: um registro daquela linha com horário antigo (o horário mudou depois) também
 *   vale para um horário sem registro, como no Histórico; a edição nunca apaga o que foi feito.
 * - Sem registro: 'futura' (dia que não chegou), 'pendente' ou 'atrasada' (30 min depois do horário).
 */
export function dosesDoDia(protocolos: Protocolo[], itens: ItemProtocolo[], porDia: Map<string, Aplicacao[]>, dia: string, agora: Date): DoseDoDia[] {
  const hoje = diaDe(agora)
  const regs = porDia.get(dia) ?? []
  const usados = new Set<string>()
  const out: DoseDoDia[] = slotsDoDia(protocolos, itens, dia).map((slot) => {
    const r = regs.find((a) => !usados.has(a.id) && a.itemId === slot.itemId && a.previsto === slot.chave)
    if (!r) return { slot, status: 'pendente' }
    usados.add(r.id)
    return { slot, status: r.status, aplicacaoId: r.id }
  })
  for (const x of out) {
    if (x.aplicacaoId) continue
    if (dia < hoje) {
      const r = regs.find((a) => !usados.has(a.id) && a.itemId === x.slot.itemId)
      if (r) {
        usados.add(r.id)
        x.status = r.status
        x.aplicacaoId = r.id
        continue
      }
    }
    if (dia > hoje) x.status = 'futura'
    else x.status = agora.getTime() > instante(dia, x.slot.horario).getTime() + TOLERANCIA_ATRASO_MIN * 60000 ? 'atrasada' : 'pendente'
  }
  return out
}

export interface ResumoDia {
  dia: string
  previstas: number
  feitas: number
  /** Marcadas como "não fiz". */
  puladas: number
  /** Passaram do horário sem registro. */
  semRegistro: number
  /** Ainda vão acontecer (hoje mais tarde ou dias seguintes). */
  aFazer: number
  /** Protocolos com dose no dia, sem repetir, na ordem do horário. */
  protocolos: string[]
  doses: DoseDoDia[]
}

export function resumirDia(dia: string, doses: DoseDoDia[]): ResumoDia {
  const conta = (f: (s: StatusPainel) => boolean) => doses.filter((d) => f(d.status)).length
  return {
    dia,
    previstas: doses.length,
    feitas: conta((s) => s === 'feita'),
    puladas: conta((s) => s === 'pulada'),
    semRegistro: conta((s) => s === 'atrasada'),
    aFazer: conta((s) => s === 'pendente' || s === 'futura'),
    protocolos: [...new Set(doses.map((d) => d.slot.protocoloId))],
    doses,
  }
}

export interface ResumoSemana {
  dias: ResumoDia[]
  previstas: number
  feitas: number
  puladas: number
  /** Dias seguidos (com dose prevista) em que todas foram tomadas; ver `sequenciaTudoFeito`. */
  sequencia: number
}

/**
 * Dias seguidos, até hoje, em que todas as doses previstas foram tomadas ("tudo feito", como em Hoje:
 * pular não conta). Dias sem dose prevista não contam nem quebram. Hoje só entra se já está completo;
 * hoje ainda em andamento não quebra a sequência.
 */
export function sequenciaTudoFeito(protocolos: Protocolo[], itens: ItemProtocolo[], porDia: Map<string, Aplicacao[]>, agora: Date, maxDias = 366): number {
  if (protocolos.length === 0) return 0
  const hoje = diaDe(agora)
  const primeiro = protocolos.reduce((m, p) => (p.inicio < m ? p.inicio : m), protocolos[0].inicio)
  let n = 0
  for (let k = 0; k <= maxDias; k++) {
    const dia = somaDias(hoje, -k)
    if (dia < primeiro) break
    const r = resumirDia(dia, dosesDoDia(protocolos, itens, porDia, dia, agora))
    if (r.previstas === 0) continue
    if (r.feitas === r.previstas) n++
    else if (k === 0) continue
    else break
  }
  return n
}

/** A semana de `agora` (seg a dom), dia a dia, com os totais e a sequência de "tudo feito". */
export function resumoSemana(protocolos: Protocolo[], itens: ItemProtocolo[], aplicacoes: Aplicacao[], agora: Date, porDia = indexarPorDia(aplicacoes)): ResumoSemana {
  const dias = diasDaSemana(diaDe(agora)).map((dia) => resumirDia(dia, dosesDoDia(protocolos, itens, porDia, dia, agora)))
  const soma = (f: (d: ResumoDia) => number) => dias.reduce((t, d) => t + f(d), 0)
  return {
    dias,
    previstas: soma((d) => d.previstas),
    feitas: soma((d) => d.feitas),
    puladas: soma((d) => d.puladas),
    sequencia: sequenciaTudoFeito(protocolos, itens, porDia, agora),
  }
}

/**
 * Próximas doses a partir de amanhã (as de hoje já estão em "Doses de hoje"), agrupadas por dia.
 * Respeita pausa, ciclo, fim e protocolo encerrado (vem de `proximosSlots`).
 */
export function proximasDoses(protocolos: Protocolo[], itens: ItemProtocolo[], agora: Date, limite = LIMITE_PROXIMAS): { dia: string; doses: Slot[] }[] {
  const amanha = instante(somaDias(diaDe(agora), 1), '00:00')
  const grupos: { dia: string; doses: Slot[] }[] = []
  for (const s of proximosSlots(protocolos, itens, amanha, limite)) {
    const g = grupos[grupos.length - 1]
    if (g && g.dia === s.dia) g.doses.push(s)
    else grupos.push({ dia: s.dia, doses: [s] })
  }
  return grupos
}

export type Alerta =
  /** Doses de ontem que passaram sem registro. */
  | { tipo: 'ontem'; doses: Slot[] }
  /** Frasco em uso que passou da data (dias < 0) ou vence em até 14 dias (0 = hoje). */
  | { tipo: 'vencimento'; frascoId: string; substanciaId: string; dias: number }
  /** Frasco ligado a uma linha ativa com poucas doses e nenhum outro frasco da substância. */
  | { tipo: 'acabando'; frascoId: string; substanciaId: string; itemId: string; protocoloId: string; doses: number | null }
  /** Linha de protocolo ativo sem frasco usável no Estoque. */
  | { tipo: 'sem-frasco'; itemId: string; protocoloId: string; substanciaId: string }
  /** Protocolo ativo cuja data de fim cai nos próximos 7 dias (0 = hoje). */
  | { tipo: 'termina'; protocoloId: string; fim: string; dias: number }

/** Avisos do painel, do mais urgente para o informativo. Lista vazia = a seção não aparece. */
export function alertasPainel(
  d: { protocolos: Protocolo[]; itens: ItemProtocolo[]; aplicacoes: Aplicacao[]; frascos: Frasco[] },
  agora: Date,
  porDia = indexarPorDia(d.aplicacoes),
): Alerta[] {
  const hoje = diaDe(agora)
  const out: Alerta[] = []

  const ontem = dosesDoDia(d.protocolos, d.itens, porDia, somaDias(hoje, -1), agora).filter((x) => x.status === 'atrasada')
  if (ontem.length) out.push({ tipo: 'ontem', doses: ontem.map((x) => x.slot) })

  const vencidos: Alerta[] = []
  const vencendo: Alerta[] = []
  for (const f of d.frascos) {
    // só frasco em uso com saldo: um frasco já vazio vira "sem frasco" / "acabando", não aviso de data
    if (!frascoUsavel(f, d.aplicacoes)) continue
    const lim = dataLimite(f)
    if (!lim) continue
    const dias = difDias(hoje, lim)
    if (dias < 0) vencidos.push({ tipo: 'vencimento', frascoId: f.id, substanciaId: f.substanciaId, dias })
    else if (dias <= DIAS_AVISO_VENCIMENTO) vencendo.push({ tipo: 'vencimento', frascoId: f.id, substanciaId: f.substanciaId, dias })
  }
  out.push(...vencidos)

  const ativos = new Map(d.protocolos.filter((p) => estadoEfetivo(p, hoje) === 'ativo').map((p) => [p.id, p]))
  const acabando: Alerta[] = []
  const semFrasco: Alerta[] = []
  const frascosAvisados = new Set<string>()
  for (const i of d.itens) {
    if (!ativos.has(i.protocoloId)) continue
    const e = estoqueDoItem(i, d.frascos, d.aplicacoes, hoje)
    if (!e.frasco) {
      semFrasco.push({ tipo: 'sem-frasco', itemId: i.id, protocoloId: i.protocoloId, substanciaId: i.substanciaId })
      continue
    }
    if (e.outros > 0 || frascosAvisados.has(e.frasco.id)) continue
    const pouco = e.doses !== null ? e.doses <= DOSES_ACABANDO : e.mgRestante !== null && e.frasco.mgTotal > 0 && e.mgRestante / e.frasco.mgTotal <= LIMITE_ACABANDO
    if (!pouco) continue
    frascosAvisados.add(e.frasco.id)
    acabando.push({ tipo: 'acabando', frascoId: e.frasco.id, substanciaId: i.substanciaId, itemId: i.id, protocoloId: i.protocoloId, doses: e.doses })
  }
  out.push(...acabando, ...semFrasco, ...vencendo)

  for (const p of ativos.values()) {
    if (!p.fim) continue
    const dias = difDias(hoje, p.fim)
    if (dias >= 0 && dias <= 6) out.push({ tipo: 'termina', protocoloId: p.id, fim: p.fim, dias })
  }
  return out
}

export interface ResumoPeso {
  ultimo: { data: string; kg: number }
  primeiro: { data: string; kg: number }
  /** Último menos o primeiro, em kg (0 quando só há um registro). */
  variacao: number
  registros: number
}

/** Peso mais recente e a diferença desde o primeiro registro. Sem peso registrado: null. */
export function resumoPeso(medicoes: Medicao[]): ResumoPeso | null {
  const comPeso = medicoes.filter((m) => typeof m.pesoKg === 'number' && m.pesoKg > 0).sort((a, b) => a.data.localeCompare(b.data))
  if (!comPeso.length) return null
  const p = comPeso[0]
  const u = comPeso[comPeso.length - 1]
  return {
    primeiro: { data: p.data, kg: p.pesoKg! },
    ultimo: { data: u.data, kg: u.pesoKg! },
    variacao: Math.round((u.pesoKg! - p.pesoKg!) * 100) / 100,
    registros: comPeso.length,
  }
}

export interface ResumoEstoquePainel {
  /** Frascos fechados ou abertos que ainda têm saldo. */
  emUso: number
  /** Linha ativa cujo frasco tem menos doses restantes (quando dá para contar doses). */
  maisPerto?: { itemId: string; substanciaId: string; doses: number }
}

export function resumoEstoquePainel(d: { protocolos: Protocolo[]; itens: ItemProtocolo[]; aplicacoes: Aplicacao[]; frascos: Frasco[] }, hoje: string): ResumoEstoquePainel {
  const emUso = d.frascos.filter((f) => frascoUsavel(f, d.aplicacoes)).length
  const ativos = new Set(d.protocolos.filter((p) => estadoEfetivo(p, hoje) === 'ativo').map((p) => p.id))
  let maisPerto: ResumoEstoquePainel['maisPerto']
  for (const i of d.itens) {
    if (!ativos.has(i.protocoloId)) continue
    const e = estoqueDoItem(i, d.frascos, d.aplicacoes, hoje)
    if (!e.frasco || e.doses === null) continue
    if (!maisPerto || e.doses < maisPerto.doses) maisPerto = { itemId: i.id, substanciaId: i.substanciaId, doses: e.doses }
  }
  return { emUso, maisPerto }
}

/** 'Bom dia' (5h–11h), 'Boa tarde' (12h–17h) ou 'Boa noite'. */
export function saudacao(agora: Date): string {
  const h = agora.getHours()
  if (h >= 5 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}
