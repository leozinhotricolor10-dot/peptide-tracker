// Regras de quando cada dose está prevista (frequência + ciclo on/off + pausa + fim).
// Puro e testado (agenda.test.ts). Não sugere nada: só expande o que a pessoa cadastrou.
import type { Aplicacao, EstadoProtocolo, Frequencia, ItemProtocolo, Protocolo } from './tipos.ts'
import { SEMANA_CURTA, diaDe, diaSemana, difDias, instante, somaDias } from './datas.ts'

export interface Slot {
  protocoloId: string
  itemId: string
  substanciaId: string
  dia: string
  horario: string
  /** 'AAAA-MM-DD HH:MM' */
  chave: string
}

export type StatusSlot = 'feita' | 'pulada' | 'atrasada' | 'pendente'

/** Minutos depois do horário em que a dose passa a ser mostrada como atrasada. */
export const TOLERANCIA_ATRASO_MIN = 30

/** Pausa com data que já passou conta como ativo; protocolo cuja data de fim passou conta como concluído. */
export function estadoEfetivo(p: Protocolo, hoje: string): EstadoProtocolo {
  if (p.estado === 'encerrado') return 'encerrado'
  if (p.fim && p.fim < hoje) return 'encerrado'
  if (p.estado === 'pausado' && p.pausadoAte && p.pausadoAte <= hoje) return 'ativo'
  return p.estado
}

/** Data em que o protocolo terminou (encerrado à mão ou pela data de fim), se já terminou. */
export function terminouEm(p: Protocolo, hoje: string): string | undefined {
  if (p.estado === 'encerrado') return p.encerradoEm
  if (p.fim && p.fim < hoje) return p.fim
  return undefined
}

/** Fecha a pausa atual e guarda no histórico de pausas (para os dias dela não virarem "perdidos"). */
export function fecharPausa(p: Protocolo, ate: string): { de: string; ate: string }[] {
  const pausas = [...(p.pausas ?? [])]
  if (p.pausadoDesde && ate > p.pausadoDesde) pausas.push({ de: p.pausadoDesde, ate })
  return pausas
}

export function emDiaDeCiclo(p: Protocolo, dia: string): boolean {
  if (!p.ciclo || p.ciclo.diasOn <= 0) return true
  const periodo = p.ciclo.diasOn + Math.max(0, p.ciclo.diasOff)
  const idx = difDias(p.inicio, dia)
  if (idx < 0) return false
  return idx % periodo < p.ciclo.diasOn
}

/** O protocolo gera doses neste dia? (datas, encerramento, pausa e ciclo) */
export function protocoloAtivoNoDia(p: Protocolo, dia: string): boolean {
  if (dia < p.inicio) return false
  if (p.fim && dia > p.fim) return false
  if (p.estado === 'encerrado' && p.encerradoEm && dia >= p.encerradoEm) return false
  if (p.estado === 'encerrado' && !p.encerradoEm) return false
  if (p.pausadoDesde && dia >= p.pausadoDesde) {
    if (p.estado === 'pausado' && (!p.pausadoAte || dia < p.pausadoAte)) return false
  }
  if (p.pausas?.some((x) => dia >= x.de && dia < x.ate)) return false
  return emDiaDeCiclo(p, dia)
}

export function frequenciaNoDia(f: Frequencia, inicio: string, dia: string): boolean {
  switch (f.tipo) {
    case 'diaria':
      return true
    case 'cadaN': {
      const n = Math.max(1, Math.floor(f.n))
      const idx = difDias(inicio, dia)
      return idx >= 0 && idx % n === 0
    }
    case 'semana':
      return f.dias.includes(diaSemana(dia))
  }
}

export function itemNoDia(p: Protocolo, item: ItemProtocolo, dia: string): boolean {
  return protocoloAtivoNoDia(p, dia) && frequenciaNoDia(item.frequencia, p.inicio, dia)
}

export function chaveSlot(dia: string, horario: string): string {
  return `${dia} ${horario}`
}

export function slotsDoDia(protocolos: Protocolo[], itens: ItemProtocolo[], dia: string): Slot[] {
  const porId = new Map(protocolos.map((p) => [p.id, p]))
  const out: Slot[] = []
  for (const item of itens) {
    const p = porId.get(item.protocoloId)
    if (!p || !itemNoDia(p, item, dia)) continue
    for (const h of [...new Set(item.horarios)]) {
      out.push({ protocoloId: p.id, itemId: item.id, substanciaId: item.substanciaId, dia, horario: h, chave: chaveSlot(dia, h) })
    }
  }
  return out.sort((a, b) => a.horario.localeCompare(b.horario) || a.itemId.localeCompare(b.itemId))
}

/** Próximos horários a partir de `agora` (inclusive), até `limite` itens ou `maxDias` dias. */
export function proximosSlots(
  protocolos: Protocolo[],
  itens: ItemProtocolo[],
  agora: Date,
  limite = 10,
  maxDias = 120,
): Slot[] {
  const out: Slot[] = []
  const hoje = diaDe(agora)
  for (let i = 0; i <= maxDias && out.length < limite; i++) {
    const dia = somaDias(hoje, i)
    for (const s of slotsDoDia(protocolos, itens, dia)) {
      if (instante(s.dia, s.horario).getTime() >= agora.getTime() - 60000) out.push(s)
      if (out.length >= limite) break
    }
  }
  return out
}

