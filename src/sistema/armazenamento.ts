// Armazenamento persistente (navigator.storage.persist): pede ao navegador para não apagar os dados
// do app quando faltar espaço. No Chrome e no Safari não abre janela; no Firefox pode perguntar uma
// vez, por isso o app só pede em momentos em que faz sentido (primeiro protocolo e backup).

export type EstadoArmazenamento = 'protegido' | 'nao-protegido' | 'sem-suporte'

/** Só o que o app usa de navigator.storage (permite testar sem navegador). */
export interface StorageMin {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

function storagePadrao(): StorageMin | undefined {
  return typeof navigator !== 'undefined' ? (navigator.storage as StorageMin | undefined) : undefined
}

/** Estado atual, sem pedir nada. */
export async function estadoArmazenamento(st: StorageMin | undefined = storagePadrao()): Promise<EstadoArmazenamento> {
  if (!st || typeof st.persisted !== 'function') return 'sem-suporte'
  try {
    return (await st.persisted()) ? 'protegido' : 'nao-protegido'
  } catch {
    return 'sem-suporte'
  }
}

/** Pede proteção se ainda não tem. Nunca lança: sem API ou com falha, só devolve o estado. */
export async function pedirArmazenamentoPersistente(st: StorageMin | undefined = storagePadrao()): Promise<EstadoArmazenamento> {
  const atual = await estadoArmazenamento(st)
  if (atual !== 'nao-protegido' || typeof st?.persist !== 'function') return atual
  try {
    return (await st.persist()) ? 'protegido' : 'nao-protegido'
  } catch {
    return 'nao-protegido'
  }
}
