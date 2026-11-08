// Lista embutida de sugestões: SÓ NOMES. Sem dose, efeito nem composição.
// É só sugestão: a pessoa pode digitar e criar qualquer nome.
import type { Substancia, TipoSubstancia } from './tipos.ts'

export interface Sugestao {
  id: string
  nome: string
  tipo: TipoSubstancia
  sinonimos?: string[]
}

export const SUGESTOES_VERSAO = 1

export const SUGESTOES: Sugestao[] = [
  { id: 'bpc-157', nome: 'BPC-157', tipo: 'simples' },
  { id: 'tb-500', nome: 'TB-500', tipo: 'simples' },
  { id: 'ghk-cu', nome: 'GHK-Cu', tipo: 'simples' },
  { id: 'kpv', nome: 'KPV', tipo: 'simples' },
  { id: 'igf-1', nome: 'IGF-1', tipo: 'simples' },
  { id: 'glutationa', nome: 'Glutationa', tipo: 'simples', sinonimos: ['GSH'] },
  { id: 'timosina-alfa-1', nome: 'Timosina Alfa-1', tipo: 'simples' },
  { id: 'timogen-alfa-1', nome: 'Timogen Alfa-1', tipo: 'simples', sinonimos: ['Timogem'] },
  { id: 'll-37', nome: 'LL-37', tipo: 'simples' },
  { id: 'livagen', nome: 'Livagen', tipo: 'simples' },
  { id: 'ipamorelina', nome: 'Ipamorelina', tipo: 'simples', sinonimos: ['Ipamorelin'] },
  { id: 'tesamorelina', nome: 'Tesamorelina', tipo: 'simples', sinonimos: ['Tesamorelin'] },
  { id: 'cjc-1295-sem-dac', nome: 'CJC-1295 sem DAC', tipo: 'simples', sinonimos: ['CJC-1295'] },
  { id: 'ghrp-2', nome: 'GHRP-2', tipo: 'simples' },
  { id: 'ghrp-6', nome: 'GHRP-6', tipo: 'simples' },
  { id: 'ibutamoren', nome: 'Ibutamoren (MK-677)', tipo: 'simples', sinonimos: ['MK-677'] },
  { id: 'epitalon', nome: 'Epitalon', tipo: 'simples', sinonimos: ['Epithalon'] },
  { id: 'foxo4-dri', nome: 'FOXO4-DRI', tipo: 'simples' },
  { id: 'rhgh', nome: 'rHGH', tipo: 'simples', sinonimos: ['hormônio do crescimento recombinante'] },
  { id: 'metformina', nome: 'Metformina', tipo: 'simples' },
  { id: 'azul-de-metileno', nome: 'Azul de Metileno', tipo: 'simples' },
  { id: 'orotato-de-litio', nome: 'Orotato de Lítio', tipo: 'simples', sinonimos: ['Ortoato de Lítio', 'Lithium Orotate'] },
  { id: 'mots-c', nome: 'MOTS-c', tipo: 'simples' },
  { id: 'nad', nome: 'NAD+', tipo: 'simples', sinonimos: ['NAD'] },
  { id: 'slu-pp-332', nome: 'SLU-PP-332', tipo: 'simples' },
  { id: 'cardarine', nome: 'Cardarine (GW-501516)', tipo: 'simples', sinonimos: ['GW-501516'] },
  { id: 'ss-31', nome: 'SS-31 (Elamipretida)', tipo: 'simples', sinonimos: ['Elamipretida', 'Elamipretide'] },
  { id: 'l-carnitina', nome: 'L-Carnitina', tipo: 'simples' },
  { id: 'alcar', nome: 'Acetil-L-Carnitina (ALCAR)', tipo: 'simples', sinonimos: ['ALCAR'] },
  { id: 'dada', nome: 'DADA', tipo: 'simples' },
  { id: 'atp', nome: 'ATP', tipo: 'simples' },
  { id: 'semaglutida', nome: 'Semaglutida', tipo: 'simples', sinonimos: ['Semaglutide'] },
  { id: 'tirzepatida', nome: 'Tirzepatida', tipo: 'simples', sinonimos: ['Tirzepatide'] },
  { id: 'retatrutida', nome: 'Retatrutida', tipo: 'simples', sinonimos: ['Retatrutide'] },
  { id: 'melanotan-ii', nome: 'Melanotan II', tipo: 'simples', sinonimos: ['MT2'] },
  { id: 'kisspeptina', nome: 'Kisspeptina', tipo: 'simples', sinonimos: ['Kisspeptin'] },
  { id: 'pt-141', nome: 'PT-141 (Bremelanotida)', tipo: 'simples', sinonimos: ['Bremelanotida'] },
  { id: 'ocitocina', nome: 'Ocitocina', tipo: 'simples', sinonimos: ['Oxitocina'] },
  { id: 'selank', nome: 'Selank', tipo: 'simples' },
  { id: 'semax', nome: 'Semax', tipo: 'simples' },
  { id: 'cortagen', nome: 'Cortagen', tipo: 'simples' },
  { id: 'cerebrolysin', nome: 'Cerebrolysin', tipo: 'simples', sinonimos: ['Cerebrolisina'] },
  { id: 'noopept', nome: 'Noopept', tipo: 'simples' },
  { id: 'dihexa', nome: 'Dihexa', tipo: 'simples' },
  { id: 'alpha-gpc', nome: 'Alpha-GPC', tipo: 'simples' },
  { id: 'glow-70', nome: 'GLOW 70 mg', tipo: 'blend' },
]

