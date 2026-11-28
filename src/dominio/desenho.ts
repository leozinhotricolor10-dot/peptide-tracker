// Contas puras dos desenhos do app: a seringa (folha de dose, calculadora do passo 1, Reconstituição)
// e a régua graduada das barras de saldo do frasco. Só desenham o número que já veio da conta feita
// com o que a pessoa digitou; nunca sugerem dose.
import { fmtNum, UNIDADES_POR_ML } from './calculos.ts'

/** Seringa de insulina desenhada: 100 unidades (1 mL). */
export const CAPACIDADE_SERINGA = UNIDADES_POR_ML

export type PosicaoSeringa = {
  /** Unidades da conta (sem arredondar), como a pessoa vê no texto. */
  unidades: number
  /** Quanto do corpo da seringa fica preenchido, de 0 a 1 (acima de 100 unidades fica cheio). */
  fracao: number
  /** A conta passou da seringa de 100 unidades. */
  acima: boolean
  /** Texto alternativo descritivo (leitor de tela). */
  rotulo: string
}

/**
 * Onde fica a marca na seringa de 100 unidades. Aceita a conta em unidades ou, em blend (dose em mL),
 * o volume em mL (1 mL = 100 unidades). Sem número válido (vazio, negativo, não numérico) não desenha.
 */
export function posicaoNaSeringa(conta: { unidades?: number | null; ml?: number | null }): PosicaoSeringa | null {
  const unidades =
    typeof conta.unidades === 'number' ? conta.unidades : typeof conta.ml === 'number' ? conta.ml * UNIDADES_POR_ML : null
  if (unidades === null || !Number.isFinite(unidades) || unidades < 0) return null
  const acima = unidades > CAPACIDADE_SERINGA
  const fracao = Math.min(1, unidades / CAPACIDADE_SERINGA)
  const n = fmtNum(Math.round(unidades * 100) / 100)
  const rotulo = acima
    ? `Seringa de insulina de ${CAPACIDADE_SERINGA} unidades. A conta deu ${n} unidades, mais que a seringa inteira`
    : `Seringa de insulina de ${CAPACIDADE_SERINGA} unidades, marcada em ${n} de ${CAPACIDADE_SERINGA}`
  return { unidades, fracao, acima, rotulo }
}

/** Marcas da escala da seringa: a cada 2 unidades; as de 10 em 10 são maiores e têm número. */
export function marcasDaSeringa(): { u: number; grande: boolean; numero: boolean }[] {
  const out: { u: number; grande: boolean; numero: boolean }[] = []
  for (let u = 0; u <= CAPACIDADE_SERINGA; u += 2) out.push({ u, grande: u % 10 === 0, numero: u % 20 === 0 })
  return out
}

/**
 * Régua graduada (assinatura do app): risquinhos a cada 10% numa barra de saldo, como a escala da
 * seringa. Devolve as posições internas (10% a 90%), em fração da largura.
 */
export function marcasDaRegua(divisoes = 10): number[] {
  if (!Number.isInteger(divisoes) || divisoes < 2) return []
  return Array.from({ length: divisoes - 1 }, (_, k) => (k + 1) / divisoes)
}

/** Fração cheia de uma barra de saldo, sempre entre 0 e 1 (saldo negativo ou acima do total não estoura). */
export function fracaoDaBarra(restante: number | null | undefined, total: number | null | undefined): number | null {
  if (typeof restante !== 'number' || typeof total !== 'number' || !Number.isFinite(restante) || !Number.isFinite(total) || total <= 0) return null
  return Math.max(0, Math.min(1, restante / total))
}
