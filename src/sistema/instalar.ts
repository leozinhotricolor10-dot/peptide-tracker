// Instalar na tela inicial: Android/PC usam o evento beforeinstallprompt; iPhone só por instruções.
import { useSyncExternalStore } from 'react'

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let evento: EventoInstalar | null = null
let instaladoAgora = false
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    evento = e as EventoInstalar
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    evento = null
    instaladoAgora = true
    avisar()
  })
}

export function ehIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export function rodandoInstalado(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    instaladoAgora
  )
}

let snap = { pode: false, instalado: false }
function ler() {
  const novo = { pode: !!evento, instalado: rodandoInstalado() }
  if (novo.pode !== snap.pode || novo.instalado !== snap.instalado) snap = novo
  return snap
}

export function useInstalacao() {
  const s = useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    ler,
    ler,
  )
  return {
    podeInstalar: s.pode,
    instalado: s.instalado,
    ios: ehIOS(),
    async instalar(): Promise<'aceito' | 'recusado' | 'indisponivel'> {
      if (!evento) return 'indisponivel'
      const e = evento
      await e.prompt()
      const r = await e.userChoice
      evento = null
      avisar()
      return r.outcome === 'accepted' ? 'aceito' : 'recusado'
    },
  }
}
