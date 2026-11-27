// Aplica o tema na página: atributo data-tema no <html>, barra do sistema (theme-color) e esquema
// nativo (color-scheme). A preferência de verdade fica no banco (config "tema", vai no backup);
// o localStorage guarda uma cópia só para o script do index.html pintar o tema certo já no
// primeiro quadro, antes do app carregar.
import { CHAVE_ESPELHO, META_TEMA, preferenciaValida, TEMA_PADRAO, temaEfetivo, type PreferenciaTema, type Tema } from '../dominio/temas.ts'

const CONSULTA_CLARO = '(prefers-color-scheme: light)'

function aparelhoClaro(): boolean {
  try {
    return window.matchMedia(CONSULTA_CLARO).matches
  } catch {
    return false
  }
}

/** Preferência guardada na cópia local (ou o padrão, se não houver ou estiver estragada). */
export function lerEspelho(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE_ESPELHO)
    return preferenciaValida(v) ? v : TEMA_PADRAO
  } catch {
    return TEMA_PADRAO
  }
}

function gravarEspelho(pref: PreferenciaTema) {
  try {
    localStorage.setItem(CHAVE_ESPELHO, pref)
  } catch {
    /* navegador sem armazenamento local: o tema ainda vale nesta visita */
  }
}

function pintar(tema: Tema, suave: boolean) {
  const html = document.documentElement
  if (html.dataset.tema === tema) return
  const reduzir = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return true
    }
  })()
  if (suave && !reduzir) {
    html.classList.add('trocando-tema')
    window.setTimeout(() => html.classList.remove('trocando-tema'), 260)
  }
  html.dataset.tema = tema
  const meta = META_TEMA[tema]
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta.themeColor)
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', meta.esquema)
}

let atual: PreferenciaTema = TEMA_PADRAO
let ouvindo: MediaQueryList | null = null
const aoMudarAparelho = () => {
  if (atual === 'auto') pintar(temaEfetivo('auto', aparelhoClaro()), true)
}

/**
 * Aplica a preferência (vinda do banco ou da escolha em Ajustes). `suave`: as cores passam com uma
 * transição curta (só na troca feita pela pessoa). No Automático, acompanha o aparelho ao vivo.
 */
export function aplicarTema(pref: unknown, suave = false): Tema {
  const p: PreferenciaTema = preferenciaValida(pref) ? pref : TEMA_PADRAO
  atual = p
  gravarEspelho(p)
  if (p === 'auto' && !ouvindo) {
    try {
      ouvindo = window.matchMedia(CONSULTA_CLARO)
      ouvindo.addEventListener('change', aoMudarAparelho)
    } catch {
      ouvindo = null
    }
  } else if (p !== 'auto' && ouvindo) {
    ouvindo.removeEventListener('change', aoMudarAparelho)
    ouvindo = null
  }
  const tema = temaEfetivo(p, aparelhoClaro())
  pintar(tema, suave)
  return tema
}

/** Tema que está na tela agora. */
export function temaNaTela(): Tema {
  const t = document.documentElement.dataset.tema
  return t === 'indigo' || t === 'claro' ? t : 'preto'
}
