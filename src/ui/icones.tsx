// Ícones em SVG inline (traço), sem biblioteca.
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { tam?: number }

function Ico({ tam = 24, children, ...p }: P & { children: ReactNode }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  )
}

export const IcoVoltar = (p: P) => <Ico {...p}><path d="M15 6l-6 6 6 6" /></Ico>
export const IcoFechar = (p: P) => <Ico {...p}><path d="M6 6l12 12M18 6L6 18" /></Ico>
export const IcoMais = (p: P) => <Ico {...p}><path d="M12 5v14M5 12h14" /></Ico>
export const IcoSeta = (p: P) => <Ico {...p}><path d="M9 6l6 6-6 6" /></Ico>
export const IcoBaixo = (p: P) => <Ico {...p}><path d="M6 9l6 6 6-6" /></Ico>
export const IcoCheck = (p: P) => <Ico strokeWidth={2.6} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>
export const IcoX = (p: P) => <Ico strokeWidth={2.6} {...p}><path d="M6 6l12 12M18 6L6 18" /></Ico>
export const IcoAlerta = (p: P) => <Ico {...p}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18.2v.1" /></Ico>
export const IcoInfo = (p: P) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.1" /></Ico>
export const IcoPausa = (p: P) => <Ico {...p}><path d="M9 5v14M15 5v14" /></Ico>
export const IcoPlay = (p: P) => <Ico {...p}><path d="M7 4l12 8-12 8V4z" /></Ico>
export const IcoEditar = (p: P) => <Ico {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /></Ico>
export const IcoCopiar = (p: P) => <Ico {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></Ico>
export const IcoParar = (p: P) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9h6v6H9z" /></Ico>
export const IcoLixo = (p: P) => <Ico {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ico>
export const IcoArquivo = (p: P) => <Ico {...p}><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></Ico>
export const IcoPontos = (p: P) => (
  <svg width={p.tam ?? 20} height={p.tam ?? 20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
)
export const IcoEngrenagem = (p: P) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </Ico>
)
export const IcoHoje = (p: P) => <Ico {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M9 15.5l2 2 4-4" /></Ico>
export const IcoProtocolos = (p: P) => <Ico {...p}><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 9h6M9 13h6M9 17h3" /></Ico>
export const IcoPeso = (p: P) => <Ico {...p}><path d="M3 17l6-6 4 3 8-8" /><path d="M15 6h6v6" /></Ico>
export const IcoEstoque = (p: P) => <Ico {...p}><path d="M9 3h6M10 3v4l-2 3v9a2 2 0 002 2h4a2 2 0 002-2v-9l-2-3V3M8 14h8" /></Ico>
export const IcoSino = (p: P) => <Ico {...p}><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></Ico>
export const IcoCalendario = (p: P) => <Ico {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></Ico>
export const IcoCamera = (p: P) => <Ico {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Ico>
export const IcoImagem = (p: P) => <Ico {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></Ico>
export const IcoDownload = (p: P) => <Ico {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Ico>
export const IcoUpload = (p: P) => <Ico {...p}><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></Ico>
export const IcoCelular = (p: P) => <Ico {...p}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></Ico>
export const IcoNuvemOff = (p: P) => <Ico {...p}><path d="M3 3l18 18M8 8a5 5 0 00-1 9.9h10M19.7 15.5A4 4 0 0017 9h-1A6 6 0 0010 5.3" /></Ico>
export const IcoEscudo = (p: P) => <Ico {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></Ico>
export const IcoCompartilhar = (p: P) => <Ico {...p}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8" /></Ico>
export const IcoBusca = (p: P) => <Ico {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Ico>
