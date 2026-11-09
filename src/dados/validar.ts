// Validação do arquivo de backup antes de gravar. O arquivo vem de fora (pode estar corrompido,
// editado à mão ou ser malicioso): cada registro é reconstruído só com os campos conhecidos e
// tipos conferidos. Se algo essencial estiver errado, o arquivo inteiro é recusado e nada muda.
import type {
  Aplicacao,
  Ciclo,
  Componente,
  ConfigItem,
  Frasco,
  Frequencia,
  ItemProtocolo,
  Medicao,
  Protocolo,
  Substancia,
  UnidadeDose,
} from '../dominio/tipos.ts'

import { atribuirCores, corValida } from '../dominio/cores.ts'

export class BackupInvalido extends Error {}

const DIA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const UNIDADES: UnidadeDose[] = ['mg', 'mcg', 'UI', 'mL', 'unidades']
const TEXTO_MAX = 2000
/** Limites de quantidade (bem acima de qualquer uso real; protegem a memória do aparelho). */
export const LIMITES = { registros: 200_000, fotos: 2_000, bytesFoto: 15 * 1024 * 1024 }

type Obj = Record<string, unknown>

function falha(): never {
  throw new BackupInvalido('O backup está corrompido ou incompleto.')
}
function obj(v: unknown): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) falha()
  return v as Obj
}
function str(v: unknown, max = TEXTO_MAX): string {
  if (typeof v !== 'string' || v.length > max) falha()
  return v
}
function id(v: unknown): string {
  const s = str(v, 200)
  if (!s) falha()
  return s
}
function strOpc(v: unknown, max = TEXTO_MAX): string | undefined {
  return v === undefined || v === null || v === '' ? undefined : str(v, max)
}
function diaValido(s: string): boolean {
  if (!DIA.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d
}
function dia(v: unknown): string {
  const s = str(v, 10)
  if (!diaValido(s)) falha()
  return s
}
function diaOpc(v: unknown): string | undefined {
  return v === undefined || v === null || v === '' ? undefined : dia(v)
}
function instanteIso(v: unknown): string {
  const s = str(v, 40)
  if (Number.isNaN(new Date(s).getTime())) falha()
  return s
}
function num(v: unknown, min = -Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) falha()
  return v
}
function numOpc(v: unknown, min = -Infinity): number | undefined {
  return v === undefined || v === null ? undefined : num(v, min)
}
function bool(v: unknown, padrao: boolean): boolean {
  return typeof v === 'boolean' ? v : padrao
}
function umDe<T extends string>(v: unknown, opcoes: readonly T[]): T {
  if (typeof v !== 'string' || !opcoes.includes(v as T)) falha()
  return v as T
}
function lista(v: unknown, max = LIMITES.registros): unknown[] {
  if (!Array.isArray(v) || v.length > max) falha()
  return v
}
function semRepetir<T>(itens: T[], chave: (x: T) => string): T[] {
  const vistos = new Set<string>()
  for (const x of itens) {
    const k = chave(x)
    if (vistos.has(k)) falha()
    vistos.add(k)
  }
  return itens
}

function componente(v: unknown): Componente {
  const o = obj(v)
  return {
    nome: str(o.nome, 200),
    quantidade: numOpc(o.quantidade, 0),
    unidade: o.unidade === undefined ? undefined : umDe(o.unidade, ['mg', 'mcg'] as const),
  }
}

export function substancia(v: unknown): Substancia {
  const o = obj(v)
  const tipo = umDe(o.tipo, ['simples', 'blend'] as const)
  const nome = str(o.nome, 200).trim()
  if (!nome) falha()
  return {
    id: id(o.id),
    nome,
    tipo,
    componentes: o.componentes === undefined ? undefined : lista(o.componentes, 50).map(componente),
    origem: o.origem === 'lista' ? 'lista' : 'usuario',
    listaId: strOpc(o.listaId, 200),
    arquivada: bool(o.arquivada, false),
    criadaEm: typeof o.criadaEm === 'string' ? o.criadaEm.slice(0, 40) : '',
  }
}

