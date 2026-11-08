import type { ItemProtocolo, Protocolo, Substancia } from './tipos.ts'
import { fmtNum } from './calculos.ts'

export const MAX_NOME_PROTOCOLO = 40

/** Nome mostrado nas listas: o que a pessoa deu ou, se vazio, o da 1ª substância (blend: o nome do blend). */
export function nomeProtocolo(p: Pick<Protocolo, 'id' | 'nome'>, itens: ItemProtocolo[], subs: Map<string, Substancia> | Substancia[]): string {
  const dado = p.nome?.trim()
  if (dado) return dado
  const mapa = Array.isArray(subs) ? new Map(subs.map((s) => [s.id, s])) : subs
  const primeiro = itens.filter((i) => i.protocoloId === p.id).sort((a, b) => a.ordem - b.ordem)[0]
  return (primeiro && mapa.get(primeiro.substanciaId)?.nome) || 'Protocolo'
}

/** 'BPC-157 · 5 mg'; não repete quando o nome já traz a quantidade ('GLOW 70 mg'). */
export function nomeComMg(nome: string, mg: number): string {
  const n = fmtNum(mg)
  const jaTem = new RegExp(`(^|[^\\d.,])${n.replace(/[.,]/g, '\\$&')}\\s*mg\\b`, 'i').test(nome)
  return jaTem ? nome : `${nome} · ${n} mg`
}

export function nomeSubstancia(id: string | undefined, subs: Map<string, Substancia>): string {
  return (id && subs.get(id)?.nome) || 'Substância'
}
