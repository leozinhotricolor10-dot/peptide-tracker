// Cor de cada protocolo: só para reconhecer o cartão de relance. O nome continua sempre visível
// (a cor nunca é a única forma de distinguir). Paleta pensada para o fundo escuro do app:
// tons claros (contraste >= 4,5:1 com o fundo e com os cartões), longe dos verdes/vermelhos/âmbar
// de status e do turquesa de destaque. Testado em cores.test.ts.
import type { Protocolo } from './tipos.ts'

export interface CorProtocolo {
  id: string
  nome: string
  hex: string
}

/** Ordem = ordem da atribuição automática (as primeiras são as mais diferentes entre si). */
export const CORES_PROTOCOLO: readonly CorProtocolo[] = [
  { id: 'azul', nome: 'Azul', hex: '#5aa9ff' },
  { id: 'rosa', nome: 'Rosa', hex: '#ff7eb3' },
  { id: 'amarelo', nome: 'Amarelo', hex: '#f4e66a' },
  { id: 'violeta', nome: 'Violeta', hex: '#b394ff' },
  { id: 'celeste', nome: 'Celeste', hex: '#9fe0ff' },
  { id: 'magenta', nome: 'Magenta', hex: '#ea84f5' },
  { id: 'prata', nome: 'Prata', hex: '#c8d2da' },
  { id: 'lima', nome: 'Lima', hex: '#d2ef7a' },
]

const POR_ID = new Map(CORES_PROTOCOLO.map((c) => [c.id, c]))

export function corValida(id: unknown): id is string {
  return typeof id === 'string' && POR_ID.has(id)
}

/** Primeira cor da paleta ainda não usada; se todas estiverem em uso, a menos usada (empate: ordem da paleta). */
export function proximaCor(usadas: (string | undefined)[]): string {
  const conta = new Map<string, number>(CORES_PROTOCOLO.map((c) => [c.id, 0]))
  for (const u of usadas) if (u && conta.has(u)) conta.set(u, conta.get(u)! + 1)
  let melhor = CORES_PROTOCOLO[0].id
  for (const c of CORES_PROTOCOLO) if (conta.get(c.id)! < conta.get(melhor)!) melhor = c.id
  return melhor
}

/**
 * Dá cor a quem não tem (protocolos antigos, backup antigo), sem mexer em quem já tem.
 * Ordem estável: data de criação, depois início, depois id. Devolve uma lista nova.
 */
export function atribuirCores<T extends Pick<Protocolo, 'id' | 'cor' | 'criadoEm' | 'inicio'>>(protocolos: T[]): T[] {
  const usadas = protocolos.map((p) => (corValida(p.cor) ? p.cor : undefined))
  const ordem = [...protocolos.keys()].sort((a, b) => {
    const x = protocolos[a]
    const y = protocolos[b]
    return (x.criadoEm || '').localeCompare(y.criadoEm || '') || x.inicio.localeCompare(y.inicio) || x.id.localeCompare(y.id)
  })
  const saida = protocolos.map((p) => ({ ...p }))
  for (const k of ordem) {
    if (usadas[k]) continue
    const cor = proximaCor(usadas)
    usadas[k] = cor
    saida[k].cor = cor
  }
  return saida
}

/** Cor para mostrar. Sem cor gravada (não deveria acontecer depois da migração), cai numa cor fixa pelo id. */
export function corDe(p: Pick<Protocolo, 'id' | 'cor'> | undefined): CorProtocolo {
  if (p?.cor && POR_ID.has(p.cor)) return POR_ID.get(p.cor)!
  let h = 0
  for (const ch of p?.id ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CORES_PROTOCOLO[h % CORES_PROTOCOLO.length]
}
