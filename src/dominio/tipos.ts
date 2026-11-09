// Modelo de dados local. Datas de dia em 'AAAA-MM-DD' (horário local),
// horários em 'HH:MM', instantes em ISO 8601.

export type TipoSubstancia = 'simples' | 'blend'

export interface Componente {
  nome: string
  quantidade?: number
  unidade?: 'mg' | 'mcg'
}

export interface Substancia {
  id: string
  nome: string
  tipo: TipoSubstancia
  componentes?: Componente[]
  origem: 'lista' | 'usuario'
  /** id do item da lista de sugestões de onde veio (quando origem = lista) */
  listaId?: string
  arquivada: boolean
  criadaEm: string
}

export type UnidadeDose = 'mg' | 'mcg' | 'UI' | 'mL' | 'unidades'

export type Frequencia =
  | { tipo: 'diaria' }
  | { tipo: 'cadaN'; n: number }
  | { tipo: 'semana'; dias: number[] } // 0 = domingo

export interface Ciclo {
  diasOn: number
  diasOff: number
}

export type EstadoProtocolo = 'ativo' | 'pausado' | 'encerrado'

export interface Protocolo {
  id: string
  /** Opcional: vazio = nome da substância da 1ª linha */
  nome?: string
  inicio: string
  fim?: string
  ciclo?: Ciclo
  estado: EstadoProtocolo
  pausadoDesde?: string
  /** Pausa até esta data (exclusive: volta neste dia). Vazio = sem data. */
  pausadoAte?: string
  /** Pausas já terminadas: de (inclusive) até (exclusive). Os dias nelas não geram dose nem contam como perdidos. */
  pausas?: { de: string; ate: string }[]
  encerradoEm?: string
  lembretes: boolean
  notas?: string
  criadoEm: string
  /** Cor do cartão (id da paleta em dominio/cores.ts). Só para reconhecer de relance; o nome continua visível. */
  cor?: string
}

export interface ItemProtocolo {
  id: string
  protocoloId: string
  substanciaId: string
  doseValor: number
  doseUnidade: UnidadeDose
  frequencia: Frequencia
  horarios: string[]
  frascoId?: string
  ordem: number
}

export interface Aplicacao {
  id: string
  protocoloId: string
  itemId: string
  substanciaId: string
  /** Chave do horário previsto: 'AAAA-MM-DD HH:MM' (vazio = registro avulso) */
  previsto?: string
  dataHora: string
  doseValor: number
  doseUnidade: UnidadeDose
  local?: string
  frascoId?: string
  status: 'feita' | 'pulada'
  motivo?: string
  observacao?: string
}

export interface Medicao {
  id: string
  data: string
  pesoKg?: number
  medidas: { cintura?: number; quadril?: number; braco?: number; coxa?: number }
  nota?: string
}

export type Angulo = 'frente' | 'lado' | 'costas'

export interface Foto {
  id: string
  data: string
  angulo: Angulo
  blob: Blob
  tipo: string
}

export type StatusFrasco = 'fechado' | 'reconstituido' | 'acabou' | 'descartado'

export interface Frasco {
  id: string
  substanciaId: string
  mgTotal: number
  custo?: number
  lote?: string
  compradoEm?: string
  validade?: string
  status: StatusFrasco
  reconstituidoEm?: string
  diluenteMl?: number
  usarAte?: string
  criadoEm: string
}

export interface ConfigItem {
  chave: string
  valor: unknown
}
