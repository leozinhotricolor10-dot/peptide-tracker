import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// PWA com service worker próprio (src/sw.ts): cache offline + avisos de dose locais.
// Nenhuma chamada de rede externa: fontes e ícones vão junto no build.
//
// O site fica numa subpasta do GitHub Pages: https://<usuario>.github.io/peptide-tracker/
// BASE_PATH muda a pasta (ex.: BASE_PATH=/ para um domínio próprio). Sempre com / no início e no fim.
const pasta = process.env.BASE_PATH ?? '/peptide-tracker/'
const base = `/${pasta.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')

/**
 * 404.html do GitHub Pages: o app usa endereços com # (/peptide-tracker/#/hoje), que nunca dão 404.
 * Se alguém abrir um endereço antigo sem # (ex.: /peptide-tracker/hoje), esta página leva para /#/hoje.
 */
function pagina404(): Plugin {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peptide Tracker</title><style>html,body{background:#050A0E;color:#E2EAF0;font-family:system-ui,sans-serif;margin:0}</style>
<script>
(function () {
  var base = ${JSON.stringify(base)};
  var p = location.pathname;
  if (p.indexOf(base) === 0) {
    var rota = p.slice(base.length).replace(/^\\/+/, '').replace(/\\/+$/, '');
    location.replace(base + (rota ? '#/' + rota + location.search : ''));
  }
})();
</script></head>
<body><p style="padding:24px">Página não encontrada. <a style="color:#00E5C3" href="${base}">Abrir o app</a></p></body></html>
`
  return {
    name: 'pagina-404',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '404.html', source: html })
    },
  }
}

export default defineConfig({
  base,
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'libs', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    pagina404(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['404.html'],
        rollupFormat: 'iife',
      },
      manifest: {
        id: base,
        name: 'Peptide Tracker',
        short_name: 'Peptide Tracker',
        description: 'Diário pessoal de protocolos, doses, peso e estoque. Dados só no aparelho.',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#050A0E',
        theme_color: '#050A0E',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
