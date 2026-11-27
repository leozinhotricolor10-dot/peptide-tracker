// Cor de cada protocolo: só para reconhecer o cartão de relance. O nome continua sempre visível
// (a cor nunca é a única forma de distinguir). Tons escuros sobre o fundo claro do app: contraste
// >= 4,5:1 com o fundo e com os cartões e longe dos verdes/vermelhos/âmbar de status. Os ids nunca
// mudam (ficam gravados nos protocolos e no backup); só os tons podem mudar. Testado em cores.test.ts.
// Na tela, a cor vem de `css` (var(--prot-<id>), definida em src/index.css); `hex` é o mesmo tom,
// para os testes (paleta.test.ts confere que o CSS e esta tabela são iguais).
import type { Protocolo } from './tipos.ts'

export interface CorProtocolo {
  id: string
  nome: string
  /** Tom da cor (o mesmo do CSS); para pintar, use `css`. */
  hex: string
  /** Variável do CSS com a cor: var(--prot-<id>). */
  css: string
}

/**
 * Ordem = ordem da atribuição automática (as primeiras são as mais diferentes entre si).
 * Amarelo: #7A6200 do desenho virou #746200 (ficava a 13° do âmbar de aviso #945700; agora 15°+).
 */
export const CORES_PROTOCOLO: readonly CorProtocolo[] = [
  { id: 'azul', nome: 'Azul', hex: '#3f4fd9', css: 'var(--prot-azul)' },
  { id: 'rosa', nome: 'Rosa', hex: '#c0267a', css: 'var(--prot-rosa)' },
  { id: 'amarelo', nome: 'Amarelo', hex: '#746200', css: 'var(--prot-amarelo)' },
  { id: 'violeta', nome: 'Violeta', hex: '#7b3fc4', css: 'var(--prot-violeta)' },
  { id: 'celeste', nome: 'Celeste', hex: '#0b6e8c', css: 'var(--prot-celeste)' },
  { id: 'magenta', nome: 'Magenta', hex: '#9b2aae', css: 'var(--prot-magenta)' },
  { id: 'prata', nome: 'Prata', hex: '#596577', css: 'var(--prot-prata)' },
  { id: 'lima', nome: 'Lima', hex: '#4a6e00', css: 'var(--prot-lima)' },
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
