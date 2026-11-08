// Arquivo de agenda (.ics) com alarme. Título genérico: o nome da substância nunca aparece.
import { pad } from './datas.ts'

export const TITULO_AGENDA = 'Lembrete'

function carimboLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

function carimboUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export interface EventoAgenda {
  inicio: Date
  uid: string
}

/** Horário "flutuante" (sem fuso): a agenda do aparelho usa o horário local, como o app. */
export function gerarIcs(eventos: EventoAgenda[], agora = new Date()): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Peptide Tracker//pt-BR//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const e of eventos) {
    const fim = new Date(e.inicio.getTime() + 15 * 60000)
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${carimboUtc(agora)}`,
      `DTSTART:${carimboLocal(e.inicio)}`,
      `DTEND:${carimboLocal(fim)}`,
      `SUMMARY:${TITULO_AGENDA}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${TITULO_AGENDA}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  linhas.push('END:VCALENDAR')
  return linhas.join('\r\n') + '\r\n'
}