/** Amostra curta mostrada sem digitar (T21). */
export const AMOSTRA_IDS = ['bpc-157', 'tb-500', 'semaglutida', 'tirzepatida', 'glow-70']

/** minúsculas, sem acento, sem espaço/hífen/pontuação */
export function normalizar(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, '')
}

export type ResultadoBusca =
  | { origem: 'minha'; substancia: Substancia }
  | { origem: 'lista'; sugestao: Sugestao }

function casa(alvo: string[], q: string): boolean {
  return alvo.some((t) => normalizar(t).includes(q))
}

/**
 * Busca nas substâncias da pessoa (primeiro) e na lista embutida. Itens da lista que a pessoa já
 * copiou aparecem como dela (com o nome dela), nunca duplicados.
 */
export function buscar(texto: string, minhas: Substancia[], lista: Sugestao[] = SUGESTOES, limite = 12): ResultadoBusca[] {
  const q = normalizar(texto)
  const ativas = minhas.filter((s) => !s.arquivada)
  const copiadas = new Set(ativas.map((s) => s.listaId).filter(Boolean))
  const todasCopiadas = new Set(minhas.map((s) => s.listaId).filter(Boolean))
  const out: ResultadoBusca[] = []
  for (const s of ativas) {
    const sug = s.listaId ? lista.find((l) => l.id === s.listaId) : undefined
    if (!q || casa([s.nome, ...(sug?.sinonimos ?? [])], q)) out.push({ origem: 'minha', substancia: s })
  }
  const daLista = q ? lista : lista.filter((l) => AMOSTRA_IDS.includes(l.id))
  for (const l of daLista) {
    // arquivadas também não reaparecem como "lista": a pessoa reativa em Minhas substâncias
    if (copiadas.has(l.id) || todasCopiadas.has(l.id)) continue
    if (!q || casa([l.nome, ...(l.sinonimos ?? [])], q)) out.push({ origem: 'lista', sugestao: l })
  }
  if (q) {
    // quem começa com o texto vem antes
    const peso = (r: ResultadoBusca) => {
      const nome = normalizar(r.origem === 'minha' ? r.substancia.nome : r.sugestao.nome)
      return (r.origem === 'minha' ? 0 : 2) + (nome.startsWith(q) ? 0 : 1)
    }
    out.sort((a, b) => peso(a) - peso(b))
  }
  return out.slice(0, limite)
}

/** Já existe substância (dela ou da lista) com exatamente este nome normalizado? */
export function existeNomeExato(texto: string, minhas: Substancia[], lista: Sugestao[] = SUGESTOES): boolean {
  const q = normalizar(texto)
  if (!q) return false
  return minhas.some((s) => normalizar(s.nome) === q) || lista.some((l) => normalizar(l.nome) === q)
}
