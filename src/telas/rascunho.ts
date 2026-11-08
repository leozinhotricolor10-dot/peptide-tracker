// Rascunho do protocolo em criação/edição, guardado na sessão (sobrevive a recarregar a página).
import { useSyncExternalStore } from 'react'
import type { Frequencia, ItemProtocolo, Protocolo, UnidadeDose } from '../dominio/tipos.ts'
import { difDias, hojeStr, somaDias } from '../dominio/datas.ts'
import { fmtNum, lerNumero } from '../dominio/calculos.ts'
import { novoId } from '../dados/repo.ts'

export interface ItemRascunho {
  id: string
  substanciaId?: string
  doseTxt: string
  doseUnidade?: UnidadeDose
  freqTipo: 'diaria' | 'cadaN' | 'semana'
  cadaN: string
  dias: number[]
  horarios: string[]
  frascoId?: string
}

export interface Rascunho {
  modo: 'novo' | 'editar' | 'duplicar'
  protocoloId: string
  base?: Protocolo
  nome: string
  inicio: string
  duracaoTipo: 'semanas' | 'dias' | 'sem-fim'
  duracaoValor: string
  ciclo: boolean
  diasOn: string
  diasOff: string
  itens: ItemRascunho[]
  atual: number
  antes?: string
}

const CHAVE = 'pt-rascunho'
let estado: Rascunho | null = (() => {
  try {
    const t = sessionStorage.getItem(CHAVE)
    return t ? (JSON.parse(t) as Rascunho) : null
  } catch {
    return null
  }
})()
const ouvintes = new Set<() => void>()

function gravar(r: Rascunho | null) {
  estado = r
  try {
    if (r) sessionStorage.setItem(CHAVE, JSON.stringify(r))
    else sessionStorage.removeItem(CHAVE)
  } catch {
    /* sem sessionStorage: segue só em memória */
  }
  ouvintes.forEach((f) => f())
}

export function itemVazio(): ItemRascunho {
  return { id: novoId(), doseTxt: '', freqTipo: 'diaria', cadaN: '2', dias: [], horarios: [] }
}

export function novoRascunho(): Rascunho {
  return {
    modo: 'novo',
    protocoloId: novoId(),
    nome: '',
    inicio: hojeStr(),
    duracaoTipo: 'semanas',
    duracaoValor: '8',
    ciclo: false,
    diasOn: '5',
    diasOff: '2',
    itens: [itemVazio()],
    atual: 0,
  }
}

function paraItemRascunho(i: ItemProtocolo, manterId: boolean): ItemRascunho {
  return {
    id: manterId ? i.id : novoId(),
    substanciaId: i.substanciaId,
    doseTxt: fmtNum(i.doseValor).replace(/\./g, ''),
    doseUnidade: i.doseUnidade,
    freqTipo: i.frequencia.tipo,
    cadaN: i.frequencia.tipo === 'cadaN' ? String(i.frequencia.n) : '2',
    dias: i.frequencia.tipo === 'semana' ? i.frequencia.dias : [],
    horarios: [...i.horarios],
    frascoId: i.frascoId,
  }
}

export function rascunhoDe(p: Protocolo, itens: ItemProtocolo[], modo: 'editar' | 'duplicar', antes: string): Rascunho {
  const dur = p.fim ? difDias(p.inicio, p.fim) + 1 : 0
  return {
    modo,
    protocoloId: modo === 'editar' ? p.id : novoId(),
    base: modo === 'editar' ? p : undefined,
    nome: p.nome ?? '',
    inicio: modo === 'duplicar' ? hojeStr() : p.inicio,
    duracaoTipo: !p.fim ? 'sem-fim' : dur % 7 === 0 ? 'semanas' : 'dias',
    duracaoValor: !p.fim ? '8' : String(dur % 7 === 0 ? dur / 7 : dur),
    ciclo: !!p.ciclo,
    diasOn: String(p.ciclo?.diasOn ?? 5),
    diasOff: String(p.ciclo?.diasOff ?? 2),
    itens: itens.map((i) => paraItemRascunho(i, modo === 'editar')),
    atual: 0,
    antes,
  }
}

