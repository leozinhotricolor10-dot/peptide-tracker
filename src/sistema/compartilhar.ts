// Enviar o arquivo de backup pelo compartilhamento do sistema (Web Share API com arquivo): a pessoa
// escolhe WhatsApp, e-mail, Drive etc. Sem suporte, o arquivo é baixado como antes.
//
// O Chrome do Android só compartilha alguns tipos de arquivo (texto, imagem, PDF...) e .json não
// está na lista. Por isso, se o .json não passa, o app tenta o mesmo conteúdo como .txt
// (o app importa os dois). O conteúdo é exatamente o mesmo arquivo de backup.
import { baixarArquivo } from './imagem.ts'

export interface NavegadorShare {
  canShare?: (dados?: ShareData) => boolean
  share?: (dados?: ShareData) => Promise<void>
}

export type ResultadoEnvio =
  /** a pessoa escolheu um destino (o sistema não diz se chegou) */
  | { tipo: 'compartilhado'; arquivo: File }
  /** sem compartilhamento com arquivo: foi baixado */
  | { tipo: 'baixado'; nome: string }
  /** a pessoa fechou a janela de compartilhar: não é erro */
  | { tipo: 'cancelado' }
  /** o navegador pediu um toque novo (montar o arquivo demorou): o arquivo já está pronto */
  | { tipo: 'precisa-toque'; arquivo: File }
  | { tipo: 'erro'; mensagem: string; arquivo: File }

export const TITULO_COMPARTILHAR = 'Backup do Peptide Tracker'

/** Versões do arquivo que podem ir pelo compartilhamento, na ordem de preferência. */
export function versoesDoArquivo(conteudo: Blob, nomeJson: string): File[] {
  const base = nomeJson.replace(/\.json$/i, '')
  return [new File([conteudo], `${base}.json`, { type: 'application/json' }), new File([conteudo], `${base}.txt`, { type: 'text/plain' })]
}

/** Primeira versão que o navegador aceita compartilhar; null se nenhuma (ou sem a API). */
export function arquivoCompartilhavel(nav: NavegadorShare | undefined, versoes: File[]): File | null {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return null
  for (const f of versoes) {
    try {
      if (nav.canShare({ files: [f] })) return f
    } catch {
      // canShare pode lançar em navegadores antigos: tenta a próxima
    }
  }
  return null
}

/** Abre o compartilhamento com um arquivo já pronto. */
export async function compartilharArquivo(nav: NavegadorShare, arquivo: File): Promise<ResultadoEnvio> {
  try {
    await nav.share!({ files: [arquivo], title: TITULO_COMPARTILHAR })
    return { tipo: 'compartilhado', arquivo }
  } catch (e) {
    const nome = (e as { name?: string } | null)?.name
    if (nome === 'AbortError') return { tipo: 'cancelado' }
    if (nome === 'NotAllowedError') return { tipo: 'precisa-toque', arquivo }
    return { tipo: 'erro', mensagem: 'O celular não conseguiu abrir o envio do arquivo.', arquivo }
  }
}

/** Compartilha se der; senão baixa o .json. */
export async function enviarArquivo(
  conteudo: Blob,
  nomeJson: string,
  deps: { nav?: NavegadorShare; baixar?: (b: Blob, nome: string) => void } = {},
): Promise<ResultadoEnvio> {
  const nav = 'nav' in deps ? deps.nav : typeof navigator !== 'undefined' ? (navigator as NavegadorShare) : undefined
  const baixar = deps.baixar ?? baixarArquivo
  const arquivo = arquivoCompartilhavel(nav, versoesDoArquivo(conteudo, nomeJson))
  if (!arquivo || !nav) {
    baixar(conteudo, nomeJson)
    return { tipo: 'baixado', nome: nomeJson }
  }
  return compartilharArquivo(nav, arquivo)
}
