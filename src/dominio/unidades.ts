// Dose em unidades da seringa de insulina (U-100: 100 unidades = 1 mL), ao lado da massa que a
// pessoa cadastrou: "2 mg · 10 un". Puro e testado (unidades.test.ts). Usa as mesmas contas da
// calculadora e da Reconstituição (calculos.ts) e o mesmo frasco que a próxima dose usaria
// (estoque.ts). Só converte o que a pessoa informou; não sugere dose.
//
// Rótulo curto "un" (não "UI"): no app, "UI" já é uma unidade de dose (Unidade Internacional),
// que não converte para mL. Usar "UI" para as marcas da seringa misturaria as duas coisas.
import type { Aplicacao, Frasco, ItemProtocolo, UnidadeDose } from './tipos.ts'
import { UNIDADES_POR_ML, concentracaoDoFrasco, fmtNum, marcaDaSeringa, unidadesNaSeringa, volumeDaDoseMl } from './calculos.ts'
import { frascoDaVez } from './estoque.ts'

/** Só o que a conta precisa do frasco (serve também para o frasco que o cadastro ainda vai criar). */
export type FrascoDaConta = Pick<Frasco, 'status' | 'mgTotal' | 'diluenteMl'>

/** Por que a dose não tem unidades ao lado. */
export type FaltaUnidades =
  /** dose em mg/mcg sem frasco no Estoque */
  | 'sem-frasco'
  /** dose em mg/mcg e o frasco ainda não tem a água informada */
  | 'lacrado'
  /** UI (Unidade Internacional) não converte */
  | 'ui'
  /** a dose já está em unidades da seringa: não repete */
  | 'ja-unidades'
  /** blend em mg: o app não divide o blend por componente, então não converte */
  | 'blend-mg'

export interface DoseUn {
  valor: number
  unidade: UnidadeDose
  /** Unidades exatas na seringa (inteiro quando a conta fecha); null quando não dá para converter. */
  unidades: number | null
  /** Volume da dose em mL; null quando não dá para converter. */
  ml: number | null
  falta?: FaltaUnidades
  /** Marca inteira mais próxima, só quando o exato não cai numa marca. */
  marca: number | null
  /** Dose (na unidade cadastrada) que a marca arredondada dá de verdade. */
  doseDaMarca: number | null
  /** Menos de meia unidade: não há marca para isso. */
  abaixoDaMenorMarca: boolean
  /** Mais de 100 unidades: não cabe de uma vez numa seringa de 1 mL. */
  acimaDaSeringa: boolean
}

const QUASE = 1e-9

function semUnidades(valor: number, unidade: UnidadeDose, falta?: FaltaUnidades, ml: number | null = null): DoseUn {
  return { valor, unidade, unidades: null, ml, falta, marca: null, doseDaMarca: null, abaixoDaMenorMarca: false, acimaDaSeringa: false }
}

/** Monta o resultado a partir das unidades (calculadas agora ou gravadas no registro). */
function comUnidades(valor: number, unidade: UnidadeDose, unidades: number): DoseUn {
  const m = marcaDaSeringa(unidades)
  return {
    valor,
    unidade,
    unidades: m.exatas,
    ml: m.exatas / UNIDADES_POR_ML,
    marca: m.marca,
    // proporcional: a marca dá (marca / exatas) da dose, em qualquer unidade
    doseDaMarca: m.marca !== null && m.exatas > 0 ? (valor * m.marca) / m.exatas : null,
    abaixoDaMenorMarca: m.abaixoDaMenorMarca,
    acimaDaSeringa: m.exatas > UNIDADES_POR_ML + QUASE,
  }
}

/**
 * Unidades na seringa de uma dose, com o frasco informado. mg/mcg precisam do frasco reconstituído
 * (mg ÷ mL de água); mL vira unidades direto (mL × 100), em blend também; unidades e UI não convertem.
 */
