// Ponto único que a UI usa para dados: instância do repositório + hooks reativos.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.ts'
import { criarRepo, type ConfigMapa } from './repo.ts'
import type { Aplicacao, Frasco, ItemProtocolo, Medicao, Protocolo, Substancia } from '../dominio/tipos.ts'

export const repo = criarRepo(db)

export interface Base {
  substancias: Substancia[]
  subs: Map<string, Substancia>
  protocolos: Protocolo[]
  itens: ItemProtocolo[]
  aplicacoes: Aplicacao[]
  frascos: Frasco[]
  medicoes: Medicao[]
}

/** Todos os dados (sem fotos), reativos. `undefined` enquanto carrega. */
export function useBase(): Base | undefined {
  return useLiveQuery(async () => {
    const [substancias, protocolos, itens, aplicacoes, frascos, medicoes] = await Promise.all([
      repo.listarSubstancias(),
      repo.listarProtocolos(),
      repo.listarItens(),
      repo.listarAplicacoes(),
      repo.listarFrascos(),
      repo.listarMedicoes(),
    ])
    itens.sort((a, b) => a.ordem - b.ordem)
    return { substancias, subs: new Map(substancias.map((s) => [s.id, s])), protocolos, itens, aplicacoes, frascos, medicoes }
  })
}

/** Valor de configuração. `carregado` diferencia "ainda lendo" de "não existe". */
export function useConfig<K extends keyof ConfigMapa>(chave: K): { carregado: boolean; valor: ConfigMapa[K] | undefined } {
  const r = useLiveQuery(async () => ({ v: await repo.getConfig(chave) }), [chave])
  return { carregado: r !== undefined, valor: r?.v }
}

export function useFotos() {
  return useLiveQuery(() => repo.listarFotos())
}
