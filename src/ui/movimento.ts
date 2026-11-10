// Movimento do app: contas puras (testadas em movimento.test.ts) + hooks pequenos.
// Regra: animação nunca atrasa nem bloqueia uma gravação. Ela começa junto (otimista) e,
// se a gravação falhar, volta atrás com mensagem.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** O aparelho pediu para reduzir movimento. */
export function reduzirMovimento(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Vibração curta onde existir (Android). Silenciosa no resto (iPhone, computador). */
export function vibrar(ms: number | number[] = 15): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // sem vibração: segue sem nada
  }
}

// ---------- contagem animada ----------

/** Curva de desaceleração (mesma ideia do token --curva-saida). */
export function desacelerar(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

/**
 * Valor mostrado no instante `t` (0 a 1) de uma contagem de `de` até `para`.
 * No fim devolve exatamente `para` (nunca um número arredondado errado).
 */
export function valorNaContagem(de: number, para: number, t: number): number {
  if (!(t < 1)) return para
  if (t <= 0) return de
  return de + (para - de) * desacelerar(t)
}

export const DURACAO_CONTAGEM_MS = 600

/**
 * Número que rola do valor antigo ao novo quando muda. Na primeira vez aparece direto
 * (abrir uma tela não fica "contando"). Com "reduzir movimento", troca na hora.
 */
export function useNumeroAnimado(valor: number, duracao = DURACAO_CONTAGEM_MS): number {
  const [mostrado, setMostrado] = useState(valor)
  const atual = useRef(valor)
  useEffect(() => {
    const de = atual.current
    if (de === valor) return
    if (reduzirMovimento() || typeof requestAnimationFrame !== 'function') {
      atual.current = valor
      setMostrado(valor)
      return
    }
    const t0 = performance.now()
    let quadro = 0
    const passo = (agora: number) => {
      const v = valorNaContagem(de, valor, (agora - t0) / duracao)
      atual.current = v
      setMostrado(v)
      if (v !== valor) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(quadro)
      // se a tela sair no meio, o próximo valor parte de onde parou
    }
  }, [valor, duracao])
  return mostrado
}

// ---------- otimismo ----------

/**
 * Roda `antes` na hora (animação, vibração, aviso), grava e, se a gravação falhar,
 * chama `falhou` para desfazer o que foi mostrado. Devolve o resultado ou `undefined`.
 */
export async function comOtimismo<T>(
  gravar: () => Promise<T>,
  { antes, depois, falhou }: { antes: () => void; depois?: (v: T) => void; falhou: (e: unknown) => void },
): Promise<T | undefined> {
  antes()
  let v: T
  try {
    v = await gravar()
  } catch (e) {
    falhou(e)
    return undefined
  }
  depois?.(v)
  return v
}

// ---------- itens que acabaram de mudar (destaque que esmaece) ----------

export const DESTAQUE_MS = 1000

type Ouvinte = () => void
const recentes = new Map<string, number>()
const ouvintes = new Set<Ouvinte>()
let versao = 0

function avisar() {
  versao++
  ouvintes.forEach((f) => f())
}

/** Marca um registro (id) como recém-criado: as listas mostram o destaque por ~1,4 s. */
export function marcarRecente(id: string, agora = Date.now()): void {
  recentes.set(id, agora + DESTAQUE_MS)
  avisar()
  if (typeof setTimeout === 'function') setTimeout(() => limparRecentes(), DESTAQUE_MS + 50)
}

export function ehRecente(id: string | undefined, agora = Date.now()): boolean {
  if (!id) return false
  const ate = recentes.get(id)
  return ate !== undefined && ate > agora
}

export function limparRecentes(agora = Date.now()): void {
  let mudou = false
  for (const [id, ate] of recentes) if (ate <= agora) (recentes.delete(id), (mudou = true))
  if (mudou) avisar()
}

/** O registro acabou de ser criado (para tocar o destaque uma vez). */
export function useRecente(id: string | undefined): boolean {
  useSyncExternalStore(
    (f) => (ouvintes.add(f), () => void ouvintes.delete(f)),
    () => versao,
    () => versao,
  )
  return ehRecente(id)
}

/**
 * `true` depois que `valor` mudou com a tela já aberta e os dados carregados (`pronto`).
 * Serve para animar troca de estado (registrar, desfazer) e não a primeira pintura.
 */
export function useMudou<T>(valor: T, pronto = true): boolean {
  const primeiro = useRef<{ v: T } | null>(null)
  const mudou = useRef(false)
  if (!pronto) return false
  if (primeiro.current === null) primeiro.current = { v: valor }
  else if (!mudou.current && !Object.is(primeiro.current.v, valor)) mudou.current = true
  return mudou.current
}

// ---------- lista com saída ----------

/**
 * Junta a lista nova com os itens que acabaram de sair (marcados `saindo`), cada um na posição
 * em que estava (logo depois do vizinho de cima que continua). Sem animação, só a lista nova.
 */
export function mesclarSaida<T>(anteriores: { item: T; saindo: boolean }[], itens: T[], chave: (x: T) => string, semAnimacao = false): { item: T; saindo: boolean }[] {
  const lista = itens.map((item) => ({ item, saindo: false }))
  if (semAnimacao) return lista
  const atuais = new Set(itens.map(chave))
  anteriores.forEach((x, i) => {
    const k = chave(x.item)
    if (atuais.has(k)) return
    let pos = 0
    for (let j = i - 1; j >= 0; j--) {
      const viz = chave(anteriores[j].item)
      const idx = lista.findIndex((y) => chave(y.item) === viz)
      if (idx >= 0) {
        pos = idx + 1
        break
      }
    }
    lista.splice(pos, 0, { item: x.item, saindo: true })
  })
  return lista
}

// ---------- relógio do aviso (pausa enquanto o dedo está em cima) ----------

export interface Relogio {
  pausar(): void
  retomar(): void
  parar(): void
  restante(): number
  pausado(): boolean
}

/** Conta `duracao` ms e chama `acabou`. Pausável. `agora` e os timers podem ser trocados nos testes. */
export function criarRelogio(duracao: number, acabou: () => void, agora: () => number = () => Date.now()): Relogio {
  let resta = duracao
  let inicio = agora()
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(acabou, resta)
  let parado = false
  return {
    pausar() {
      if (timer === undefined || parado) return
      clearTimeout(timer)
      timer = undefined
      resta = Math.max(0, resta - (agora() - inicio))
    },
    retomar() {
      if (timer !== undefined || parado) return
      inicio = agora()
      timer = setTimeout(acabou, resta)
    },
    parar() {
      parado = true
      clearTimeout(timer)
      timer = undefined
    },
    restante() {
      return timer === undefined ? resta : Math.max(0, resta - (agora() - inicio))
    },
    pausado() {
      return timer === undefined && !parado
    },
  }
}

/** Arrastar o aviso para o lado: passou do limite, dispensa; senão volta ao lugar. */
export const LIMITE_ARRASTE_PX = 72
export function decidirArraste(dx: number, largura: number): 'dispensar' | 'voltar' {
  return Math.abs(dx) >= Math.min(LIMITE_ARRASTE_PX, largura * 0.3) ? 'dispensar' : 'voltar'
}