export function unidadesDaDose(valor: number, unidade: UnidadeDose, frasco: FrascoDaConta | undefined, blend: boolean): DoseUn {
  if (!(valor > 0)) return semUnidades(valor, unidade)
  if (unidade === 'UI') return semUnidades(valor, unidade, 'ui')
  if (unidade === 'unidades') return semUnidades(valor, unidade, 'ja-unidades', valor / UNIDADES_POR_ML)
  if (unidade === 'mL') return comUnidades(valor, unidade, unidadesNaSeringa(valor))
  if (blend) return semUnidades(valor, unidade, 'blend-mg')
  if (!frasco) return semUnidades(valor, unidade, 'sem-frasco')
  const conc = concentracaoDoFrasco(frasco)
  if (conc === null) return semUnidades(valor, unidade, 'lacrado')
  const ml = volumeDaDoseMl(valor, unidade, conc)
  if (ml === null) return semUnidades(valor, unidade, 'lacrado')
  return comUnidades(valor, unidade, unidadesNaSeringa(ml))
}

export interface DoseDoItem extends DoseUn {
  /** Frasco que a próxima dose usaria (mesma regra do Estoque). */
  frasco?: Frasco
}

/** Dose de uma linha de protocolo com as unidades do frasco que a próxima dose usaria. */
export function doseComUnidades(i: ItemProtocolo, frascos: Frasco[], aplicacoes: Aplicacao[], hoje: string, blend: boolean): DoseDoItem {
  const frasco = frascoDaVez(i, frascos, aplicacoes, hoje)
  return { ...unidadesDaDose(i.doseValor, i.doseUnidade, frasco, blend), frasco }
}

/**
 * Dose de um registro já feito. Usa as unidades gravadas no registro (o histórico não muda se o
 * frasco for diluído de outro jeito depois). Registro antigo, sem esse dado: calcula pelo frasco
 * apontado, se ele ainda existir; senão fica só a massa.
 */
export function doseDoRegistro(a: Aplicacao, frascos: Frasco[], blend: boolean): DoseUn {
  if (typeof a.unidadesSeringa === 'number' && a.unidadesSeringa > 0 && a.doseUnidade !== 'unidades' && a.doseUnidade !== 'UI') {
    return comUnidades(a.doseValor, a.doseUnidade, a.unidadesSeringa)
  }
  const frasco = a.frascoId ? frascos.find((f) => f.id === a.frascoId) : undefined
  return unidadesDaDose(a.doseValor, a.doseUnidade, frasco, blend)
}

export interface MudancaUnidades {
  antes: number
  agora: number
  /** A dose de agora usa outro frasco (senão, foi a diluição do mesmo frasco que mudou). */
  frascoNovo: boolean
}

/**
 * A mesma dose da linha agora dá outro número de unidades do que no último registro (frasco novo ou
 * diluição diferente). Serve para a folha de dose destacar a troca. Dose digitada diferente não conta.
 */
export function mudancaDeUnidades(itemId: string, aplicacoes: Aplicacao[], atual: DoseUn, frascoId: string | undefined, ignorarId?: string): MudancaUnidades | null {
  if (atual.unidades === null || atual.unidade === 'mL') return null
  const ultimo = aplicacoes
    .filter((a) => a.itemId === itemId && a.status === 'feita' && a.id !== ignorarId && typeof a.unidadesSeringa === 'number')
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora))[0]
  if (!ultimo || ultimo.doseUnidade !== atual.unidade || Math.abs(ultimo.doseValor - atual.valor) > QUASE) return null
  const antes = ultimo.unidadesSeringa!
  if (Math.abs(antes - atual.unidades) < 1e-6) return null
  return { antes, agora: atual.unidades, frascoNovo: ultimo.frascoId !== frascoId }
}

// ---------- texto ----------

const NBSP = ' '

/** "10 un" ou "7,5 un" (até 1 casa). Espaço que não quebra: o número nunca se separa do rótulo. */
export function fmtUnidades(n: number): string {
  const t = n > 0 && n < 0.05 ? 'menos de 0,1' : fmtNum(n, 1)
  return `${t}${NBSP}un`
}

/** Unidades exatas por extenso, para a folha de dose: "10 unidades", "7,5 unidades", "1 unidade". */
export function fmtUnidadesExtenso(n: number): string {
  return `${fmtNum(n)}${NBSP}unidade${Math.abs(n - 1) < QUASE ? '' : 's'}`
}

/** "2 mg · 10 un", "0,1 mL · 10 un" ou só "2 mg" quando não dá para converter. */
export function textoDoseUn(d: Pick<DoseUn, 'valor' | 'unidade' | 'unidades'>): string {
  const massa = `${fmtNum(d.valor)}${NBSP}${d.unidade}`
  return d.unidades === null ? massa : `${massa} · ${fmtUnidades(d.unidades)}`
}
