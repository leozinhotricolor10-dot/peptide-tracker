// Backup assistido: quando lembrar do backup, o texto do "último backup" e a detecção simples de
// iPhone. Puro e testado (backup-lembrete.test.ts). Os dados vivem só no aparelho; o lembrete é o
// que evita perder tudo ao trocar de celular ou limpar o navegador.
import { diaDe, difDias, pad, parseDia, somaDias } from './datas.ts'

/** Primeiro lembrete: a partir deste número de doses registradas (ou 1 dia de uso). */
export const REGISTROS_PRIMEIRO_LEMBRETE = 3
/** Depois do primeiro backup: lembra a cada tantos dias, se houver dado novo. */
export const DIAS_ENTRE_LEMBRETES = 7
/** "Lembrar depois" adia por tantos dias. */
export const DIAS_ADIAR = 3
/** Acima disso, o arquivo com fotos costuma não passar por WhatsApp/e-mail: o app oferece "sem fotos". */
export const LIMITE_COMPARTILHAR_BYTES = 50 * 1024 * 1024

export interface SituacaoBackup {
  /** Dia de hoje (AAAA-MM-DD). */
  hoje: string
  /** Data/hora (ISO) do último backup feito ou restaurado; vazio = nunca. */
  ultimoBackup?: string
  /** "Lembrar depois" até este dia (AAAA-MM-DD), exclusivo. */
  adiadoAte?: string
  /** Primeiro dia de uso (AAAA-MM-DD). */
  primeiroUso?: string
  /** Doses registradas como feitas. */
  registros: number
  /** Existe algum dado da pessoa (protocolo, registro, medição, foto ou frasco). */
  temDados: boolean
  /** Os dados mudaram desde o último backup (sem backup, sempre true). */
  dadosNovos: boolean
}

export type LembreteBackup = { tipo: 'primeiro' } | { tipo: 'atrasado'; dias: number }

/**
 * Regras:
 * - nunca fez backup: avisa quando já há dados e (3 doses registradas ou 1 dia de uso);
 * - já fez: avisa a cada 7 dias, só se houver dado novo desde o último backup;
 * - "Lembrar depois" cala o aviso por 3 dias.
 */
export function lembreteBackup(s: SituacaoBackup): LembreteBackup | null {
  if (s.adiadoAte && s.adiadoAte > s.hoje) return null
  if (!s.ultimoBackup) {
    if (!s.temDados) return null
    const diasDeUso = s.primeiroUso ? difDias(s.primeiroUso, s.hoje) : 0
    return s.registros >= REGISTROS_PRIMEIRO_LEMBRETE || diasDeUso >= 1 ? { tipo: 'primeiro' } : null
  }
  if (!s.dadosNovos) return null
  const dias = difDias(diaDe(new Date(s.ultimoBackup)), s.hoje)
  return dias >= DIAS_ENTRE_LEMBRETES ? { tipo: 'atrasado', dias } : null
}

/** Dia até quando o "Lembrar depois" cala o aviso. */
export function adiarLembrete(hoje: string): string {
  return somaDias(hoje, DIAS_ADIAR)
}

/** "Último backup: há 12 dias (03/11)" ou "Você ainda não fez nenhum backup". */
export function textoUltimoBackup(ultimoBackup: string | undefined, hoje: string): string {
  if (!ultimoBackup || Number.isNaN(new Date(ultimoBackup).getTime())) return 'Você ainda não fez nenhum backup'
  const dia = diaDe(new Date(ultimoBackup))
  const d = parseDia(dia)
  const curto = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  const dias = difDias(dia, hoje)
  const quando = dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`
  return `Último backup: ${quando} (${curto})`
}

/** iPhone/iPad, de forma simples (iPad novo se apresenta como Mac com toque). */
export function ehIOSDe(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
}

/** Resumo curto de um texto (FNV-1a 32 bits), para saber se os dados mudaram desde o backup. */
export function resumoTexto(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${texto.length.toString(36)}-${h.toString(36)}`
}
