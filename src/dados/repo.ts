// Repositório: única porta de entrada para ler e gravar dados. A UI não conhece o Dexie.
// Hoje grava no IndexedDB do aparelho; no futuro dá para trocar por uma versão com sincronização.
import type { BancoLocal } from './db.ts'
import { TABELAS } from './db.ts'
import type {
  Aplicacao,
  Foto,
  Frasco,
  ItemProtocolo,
  Medicao,
  Protocolo,
  Substancia,
} from '../dominio/tipos.ts'
import type { Sugestao } from '../dominio/sugestoes.ts'
import { normalizar } from '../dominio/sugestoes.ts'
import { hojeStr } from '../dominio/datas.ts'
import { fecharPausa } from '../dominio/agenda.ts'

export function novoId(): string {
  return crypto.randomUUID()
}

export const EVENTO_ARMAZENAMENTO_CHEIO = 'pt:armazenamento-cheio'

export function ehCotaCheia(e: unknown): boolean {
  let atual: unknown = e
  for (let i = 0; i < 4 && atual; i++) {
    const nome = (atual as { name?: string }).name ?? ''
    if (nome.includes('Quota')) return true
    atual = (atual as { inner?: unknown }).inner
  }
  return false
}

async function gravando<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (ehCotaCheia(e) && typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ARMAZENAMENTO_CHEIO))
    throw e
  }
}

export interface ConfigMapa {
  aceite: { versao: string; em: string }
  onboarding: boolean
  canais: { agenda: boolean; notificacao: boolean }
  ultimoBackup: string
  backupAdiadoAte: string
  primeiroUso: string
  reativarAvisos: boolean
  sugestoesVersao: number
  notificados: string[]
  agendaGeradaEm: string
  avisoVencimentoDias: number
}

export interface UsoSubstancia {
  protocolos: number
  protocolosAtivos: string[]
  frascos: number
  aplicacoes: number
}

export interface Contagens {
  protocolos: number
  aplicacoes: number
  medicoes: number
  fotos: number
  frascos: number
  substancias: number
}

