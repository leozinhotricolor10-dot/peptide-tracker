// Utilitários de data no horário local do aparelho (sem bibliotecas).

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date -> 'AAAA-MM-DD' (local) */
export function diaDe(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date -> 'HH:MM' (local) */
export function horaDe(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'AAAA-MM-DD' -> Date à meia-noite local */
export function parseDia(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d)
}

/** 'AAAA-MM-DD' + 'HH:MM' -> Date local */
export function instante(dia: string, hora: string): Date {
  const [h, mi] = hora.split(':').map(Number)
  const d = parseDia(dia)
  d.setHours(h, mi, 0, 0)
  return d
}

export function somaDias(dia: string, n: number): string {
  const d = parseDia(dia)
  d.setDate(d.getDate() + n)
  return diaDe(d)
}

/** Diferença em dias de calendário (b - a), robusta a horário de verão. */
export function difDias(a: string, b: string): number {
  const da = parseDia(a)
  const db = parseDia(b)
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate())
  return Math.round((ub - ua) / 86400000)
}

export function diaSemana(dia: string): number {
  return parseDia(dia).getDay()
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function nomeMes(m: number): string {
  return MESES[m]
}

/** 'Quarta, 4 de novembro' */
export function dataLonga(dia: string): string {
  const d = parseDia(dia)
  return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`
}

/** '4 de novembro' */
export function dataMedia(dia: string): string {
  const d = parseDia(dia)
  return `${d.getDate()} de ${MESES[d.getMonth()]}`
}

/** '04/11' */
export function dataCurta(dia: string): string {
  const d = parseDia(dia)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** '04/11/2026' */
export function dataBr(dia: string): string {
  const d = parseDia(dia)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** '5 out' */
export function dataEixo(dia: string): string {
  const d = parseDia(dia)
  return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`
}

/** '14/out' (formato dos cartões de protocolo e frasco) */
export function dataDiaMes(dia: string): string {
  const d = parseDia(dia)
  return `${d.getDate()}/${MESES_CURTOS[d.getMonth()]}`
}

/** 'Hoje', 'Amanhã', 'Ontem' ou 'Sábado' / '12/11' */
export function diaRelativo(dia: string, hoje: string): string {
  const dif = difDias(hoje, dia)
  if (dif === 0) return 'Hoje'
  if (dif === 1) return 'Amanhã'
  if (dif === -1) return 'Ontem'
  if (dif > 1 && dif < 7) return SEMANA[diaSemana(dia)]
  return dataCurta(dia)
}

export function hojeStr(): string {
  return diaDe(new Date())
}
