// Ponte entre a base carregada e dominio/unidades.ts: o texto da dose ("2 mg · 10 un") que todas as
// telas mostram. A conta é sempre a mesma função do domínio; aqui só se escolhe o frasco e o blend.
import type { Base } from '../dados/index.ts'
import type { Aplicacao } from '../dominio/tipos.ts'
import { hojeStr } from '../dominio/datas.ts'
import { doseComUnidades, doseDoRegistro, textoDoseUn, type DoseDoItem, type DoseUn } from '../dominio/unidades.ts'

export function ehBlend(base: Base, substanciaId: string): boolean {
  return base.subs.get(substanciaId)?.tipo === 'blend'
}

// A escolha do frasco percorre o saldo de cada frasco; numa tela com várias doses da mesma linha
// a conta é feita uma vez por base (a base é um objeto novo a cada mudança no banco).
const cache = new WeakMap<Base, Map<string, DoseDoItem | null>>()

/** Dose da linha com as unidades do frasco que a próxima dose usaria. */
export function doseDoItem(base: Base, itemId: string, hoje = hojeStr()): DoseDoItem | null {
  let m = cache.get(base)
  if (!m) cache.set(base, (m = new Map()))
  const chave = `${itemId}|${hoje}`
  if (m.has(chave)) return m.get(chave)!
  const i = base.itens.find((x) => x.id === itemId)
  const d = i ? doseComUnidades(i, base.frascos, base.aplicacoes, hoje, ehBlend(base, i.substanciaId)) : null
  m.set(chave, d)
  return d
}

/** "2 mg · 10 un" de uma linha de protocolo ('' se a linha não existe). */
export function textoDoItem(base: Base, itemId: string): string {
  const d = doseDoItem(base, itemId)
  return d ? textoDoseUn(d) : ''
}

export function doseDoRegistroBase(base: Base, a: Aplicacao): DoseUn {
  return doseDoRegistro(a, base.frascos, ehBlend(base, a.substanciaId))
}

/** "2 mg · 10 un" de um registro feito (unidades gravadas na hora do registro). */
export function textoDoRegistro(base: Base, a: Aplicacao): string {
  return textoDoseUn(doseDoRegistroBase(base, a))
}
