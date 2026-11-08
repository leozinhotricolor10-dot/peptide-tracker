// Reduz a foto no aparelho (lado maior até 1280 px, JPEG) antes de guardar.
export const LADO_MAXIMO = 1280
/** Fotos maiores que isso nem são abertas (evita travar o celular por falta de memória). */
export const TAMANHO_MAX_FOTO = 40 * 1024 * 1024

/** Lado a lado com a escala para caber em LADO_MAXIMO (nunca aumenta). */
export function medidasReduzidas(largura: number, altura: number, lado = LADO_MAXIMO): { w: number; h: number } {
  const escala = Math.min(1, lado / Math.max(largura, altura, 1))
  return { w: Math.max(1, Math.round(largura * escala)), h: Math.max(1, Math.round(altura * escala)) }
}

type Fonte = { img: CanvasImageSource; largura: number; altura: number; liberar: () => void }

/** Abre a imagem respeitando a rotação da câmera (EXIF). Tenta createImageBitmap e cai para <img>. */
async function abrir(arquivo: Blob): Promise<Fonte> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
      return { img: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() }
    } catch {
      /* alguns navegadores (iPhone antigo, HEIC) só abrem por <img> */
    }
  }
  const url = URL.createObjectURL(arquivo)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export async function comprimirImagem(arquivo: Blob, qualidade = 0.82): Promise<Blob> {
  if (arquivo.size > TAMANHO_MAX_FOTO) throw new Error('Foto grande demais')
  const fonte = await abrir(arquivo)
  try {
    const { w, h } = medidasReduzidas(fonte.largura, fonte.altura)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Sem canvas')
    ctx.drawImage(fonte.img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade))
    canvas.width = canvas.height = 0 // devolve a memória do canvas logo (iPhone tem limite baixo)
    if (!blob) throw new Error('Não deu para comprimir a foto')
    return blob
  } finally {
    fonte.liberar()
  }
}

/** Baixa um arquivo gerado no aparelho (backup, agenda). */
export function baixarArquivo(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