export function useRascunho(): Rascunho | null {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => estado,
    () => estado,
  )
}

export const rascunho = {
  get: () => estado,
  iniciar: (r: Rascunho) => gravar(r),
  limpar: () => gravar(null),
  mudar: (f: (r: Rascunho) => Partial<Rascunho>) => {
    if (estado) gravar({ ...estado, ...f(estado) })
  },
  mudarItem: (f: (i: ItemRascunho) => Partial<ItemRascunho>) => {
    if (!estado) return
    const itens = estado.itens.map((i, k) => (k === estado!.atual ? { ...i, ...f(i) } : i))
    gravar({ ...estado, itens })
  },
}

export function frequenciaDe(i: ItemRascunho): Frequencia {
  if (i.freqTipo === 'cadaN') return { tipo: 'cadaN', n: Math.max(1, Math.floor(lerNumero(i.cadaN) ?? 1)) }
  if (i.freqTipo === 'semana') return { tipo: 'semana', dias: [...i.dias].sort() }
  return { tipo: 'diaria' }
}

export function fimDe(r: Rascunho): string | undefined {
  if (r.duracaoTipo === 'sem-fim') return undefined
  const n = Math.max(1, Math.floor(lerNumero(r.duracaoValor) ?? 1))
  return somaDias(r.inicio, (r.duracaoTipo === 'semanas' ? n * 7 : n) - 1)
}

export interface Validacao {
  ok: boolean
  erros: string[]
}

export function validarRascunho(r: Rascunho): Validacao {
  const erros: string[] = []
  if (!r.inicio) erros.push('Informe quando começa.')
  if (r.duracaoTipo !== 'sem-fim' && !((lerNumero(r.duracaoValor) ?? 0) >= 1)) erros.push('A duração precisa ser 1 ou mais.')
  if (r.ciclo && (!((lerNumero(r.diasOn) ?? 0) >= 1) || !((lerNumero(r.diasOff) ?? -1) >= 0))) erros.push('Confira os dias do ciclo.')
  r.itens.forEach((i, k) => {
    const p = r.itens.length > 1 ? `Linha ${k + 1}: ` : ''
    if (!i.substanciaId) erros.push(`${p}escolha a substância.`)
    if (!((lerNumero(i.doseTxt) ?? 0) > 0) || !i.doseUnidade) erros.push(`${p}informe a dose e a unidade.`)
    if (!i.horarios.length) erros.push(`${p}adicione pelo menos um horário.`)
    if (i.freqTipo === 'semana' && !i.dias.length) erros.push(`${p}escolha os dias da semana.`)
  })
  if ([...r.nome].length > 40) erros.push('O nome pode ter até 40 caracteres.')
  return { ok: erros.length === 0, erros }
}

export function montarProtocolo(r: Rascunho): { protocolo: Protocolo; itens: ItemProtocolo[] } {
  const b = r.base
  const protocolo: Protocolo = {
    id: r.protocoloId,
    nome: r.nome.trim() || undefined,
    inicio: r.inicio,
    fim: fimDe(r),
    ciclo: r.ciclo ? { diasOn: Math.floor(lerNumero(r.diasOn) ?? 1), diasOff: Math.floor(lerNumero(r.diasOff) ?? 0) } : undefined,
    estado: b?.estado ?? 'ativo',
    pausadoDesde: b?.pausadoDesde,
    pausadoAte: b?.pausadoAte,
    pausas: b?.pausas,
    encerradoEm: b?.encerradoEm,
    lembretes: b?.lembretes ?? true,
    notas: b?.notas,
    criadoEm: b?.criadoEm ?? new Date().toISOString(),
  }
  const itens: ItemProtocolo[] = r.itens.map((i, ordem) => ({
    id: i.id,
    protocoloId: r.protocoloId,
    substanciaId: i.substanciaId!,
    doseValor: lerNumero(i.doseTxt) ?? 0,
    doseUnidade: i.doseUnidade ?? 'mg',
    frequencia: frequenciaDe(i),
    horarios: [...new Set(i.horarios)].sort(),
    frascoId: i.frascoId,
    ordem,
  }))
  return { protocolo, itens }
}
