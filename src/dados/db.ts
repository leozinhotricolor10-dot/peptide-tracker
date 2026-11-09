// Banco local (IndexedDB via Dexie). Só o repositório (repo.ts) e o backup importam este arquivo:
// a UI fala com o repositório, para dar para trocar por sincronização no futuro.
import { Dexie, type EntityTable } from 'dexie'
import { atribuirCores } from '../dominio/cores.ts'
import type { Aplicacao, ConfigItem, Foto, Frasco, ItemProtocolo, Medicao, Protocolo, Substancia } from '../dominio/tipos.ts'

export class BancoLocal extends Dexie {
  substancias!: EntityTable<Substancia, 'id'>
  protocolos!: EntityTable<Protocolo, 'id'>
  itens!: EntityTable<ItemProtocolo, 'id'>
  aplicacoes!: EntityTable<Aplicacao, 'id'>
  medicoes!: EntityTable<Medicao, 'id'>
  fotos!: EntityTable<Foto, 'id'>
  frascos!: EntityTable<Frasco, 'id'>
  config!: EntityTable<ConfigItem, 'chave'>

  constructor(nome = 'peptide-tracker') {
    super(nome)
    this.version(1).stores({
      substancias: 'id, nome, listaId',
      protocolos: 'id, estado, inicio',
      itens: 'id, protocoloId, substanciaId',
      aplicacoes: 'id, protocoloId, itemId, substanciaId, frascoId, dataHora, previsto',
      medicoes: 'id, data',
      fotos: 'id, data, angulo',
      frascos: 'id, substanciaId, status',
      config: 'chave',
    })
    // v2: cada protocolo ganha uma cor própria (os que já existem recebem cores diferentes entre si).
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        const tabela = tx.table<Protocolo, string>('protocolos')
        const todos = await tabela.toArray()
        const comCor = atribuirCores(todos)
        await tabela.bulkPut(comCor)
      })
  }
}

export const TABELAS = ['substancias', 'protocolos', 'itens', 'aplicacoes', 'medicoes', 'fotos', 'frascos', 'config'] as const
export type NomeTabela = (typeof TABELAS)[number]

export const db = new BancoLocal()
