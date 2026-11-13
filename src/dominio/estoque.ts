// Frasco de cada linha de protocolo: qual frasco a dose usa, quantas doses ainda rende e se a
// linha está sem frasco no Estoque. Puro e testado (estoque.test.ts). Só conta com o que a
// pessoa informou; nada aqui sugere dose.
import type { Aplicacao, Frasco, ItemProtocolo, UnidadeDose } from './tipos.ts'
import { concentracaoDoFrasco, dataLimite, paraMg, saldoFrasco, volumeDaDoseMl } from './calculos.ts'

/** Frasco em uso (fechado ou reconstituído) que ainda tem saldo. */
export function frascoUsavel(f: Frasco, aplicacoes: Aplicacao[]): boolean {
  if (f.status !== 'fechado' && f.status !== 'reconstituido') return false
  return saldoFrasco(f, aplicacoes).mgRestante > 0
}

export function frascoVencido(f: Frasco, hoje: string): boolean {
  const lim = dataLimite(f)
  return !!lim && lim < hoje
}

/** Data que conta como "mais antigo": quando abriu, senão quando comprou, senão quando cadastrou. */
function idade(f: Frasco): string {
  return f.reconstituidoEm ?? f.compradoEm ?? f.criadoEm.slice(0, 10)
}

/** Frascos usáveis da substância, do que deve ser usado primeiro para o último. */
export function frascosNaOrdem(substanciaId: string, frascos: Frasco[], aplicacoes: Aplicacao[], hoje: string): Frasco[] {
  return frascos
    .filter((f) => f.substanciaId === substanciaId && frascoUsavel(f, aplicacoes))
    .sort(
      (a, b) =>
        Number(frascoVencido(a, hoje)) - Number(frascoVencido(b, hoje)) || // vencido por último
        Number(a.status !== 'reconstituido') - Number(b.status !== 'reconstituido') || // o já aberto antes do lacrado
        idade(a).localeCompare(idade(b)) || // o mais antigo antes
        (a.validade ?? '9999').localeCompare(b.validade ?? '9999') ||
        a.criadoEm.localeCompare(b.criadoEm),
    )
}

/**
 * Frasco que a dose usa por padrão: o ligado à linha (ou o último usado), se ainda tem saldo e não
 * venceu; senão o mais antigo não vencido da mesma substância; vencido só se não houver outro
 * (aí o registro mostra o aviso de frasco vencido).
 */
export function escolherFrasco(o: {
  substanciaId: string
  preferidos?: (string | undefined)[]
  frascos: Frasco[]
  aplicacoes: Aplicacao[]
  hoje: string
}): Frasco | undefined {
  const ordem = frascosNaOrdem(o.substanciaId, o.frascos, o.aplicacoes, o.hoje)
  for (const id of o.preferidos ?? []) {
    const f = id ? ordem.find((x) => x.id === id) : undefined
    if (f && !frascoVencido(f, o.hoje)) return f
  }
  return ordem[0]
}

/** Quantas doses inteiras ainda cabem no saldo do frasco (null se não dá para converter, ex.: UI). */
export function dosesRestantes(f: Frasco, aplicacoes: Aplicacao[], doseValor: number, doseUnidade: UnidadeDose): number | null {
  if (!(doseValor > 0)) return null
  const s = saldoFrasco(f, aplicacoes)
  const conc = concentracaoDoFrasco(f)
  if (s.mlRestante !== null) {
    const vol = volumeDaDoseMl(doseValor, doseUnidade, conc)
    if (vol !== null && vol > 0) return Math.floor(s.mlRestante / vol + 1e-9)
  }
  const mg = paraMg(doseValor, doseUnidade)
  if (mg !== null && mg > 0) return Math.floor(s.mgRestante / mg + 1e-9)
  return null
}

export interface EstoqueDoItem {
  /** Frasco que a próxima dose usa (undefined = sem frasco no Estoque). */
  frasco?: Frasco
  /** Outros frascos usáveis da mesma substância. */
  outros: number
  doses: number | null
  mgRestante: number | null
  vencido: boolean
}

/** Frasco que a próxima dose da linha usa: o ligado à linha (ou o último usado nela), senão o mais antigo não vencido. */
export function frascoDaVez(i: Pick<ItemProtocolo, 'id' | 'substanciaId' | 'frascoId'>, frascos: Frasco[], aplicacoes: Aplicacao[], hoje: string): Frasco | undefined {
  const ultimo = aplicacoes
    .filter((a) => a.itemId === i.id && a.status === 'feita' && a.frascoId)
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora))[0]
  return escolherFrasco({ substanciaId: i.substanciaId, preferidos: [i.frascoId, ultimo?.frascoId], frascos, aplicacoes, hoje })
}

export function estoqueDoItem(i: ItemProtocolo, frascos: Frasco[], aplicacoes: Aplicacao[], hoje: string): EstoqueDoItem {
  const frasco = frascoDaVez(i, frascos, aplicacoes, hoje)
  if (!frasco) return { outros: 0, doses: null, mgRestante: null, vencido: false }
  const outros = frascosNaOrdem(i.substanciaId, frascos, aplicacoes, hoje).length - 1
  return {
    frasco,
    outros,
    doses: dosesRestantes(frasco, aplicacoes, i.doseValor, i.doseUnidade),
    mgRestante: saldoFrasco(frasco, aplicacoes).mgRestante,
    vencido: frascoVencido(frasco, hoje),
  }
}

/** Texto curto para o cartão: "Frasco: 12 doses restantes" (+ "e mais 1 frasco"). */
/** `doses` pode vir de fora (contagem animada na tela); o padrão é o valor calculado. */
export function resumoEstoque(e: EstoqueDoItem, doses: number | null = e.doses): string {
  if (!e.frasco) return 'Sem frasco no estoque'
  const base =
    doses !== null
      ? `Frasco: ${doses === 0 ? 'menos de 1 dose restante' : `${doses} dose${doses === 1 ? '' : 's'} restante${doses === 1 ? '' : 's'}`}`
      : e.mgRestante !== null
        ? `Frasco: ${e.mgRestante.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mg restantes`
        : 'Frasco no estoque'
  return `${base}${e.vencido ? ' (passou da data)' : ''}${e.outros > 0 ? ` · mais ${e.outros} frasco${e.outros === 1 ? '' : 's'}` : ''}`
}