export function statusSlot(slot: Slot, aplicacoes: Aplicacao[], agora: Date): StatusSlot {
  const reg = aplicacoes.find((a) => a.itemId === slot.itemId && a.previsto === slot.chave)
  if (reg) return reg.status
  const t = instante(slot.dia, slot.horario).getTime()
  return agora.getTime() > t + TOLERANCIA_ATRASO_MIN * 60000 ? 'atrasada' : 'pendente'
}

/**
 * Resumo de um dia passado para o histórico: doses previstas e quantas foram feitas.
 * Conta como feita qualquer registro "feito" daquela linha com horário previsto naquele dia,
 * mesmo que o horário tenha sido alterado depois (a edição não apaga o que já foi feito).
 */
export function resumoDoDia(protocolos: Protocolo[], itens: ItemProtocolo[], aplicacoes: Aplicacao[], dia: string): { previstas: number; feitas: number } {
  const slots = slotsDoDia(protocolos, itens, dia)
  const porItem = new Map<string, number>()
  for (const s of slots) porItem.set(s.itemId, (porItem.get(s.itemId) ?? 0) + 1)
  let feitas = 0
  for (const [itemId, previstas] of porItem) {
    const chaves = new Set(
      aplicacoes.filter((a) => a.itemId === itemId && a.status === 'feita' && a.previsto?.slice(0, 10) === dia).map((a) => a.previsto),
    )
    feitas += Math.min(previstas, chaves.size)
  }
  return { previstas: slots.length, feitas }
}

export interface Progresso {
  /** 'Semana 3 de 8', 'Dia 12 de 30' ou 'Dia 5' (sem fim) */
  texto: string
  /** Em pausa de ciclo hoje? */
  pausaDeCiclo: boolean
  /** Dias até voltar ao ciclo (se em pausa de ciclo) */
  diasAteVoltar?: number
}

export function progresso(p: Protocolo, hoje: string): Progresso {
  const diaN = difDias(p.inicio, hoje) + 1
  let texto: string
  if (diaN < 1) {
    const faltam = 1 - diaN
    texto = faltam === 1 ? 'Começa amanhã' : `Começa em ${faltam} dias`
  } else if (p.fim) {
    const total = difDias(p.inicio, p.fim) + 1
    if ((total % 7 === 0 && total >= 14) || total > 90) {
      const semanas = Math.ceil(total / 7)
      texto = `Semana ${Math.min(semanas, Math.ceil(diaN / 7))} de ${semanas}`
    } else {
      texto = `Dia ${Math.min(diaN, total)} de ${total}`
    }
  } else {
    texto = diaN > 60 ? `Semana ${Math.ceil(diaN / 7)}` : `Dia ${diaN}`
  }
  let pausaDeCiclo = false
  let diasAteVoltar: number | undefined
  if (p.ciclo && diaN >= 1 && !emDiaDeCiclo(p, hoje)) {
    pausaDeCiclo = true
    const periodo = p.ciclo.diasOn + p.ciclo.diasOff
    diasAteVoltar = periodo - (difDias(p.inicio, hoje) % periodo)
  }
  return { texto, pausaDeCiclo, diasAteVoltar }
}

function listaHoras(h: string[]): string {
  const hs = [...h].sort()
  if (hs.length <= 1) return hs.join('')
  return hs.slice(0, -1).join(', ') + ' e ' + hs[hs.length - 1]
}

/** 'todo dia às 08:00 e 20:00', 'a cada 3 dias às 13:00', 'seg e qui às 13:00' */
export function descreverFrequencia(f: Frequencia, horarios: string[]): string {
  const horas = horarios.length ? ` às ${listaHoras(horarios)}` : ''
  switch (f.tipo) {
    case 'diaria':
      return `todo dia${horas}`
    case 'cadaN':
      return f.n === 1 ? `todo dia${horas}` : `a cada ${f.n} dias${horas}`
    case 'semana': {
      const dias = [...f.dias].sort().map((d) => SEMANA_CURTA[d])
      const txt = dias.length <= 1 ? dias.join('') : dias.slice(0, -1).join(', ') + ' e ' + dias[dias.length - 1]
      return `${txt}${horas}`
    }
  }
}

/** '2x ao dia', '1x ao dia', '2x por semana', 'a cada 3 dias' */
export function frequenciaCurta(f: Frequencia, horarios: string[]): string {
  const n = Math.max(1, horarios.length)
  switch (f.tipo) {
    case 'diaria':
      return `${n}x ao dia`
    case 'cadaN':
      return f.n === 1 ? `${n}x ao dia` : `a cada ${f.n} dias`
    case 'semana':
      return `${f.dias.length * n}x por semana`
  }
}
