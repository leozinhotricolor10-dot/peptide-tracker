// Contas de reconstituição, volume, saldo e custo. Puro e testado (calculos.test.ts).
// Regra do produto: o app só converte números que a pessoa informou. Não arredonda a conta;
// a exibição mostra até 4 casas decimais. Em blend não divide a dose por componente.
import type { Aplicacao, Componente, Frasco, UnidadeDose } from './tipos.ts'

/** Seringa de insulina U-100: 100 unidades = 1 mL */
export const UNIDADES_POR_ML = 100

export function paraMg(valor: number, unidade: UnidadeDose): number | null {
  if (unidade === 'mg') return valor
  if (unidade === 'mcg') return valor / 1000
  return null
}

export function concentracaoMgMl(mgTotal: number, diluenteMl: number): number | null {
  if (!(mgTotal > 0) || !(diluenteMl > 0)) return null
  return mgTotal / diluenteMl
}

/** Volume (mL) de uma dose. mg/mcg precisam da concentração; UI não converte. */
export function volumeDaDoseMl(valor: number, unidade: UnidadeDose, concMgMl: number | null): number | null {
  if (!(valor > 0)) return null
  if (unidade === 'mL') return valor
  if (unidade === 'unidades') return valor / UNIDADES_POR_ML
  const mg = paraMg(valor, unidade)
  if (mg === null || concMgMl === null || !(concMgMl > 0)) return null
  return mg / concMgMl
}

export function unidadesNaSeringa(volumeMl: number): number {
  return volumeMl * UNIDADES_POR_ML
}

/** Quantas doses inteiras cabem no volume. */
export function rendimento(totalMl: number, doseMl: number): number | null {
  if (!(totalMl > 0) || !(doseMl > 0)) return null
  return Math.floor(totalMl / doseMl + 1e-9)
}

/** mg de uma dose: direto (mg/mcg) ou via volume × concentração. */
export function mgDaDose(valor: number, unidade: UnidadeDose, concMgMl: number | null): number | null {
  const mg = paraMg(valor, unidade)
  if (mg !== null) return mg
  if (unidade === 'UI' || concMgMl === null) return null
  const ml = volumeDaDoseMl(valor, unidade, concMgMl)
  return ml === null ? null : ml * concMgMl
}

export function somaComponentesMg(componentes: Componente[] | undefined): number | null {
  if (!componentes?.length) return null
  let total = 0
  let algum = false
  for (const c of componentes) {
    if (c.quantidade === undefined || !(c.quantidade > 0)) continue
    total += c.unidade === 'mcg' ? c.quantidade / 1000 : c.quantidade
    algum = true
  }
  return algum ? total : null
}

export interface Saldo {
  mgUsado: number
  mgRestante: number
  mlUsado: number | null
  mlRestante: number | null
  /** registros ligados ao frasco que não deu para converter (ex.: UI) */
  naoContabilizadas: number
  dosesFeitas: number
}

export function concentracaoDoFrasco(f: Frasco): number | null {
  if (f.status === 'fechado' || !f.diluenteMl) return null
  return concentracaoMgMl(f.mgTotal, f.diluenteMl)
}

export function saldoFrasco(f: Frasco, aplicacoes: Aplicacao[]): Saldo {
  const conc = concentracaoDoFrasco(f)
  let mgUsado = 0
  let naoContabilizadas = 0
  let dosesFeitas = 0
  for (const a of aplicacoes) {
    if (a.frascoId !== f.id || a.status !== 'feita') continue
    dosesFeitas++
    const mg = mgDaDose(a.doseValor, a.doseUnidade, conc)
    if (mg === null) naoContabilizadas++
    else mgUsado += mg
  }
  const mgRestante = Math.max(0, f.mgTotal - mgUsado)
  let mlUsado: number | null = null
  let mlRestante: number | null = null
  if (conc !== null && f.diluenteMl) {
    mlUsado = mgUsado / conc
    mlRestante = Math.max(0, f.diluenteMl - mlUsado)
  }
  return { mgUsado, mgRestante, mlUsado, mlRestante, naoContabilizadas, dosesFeitas }
}

/** Custo proporcional de uma dose (R$), se der para calcular. */
export function custoPorDose(f: Frasco, valor: number, unidade: UnidadeDose): number | null {
  if (f.custo === undefined || !(f.custo > 0) || !(f.mgTotal > 0)) return null
  const mg = mgDaDose(valor, unidade, concentracaoDoFrasco(f))
  if (mg === null) return null
  return (f.custo * mg) / f.mgTotal
}

/** Data que vale para vencimento: 'usar até' depois de reconstituir, senão a validade do rótulo. */
export function dataLimite(f: Frasco): string | undefined {
  const datas = [f.validade, f.status === 'reconstituido' ? f.usarAte : undefined].filter(Boolean) as string[]
  if (!datas.length) return undefined
  return datas.sort()[0]
}

/** Fração restante abaixo da qual o frasco é mostrado como "acabando". */
export const LIMITE_ACABANDO = 0.2

// ---------- formatação pt-BR ----------

export function fmtNum(n: number, maxDec = 4): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: maxDec, useGrouping: true })
}

export function fmtDose(valor: number, unidade: UnidadeDose): string {
  return `${fmtNum(valor)} ${unidade}`
}

export function fmtReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * '1.000' ou '2.500' sem vírgula: em pt-BR é milhar, em outros lugares é decimal. Numa dose isso
 * muda o valor em 1.000 vezes, então o app não adivinha: pede para escrever de outro jeito.
 */
export function numeroAmbiguo(txt: string): boolean {
  return /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/.test(txt.trim().replace(/\s/g, ''))
}

/** Lê número digitado em pt-BR ('2,5', '2.5' ou '1.000,5'). Inválido ou ambíguo ('1.000') -> null. */
export function lerNumero(txt: string): number | null {
  const t = txt.trim().replace(/\s/g, '')
  if (!t || numeroAmbiguo(t)) return null
  let norm = t
  if (t.includes(',')) {
    if ((t.match(/,/g) ?? []).length > 1) return null
    norm = t.replace(/\./g, '').replace(',', '.')
  } else if ((t.match(/\./g) ?? []).length > 1) return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(norm)) return null
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}

/** Mensagem de erro para um campo numérico (explica o caso '1.000'). */
export function erroNumero(txt: string, padrao: string): string {
  return numeroAmbiguo(txt) ? 'Use vírgula para decimais (ex.: 1,5) e escreva milhares sem ponto (ex.: 1000).' : padrao
}
