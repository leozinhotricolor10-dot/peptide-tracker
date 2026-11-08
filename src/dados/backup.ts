// Backup local: um arquivo .json com todas as tabelas e as fotos (base64). Sem rede.
import type { Repo } from './repo.ts'
import type { Aplicacao, ConfigItem, Foto, Frasco, ItemProtocolo, Medicao, Protocolo, Substancia } from '../dominio/tipos.ts'
import { validarFotos, validarTabelas } from './validar.ts'

export const APP_BACKUP = 'peptide-tracker'
export const FORMATO_BACKUP = 1

/** Config que é do aparelho e não viaja no arquivo. */
const CONFIG_LOCAL = new Set(['aceite', 'notificados', 'reativarAvisos', 'backupAdiadoAte'])

interface FotoArquivo extends Omit<Foto, 'blob'> {
  dados: string
}

export interface ArquivoBackup {
  app: typeof APP_BACKUP
  formato: number
  exportadoEm: string
  tabelas: {
    substancias: Substancia[]
    protocolos: Protocolo[]
    itens: ItemProtocolo[]
    aplicacoes: Aplicacao[]
    medicoes: Medicao[]
    frascos: Frasco[]
    config: ConfigItem[]
  }
  fotos: FotoArquivo[]
}

export interface PreviaBackup {
  arquivo: ArquivoBackup
  exportadoEm: string
  contagens: { protocolos: number; aplicacoes: number; medicoes: number; fotos: number; frascos: number }
  tinhaNotificacao: boolean
}

function paraBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const passo = 0x8000
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo))
  return btoa(bin)
}

function deBase64(b64: string, tipo: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

export async function montarBackup(repo: Repo, incluirFotos: boolean, agora = new Date()): Promise<ArquivoBackup> {
  const db = repo.db
  const fotos: FotoArquivo[] = []
  if (incluirFotos) {
    for (const f of await db.fotos.toArray()) {
      const { blob, ...meta } = f
      fotos.push({ ...meta, dados: paraBase64(await blob.arrayBuffer()) })
    }
  }
  return {
    app: APP_BACKUP,
    formato: FORMATO_BACKUP,
    exportadoEm: agora.toISOString(),
    tabelas: {
      substancias: await db.substancias.toArray(),
      protocolos: await db.protocolos.toArray(),
      itens: await db.itens.toArray(),
      aplicacoes: await db.aplicacoes.toArray(),
      medicoes: await db.medicoes.toArray(),
      frascos: await db.frascos.toArray(),
      config: (await db.config.toArray()).filter((c) => !CONFIG_LOCAL.has(c.chave)),
    },
    fotos,
  }
}

/** Arquivos maiores que isso nem são lidos (protege a memória do celular). */
export const TAMANHO_MAX_BACKUP = 300 * 1024 * 1024

/** Lê e valida o texto do arquivo. Lança Error com mensagem simples se não for um backup válido. */
export function lerBackup(texto: string): PreviaBackup {
  let obj: unknown
  try {
    obj = JSON.parse(texto)
  } catch {
    throw new Error('O arquivo não é um backup deste app.')
  }
  const a = obj as Partial<ArquivoBackup> | null
  if (!a || typeof a !== 'object' || a.app !== APP_BACKUP || typeof a.formato !== 'number') throw new Error('O arquivo não é um backup deste app.')
  if (a.formato > FORMATO_BACKUP) throw new Error('Este backup é de uma versão mais nova do app. Atualize o app e tente de novo.')
  if (a.formato < 1) throw new Error('O arquivo não é um backup deste app.')
  // Cada registro é reconstruído só com campos conhecidos e tipos conferidos (validar.ts).
  const t = validarTabelas(a.tabelas)
  const fotos = validarFotos(a.fotos)
  const exportadoEm = typeof a.exportadoEm === 'string' && !Number.isNaN(new Date(a.exportadoEm).getTime()) ? a.exportadoEm : ''
  const arquivo: ArquivoBackup = { app: APP_BACKUP, formato: FORMATO_BACKUP, exportadoEm, tabelas: t, fotos }
  const canais = t.config.find((c) => c.chave === 'canais')?.valor as { notificacao?: boolean } | undefined
  return {
    arquivo,
    exportadoEm,
    contagens: {
      protocolos: t.protocolos.length,
      aplicacoes: t.aplicacoes.length,
      medicoes: t.medicoes.length,
      fotos: fotos.length,
      frascos: t.frascos.length,
    },
    tinhaNotificacao: !!canais?.notificacao,
  }
}

/** Troca TODOS os dados deste aparelho pelos do arquivo (o aceite do aviso deste aparelho é mantido). */
export async function aplicarBackup(repo: Repo, previa: PreviaBackup): Promise<void> {
  const db = repo.db
  const { tabelas, fotos } = previa.arquivo
  const fotosBlob: Foto[] = fotos.map(({ dados, ...meta }) => ({ ...meta, blob: deBase64(dados, meta.tipo || 'image/jpeg') }))
  await db.transaction('rw', [db.substancias, db.protocolos, db.itens, db.aplicacoes, db.medicoes, db.frascos, db.fotos, db.config], async () => {
    const manter = (await db.config.toArray()).filter((c) => c.chave === 'aceite')
    await Promise.all([
      db.substancias.clear(), db.protocolos.clear(), db.itens.clear(), db.aplicacoes.clear(),
      db.medicoes.clear(), db.frascos.clear(), db.fotos.clear(), db.config.clear(),
    ])
    await db.substancias.bulkAdd(tabelas.substancias)
    await db.protocolos.bulkAdd(tabelas.protocolos)
    await db.itens.bulkAdd(tabelas.itens)
    await db.aplicacoes.bulkAdd(tabelas.aplicacoes)
    await db.medicoes.bulkAdd(tabelas.medicoes)
    await db.frascos.bulkAdd(tabelas.frascos)
    await db.fotos.bulkAdd(fotosBlob)
    await db.config.bulkAdd([...tabelas.config.filter((c) => !CONFIG_LOCAL.has(c.chave)), ...manter])
    await db.config.put({ chave: 'onboarding', valor: true })
    // quem restaurou tem um backup (o próprio arquivo): conta a partir da data dele
    const ultimo = tabelas.config.find((c) => c.chave === 'ultimoBackup')?.valor as string | undefined
    if (previa.exportadoEm && (!ultimo || ultimo < previa.exportadoEm)) await db.config.put({ chave: 'ultimoBackup', valor: previa.exportadoEm })
    if (previa.tinhaNotificacao) await db.config.put({ chave: 'reativarAvisos', valor: true })
  })
}

export function nomeArquivoBackup(agora = new Date()): string {
  const d = agora
  const p = (n: number) => String(n).padStart(2, '0')
  return `peptide-tracker-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

/** Tamanho aproximado do arquivo em bytes (fotos em base64 crescem ~4/3). */
export async function tamanhoEstimado(repo: Repo, incluirFotos: boolean): Promise<{ bytes: number; fotos: number }> {
  const db = repo.db
  const fotos = await db.fotos.toArray()
  const semFotos = JSON.stringify({
    a: await db.substancias.toArray(), b: await db.protocolos.toArray(), c: await db.itens.toArray(),
    d: await db.aplicacoes.toArray(), e: await db.medicoes.toArray(), f: await db.frascos.toArray(),
  }).length
  const fotosBytes = incluirFotos ? fotos.reduce((s, f) => s + Math.ceil((f.blob.size * 4) / 3) + 200, 0) : 0
  return { bytes: semFotos + fotosBytes, fotos: fotos.length }
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
