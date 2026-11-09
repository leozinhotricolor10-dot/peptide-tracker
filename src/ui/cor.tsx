// Acento de cor do protocolo (borda do cartão e bolinha ao lado do nome). Decorativo: o nome do
// protocolo sempre aparece junto, então a cor nunca é a única forma de identificar.
import type { CSSProperties } from 'react'
import { corDe } from '../dominio/cores.ts'
import type { Protocolo } from '../dominio/tipos.ts'

export function PontoCor({ protocolo, tam = 10 }: { protocolo: Pick<Protocolo, 'id' | 'cor'> | undefined; tam?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: tam, height: tam, backgroundColor: corDe(protocolo).hex }} />
}

/** Borda esquerda grossa na cor do protocolo (usar com a classe `border-l-[5px]`). */
export function bordaCor(protocolo: Pick<Protocolo, 'id' | 'cor'> | undefined): CSSProperties {
  return { borderLeftColor: corDe(protocolo).hex }
}
