// Serve o dist/ como o GitHub Pages serve um site de projeto: tudo sob /peptide-tracker/,
// sem "fallback" de SPA (arquivo que não existe = 404 com o 404.html). Serve para testar
// links, F5, instalação e modo offline exatamente como vai ficar no ar.
//   node tools/servir-pages.mjs [porta] [pasta-base]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

async function arquivo(caminho) {
  const alvo = normalize(join(raiz, caminho))
  if (!alvo.startsWith(raiz)) return null
  try {
    const s = await stat(alvo)
    if (s.isDirectory()) return arquivo(join(caminho, 'index.html'))
    return { corpo: await readFile(alvo), tipo: tipos[extname(alvo)] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** Liga o servidor e devolve o endereço do app (ex.: http://localhost:4180/peptide-tracker/). */
export function servir(porta = 4180, base = '/peptide-tracker/') {
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const caminho = decodeURIComponent(url.pathname)
    if (caminho === base.slice(0, -1)) {
      res.writeHead(301, { Location: base })
      return res.end()
    }
    const achado = caminho.startsWith(base) ? await arquivo(caminho.slice(base.length)) : null
    if (achado) {
      res.writeHead(200, { 'Content-Type': achado.tipo, 'Cache-Control': 'max-age=600' })
      return res.end(achado.corpo)
    }
    const p404 = await arquivo('404.html')
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(p404?.corpo ?? 'Not found')
  })
  return new Promise((ok) => servidor.listen(porta, () => ok({ url: `http://localhost:${porta}${base}`, fechar: () => servidor.close() })))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await servir(Number(process.argv[2] ?? 4180), process.argv[3] ?? '/peptide-tracker/')
  console.log(`GitHub Pages simulado: ${url}`)
}