export function criarRepo(db: BancoLocal) {
  const repo = {
    db,

    // ---------- config ----------
    async getConfig<K extends keyof ConfigMapa>(chave: K): Promise<ConfigMapa[K] | undefined> {
      const it = await db.config.get(chave)
      return it?.valor as ConfigMapa[K] | undefined
    },
    async setConfig<K extends keyof ConfigMapa>(chave: K, valor: ConfigMapa[K]): Promise<void> {
      await gravando(() => db.config.put({ chave, valor }))
    },
    async delConfig(chave: keyof ConfigMapa): Promise<void> {
      await db.config.delete(chave)
    },

    // ---------- substâncias ----------
    listarSubstancias(): Promise<Substancia[]> {
      return db.substancias.toArray()
    },
    async criarSubstancia(dados: Omit<Substancia, 'id' | 'criadaEm' | 'arquivada'> & { arquivada?: boolean }): Promise<Substancia> {
      const s: Substancia = { arquivada: false, ...dados, nome: dados.nome.trim(), id: novoId(), criadaEm: new Date().toISOString() }
      await gravando(() => db.substancias.add(s))
      return s
    },
    async atualizarSubstancia(s: Substancia): Promise<void> {
      await gravando(() => db.substancias.put({ ...s, nome: s.nome.trim() }))
    },
    /** Usa um nome da lista: reaproveita a cópia que a pessoa já tem ou cria uma (origem = lista). */
    async usarSugestao(sug: Sugestao): Promise<Substancia> {
      const existente = await db.substancias.where('listaId').equals(sug.id).first()
      if (existente) {
        if (existente.arquivada) await db.substancias.update(existente.id, { arquivada: false })
        return { ...existente, arquivada: false }
      }
      return repo.criarSubstancia({ nome: sug.nome, tipo: sug.tipo, origem: 'lista', listaId: sug.id, componentes: sug.tipo === 'blend' ? [] : undefined })
    },
    /** Acha substância da pessoa pelo nome (ignorando acento/hífen) ou cria uma nova. */
    async substanciaPorNome(nome: string, tipo: Substancia['tipo'] = 'simples'): Promise<Substancia> {
      const alvo = normalizar(nome)
      const todas = await db.substancias.toArray()
      const achou = todas.find((s) => normalizar(s.nome) === alvo && s.tipo === tipo)
      if (achou) return achou
      return repo.criarSubstancia({ nome, tipo, origem: 'usuario', componentes: tipo === 'blend' ? [] : undefined })
    },
    async usoSubstancia(id: string): Promise<UsoSubstancia> {
      const itens = await db.itens.where('substanciaId').equals(id).toArray()
      const protIds = [...new Set(itens.map((i) => i.protocoloId))]
      const prots = (await db.protocolos.bulkGet(protIds)).filter(Boolean) as Protocolo[]
      return {
        protocolos: prots.length,
        protocolosAtivos: prots.filter((p) => p.estado !== 'encerrado').map((p) => p.id),
        frascos: await db.frascos.where('substanciaId').equals(id).count(),
        aplicacoes: await db.aplicacoes.where('substanciaId').equals(id).count(),
      }
    },
    async arquivarSubstancia(id: string, arquivada = true): Promise<void> {
      await gravando(() => db.substancias.update(id, { arquivada }))
    },
    /** Só apaga se não estiver em uso (protocolo, frasco ou registro). */
    async apagarSubstancia(id: string): Promise<void> {
      const uso = await repo.usoSubstancia(id)
      if (uso.protocolos || uso.frascos || uso.aplicacoes) throw new Error('Substância em uso: só pode ser arquivada')
      await db.substancias.delete(id)
    },

    // ---------- protocolos ----------
    listarProtocolos(): Promise<Protocolo[]> {
      return db.protocolos.toArray()
    },
    listarItens(): Promise<ItemProtocolo[]> {
      return db.itens.toArray()
    },
    async obterProtocolo(id: string): Promise<{ protocolo: Protocolo; itens: ItemProtocolo[] } | undefined> {
      const protocolo = await db.protocolos.get(id)
      if (!protocolo) return undefined
      const itens = (await db.itens.where('protocoloId').equals(id).toArray()).sort((a, b) => a.ordem - b.ordem)
      return { protocolo, itens }
    },
    /** Cria ou substitui o protocolo e suas linhas. Linhas removidas somem; registros antigos ficam. */
    async salvarProtocolo(p: Protocolo, itens: ItemProtocolo[]): Promise<void> {
      await gravando(() =>
        db.transaction('rw', db.protocolos, db.itens, async () => {
          const nome = p.nome?.trim()
          await db.protocolos.put({ ...p, nome: nome ? nome : undefined })
          const atuais = await db.itens.where('protocoloId').equals(p.id).primaryKeys()
          const manter = new Set(itens.map((i) => i.id))
          await db.itens.bulkDelete(atuais.filter((id) => !manter.has(id)))
          await db.itens.bulkPut(itens.map((i, ordem) => ({ ...i, protocoloId: p.id, ordem })))
        }),
      )
    },
    async pausarProtocolo(id: string, ate?: string): Promise<void> {
      await gravando(() => db.protocolos.update(id, { estado: 'pausado', pausadoDesde: hojeStr(), pausadoAte: ate }))
    },
    /** Retoma. A pausa vai para o histórico (`pausas`), para os dias dela não aparecerem como perdidos. */
    async retomarProtocolo(id: string, hoje = hojeStr()): Promise<void> {
      await gravando(async () => {
        const p = await db.protocolos.get(id)
        if (!p) return
        const ate = p.pausadoAte && p.pausadoAte < hoje ? p.pausadoAte : hoje
        await db.protocolos.update(id, { estado: 'ativo', pausadoDesde: undefined, pausadoAte: undefined, pausas: fecharPausa(p, ate) })
      })
    },
    async encerrarProtocolo(id: string, hoje = hojeStr()): Promise<void> {
      await gravando(async () => {
        const p = await db.protocolos.get(id)
        if (!p) return
        const pausas = p.estado === 'pausado' ? fecharPausa(p, p.pausadoAte && p.pausadoAte < hoje ? p.pausadoAte : hoje) : p.pausas
        await db.protocolos.update(id, { estado: 'encerrado', encerradoEm: hoje, pausadoDesde: undefined, pausadoAte: undefined, pausas })
      })
    },
    /** Apaga o protocolo, suas linhas e todos os registros de dose dele. Frascos e substâncias ficam. */
    async apagarProtocolo(id: string): Promise<{ registros: number }> {
      return gravando(() =>
        db.transaction('rw', db.protocolos, db.itens, db.aplicacoes, async () => {
          const registros = await db.aplicacoes.where('protocoloId').equals(id).delete()
          await db.itens.where('protocoloId').equals(id).delete()
          await db.protocolos.delete(id)
          return { registros }
        }),
      )
    },
    async lembretesProtocolo(id: string, ligado: boolean): Promise<void> {
      await gravando(() => db.protocolos.update(id, { lembretes: ligado }))
    },
    /** Pausas com data vencida voltam a ativo (chamado ao abrir o app). */
    async normalizarPausas(hoje = hojeStr()): Promise<void> {
      const pausados = await db.protocolos.where('estado').equals('pausado').toArray()
      for (const p of pausados) if (p.pausadoAte && p.pausadoAte <= hoje) await repo.retomarProtocolo(p.id, hoje)
    },

    // ---------- aplicações ----------
    listarAplicacoes(): Promise<Aplicacao[]> {
      return db.aplicacoes.toArray()
    },
    async registrarAplicacao(a: Omit<Aplicacao, 'id'> & { id?: string }): Promise<Aplicacao> {
      const ap: Aplicacao = { ...a, id: a.id ?? novoId() }
      await gravando(() =>
        db.transaction('rw', db.aplicacoes, async () => {
          // um registro por horário previsto: registrar de novo substitui o anterior
          if (ap.previsto) {
            const antigos = await db.aplicacoes.where('previsto').equals(ap.previsto).filter((x) => x.itemId === ap.itemId && x.id !== ap.id).primaryKeys()
            await db.aplicacoes.bulkDelete(antigos)
          }
          await db.aplicacoes.put(ap)
        }),
      )
      return ap
    },
    async apagarAplicacao(id: string): Promise<Aplicacao | undefined> {
      const a = await db.aplicacoes.get(id)
      await db.aplicacoes.delete(id)
      return a
    },
    async restaurarAplicacao(a: Aplicacao): Promise<void> {
      await gravando(() => db.aplicacoes.put(a))
    },

    // ---------- medições e fotos ----------
    listarMedicoes(): Promise<Medicao[]> {
      return db.medicoes.orderBy('data').toArray()
    },
    async salvarMedicao(m: Omit<Medicao, 'id'> & { id?: string }): Promise<Medicao> {
      const med: Medicao = { ...m, id: m.id ?? novoId() }
      await gravando(() => db.medicoes.put(med))
      return med
    },
    async apagarMedicao(id: string): Promise<Medicao | undefined> {
      const m = await db.medicoes.get(id)
      await db.medicoes.delete(id)
      return m
    },
    async restaurarMedicao(m: Medicao): Promise<void> {
      await gravando(() => db.medicoes.put(m))
    },
    listarFotos(): Promise<Foto[]> {
      return db.fotos.orderBy('data').toArray()
    },
    async adicionarFoto(f: Omit<Foto, 'id'>): Promise<Foto> {
      const foto: Foto = { ...f, id: novoId() }
      await gravando(() => db.fotos.add(foto))
      return foto
    },
    async apagarFoto(id: string): Promise<void> {
      await db.fotos.delete(id)
    },

    // ---------- frascos ----------
    listarFrascos(): Promise<Frasco[]> {
      return db.frascos.toArray()
    },
    async salvarFrasco(f: Omit<Frasco, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string }): Promise<Frasco> {
      const fr: Frasco = { ...f, id: f.id ?? novoId(), criadoEm: f.criadoEm ?? new Date().toISOString() }
      await gravando(() => db.frascos.put(fr))
      return fr
    },
    async statusFrasco(id: string, status: Frasco['status']): Promise<void> {
      await gravando(() => db.frascos.update(id, { status }))
    },
    /** Apaga o frasco; registros que apontavam para ele ficam sem frasco. */
    async apagarFrasco(id: string): Promise<void> {
      await db.transaction('rw', db.frascos, db.aplicacoes, db.itens, async () => {
        await db.aplicacoes.where('frascoId').equals(id).modify({ frascoId: undefined })
        await db.itens.filter((i) => i.frascoId === id).modify({ frascoId: undefined })
        await db.frascos.delete(id)
      })
    },

    // ---------- geral ----------
    async contagens(): Promise<Contagens> {
      return {
        protocolos: await db.protocolos.count(),
        aplicacoes: await db.aplicacoes.count(),
        medicoes: await db.medicoes.count(),
        fotos: await db.fotos.count(),
        frascos: await db.frascos.count(),
        substancias: await db.substancias.count(),
      }
    },
    /** Apaga tudo deste aparelho, inclusive o aceite do aviso. */
    async apagarTudo(): Promise<void> {
      await db.transaction('rw', TABELAS.map((t) => db.table(t)), async () => {
        for (const t of TABELAS) await db.table(t).clear()
      })
    },
  }
  return repo
}

export type Repo = ReturnType<typeof criarRepo>