function ciclo(v: unknown): Ciclo | undefined {
  if (v === undefined || v === null) return undefined
  const o = obj(v)
  return { diasOn: Math.floor(num(o.diasOn, 1)), diasOff: Math.floor(num(o.diasOff, 0)) }
}

export function protocolo(v: unknown): Protocolo {
  const o = obj(v)
  const inicio = dia(o.inicio)
  const fim = diaOpc(o.fim)
  if (fim && fim < inicio) falha()
  return {
    id: id(o.id),
    nome: strOpc(o.nome, 200),
    inicio,
    fim,
    ciclo: ciclo(o.ciclo),
    estado: umDe(o.estado, ['ativo', 'pausado', 'encerrado'] as const),
    pausadoDesde: diaOpc(o.pausadoDesde),
    pausadoAte: diaOpc(o.pausadoAte),
    pausas: o.pausas === undefined ? undefined : lista(o.pausas, 1000).map((x) => {
      const p = obj(x)
      return { de: dia(p.de), ate: dia(p.ate) }
    }),
    encerradoEm: diaOpc(o.encerradoEm),
    lembretes: bool(o.lembretes, true),
    notas: strOpc(o.notas),
    criadoEm: typeof o.criadoEm === 'string' ? o.criadoEm.slice(0, 40) : '',
    // cor desconhecida ou ausente (backup antigo): fica sem e recebe uma automática em validarTabelas
    cor: corValida(o.cor) ? o.cor : undefined,
  }
}

function frequencia(v: unknown): Frequencia {
  const o = obj(v)
  const tipo = umDe(o.tipo, ['diaria', 'cadaN', 'semana'] as const)
  if (tipo === 'diaria') return { tipo }
  if (tipo === 'cadaN') return { tipo, n: Math.floor(num(o.n, 1)) }
  const dias = lista(o.dias, 7).map((d) => {
    const n = num(d, 0)
    if (!Number.isInteger(n) || n > 6) falha()
    return n
  })
  if (!dias.length) falha()
  return { tipo, dias: [...new Set(dias)].sort() }
}

export function item(v: unknown): ItemProtocolo {
  const o = obj(v)
  const horarios = lista(o.horarios, 48).map((h) => {
    const s = str(h, 5)
    if (!HORA.test(s)) falha()
    return s
  })
  if (!horarios.length) falha()
  return {
    id: id(o.id),
    protocoloId: id(o.protocoloId),
    substanciaId: id(o.substanciaId),
    doseValor: num(o.doseValor, 0),
    doseUnidade: umDe(o.doseUnidade, UNIDADES),
    frequencia: frequencia(o.frequencia),
    horarios,
    frascoId: strOpc(o.frascoId, 200),
    ordem: typeof o.ordem === 'number' && Number.isFinite(o.ordem) ? o.ordem : 0,
  }
}

export function aplicacao(v: unknown): Aplicacao {
  const o = obj(v)
  const previsto = strOpc(o.previsto, 16)
  if (previsto && !(diaValido(previsto.slice(0, 10)) && previsto[10] === ' ' && HORA.test(previsto.slice(11)))) falha()
  return {
    id: id(o.id),
    protocoloId: id(o.protocoloId),
    itemId: id(o.itemId),
    substanciaId: id(o.substanciaId),
    previsto,
    dataHora: instanteIso(o.dataHora),
    doseValor: num(o.doseValor, 0),
    doseUnidade: umDe(o.doseUnidade, UNIDADES),
    local: strOpc(o.local, 100),
    frascoId: strOpc(o.frascoId, 200),
    status: umDe(o.status, ['feita', 'pulada'] as const),
    motivo: strOpc(o.motivo, 200),
    observacao: strOpc(o.observacao),
  }
}

export function medicao(v: unknown): Medicao {
  const o = obj(v)
  const m = o.medidas === undefined ? {} : obj(o.medidas)
  return {
    id: id(o.id),
    data: dia(o.data),
    pesoKg: numOpc(o.pesoKg, 0),
    medidas: { cintura: numOpc(m.cintura, 0), quadril: numOpc(m.quadril, 0), braco: numOpc(m.braco, 0), coxa: numOpc(m.coxa, 0) },
    nota: strOpc(o.nota),
  }
}

export function frasco(v: unknown): Frasco {
  const o = obj(v)
  return {
    id: id(o.id),
    substanciaId: id(o.substanciaId),
    mgTotal: num(o.mgTotal, 0),
    custo: numOpc(o.custo, 0),
    lote: strOpc(o.lote, 100),
    compradoEm: diaOpc(o.compradoEm),
    validade: diaOpc(o.validade),
    status: umDe(o.status, ['fechado', 'reconstituido', 'acabou', 'descartado'] as const),
    reconstituidoEm: diaOpc(o.reconstituidoEm),
    diluenteMl: numOpc(o.diluenteMl, 0),
    usarAte: diaOpc(o.usarAte),
    criadoEm: typeof o.criadoEm === 'string' ? o.criadoEm.slice(0, 40) : '',
  }
}

/** Config que viaja no arquivo: só chaves conhecidas, com o tipo certo. O resto é ignorado. */
const CONFIG_OK: Record<string, (v: unknown) => boolean> = {
  onboarding: (v) => typeof v === 'boolean',
  canais: (v) => !!v && typeof v === 'object' && typeof (v as Obj).agenda === 'boolean' && typeof (v as Obj).notificacao === 'boolean',
  ultimoBackup: (v) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime()),
  primeiroUso: (v) => typeof v === 'string' && diaValido(v),
  sugestoesVersao: (v) => typeof v === 'number' && Number.isFinite(v),
  agendaGeradaEm: (v) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime()),
  avisoVencimentoDias: (v) => typeof v === 'number' && Number.isFinite(v),
}

export function configs(v: unknown): ConfigItem[] {
  return lista(v, 100)
    .map((x) => obj(x))
    .filter((c) => typeof c.chave === 'string' && CONFIG_OK[c.chave]?.(c.valor))
    .map((c) => ({ chave: c.chave as string, valor: c.valor }))
}

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export interface FotoValida {
  id: string
  data: string
  angulo: 'frente' | 'lado' | 'costas'
  tipo: string
  dados: string
}

export function foto(v: unknown): FotoValida {
  const o = obj(v)
  const dados = str(o.dados, Math.ceil((LIMITES.bytesFoto * 4) / 3) + 4)
  if (!dados || dados.length % 4 !== 0 || !BASE64.test(dados)) falha()
  return {
    id: id(o.id),
    data: dia(o.data),
    angulo: umDe(o.angulo, ['frente', 'lado', 'costas'] as const),
    tipo: typeof o.tipo === 'string' && TIPOS_FOTO.includes(o.tipo) ? o.tipo : 'image/jpeg',
    dados,
  }
}

export interface TabelasValidas {
  substancias: Substancia[]
  protocolos: Protocolo[]
  itens: ItemProtocolo[]
  aplicacoes: Aplicacao[]
  medicoes: Medicao[]
  frascos: Frasco[]
  config: ConfigItem[]
}

export function validarTabelas(t: unknown): TabelasValidas {
  const o = obj(t)
  const porId = <T extends { id: string }>(xs: T[]) => semRepetir(xs, (x) => x.id)
  return {
    substancias: porId(lista(o.substancias).map(substancia)),
    protocolos: atribuirCores(porId(lista(o.protocolos).map(protocolo))),
    itens: porId(lista(o.itens).map(item)),
    aplicacoes: porId(lista(o.aplicacoes).map(aplicacao)),
    medicoes: porId(lista(o.medicoes).map(medicao)),
    frascos: porId(lista(o.frascos).map(frasco)),
    config: semRepetir(configs(o.config), (c) => c.chave),
  }
}

export function validarFotos(v: unknown): FotoValida[] {
  if (v === undefined || v === null) return []
  return semRepetir(lista(v, LIMITES.fotos).map(foto), (f) => f.id)
}
