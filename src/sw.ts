/// <reference lib="webworker" />
// Service worker: guarda o app inteiro para funcionar offline e abre o app ao tocar num aviso.
// Não há push de servidor no MVP (ver src/sistema/avisos.ts).
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Abrir o app (a pasta dele, com qualquer #/rota) usa o index.html do cache, inclusive offline.
// Só navegações dentro do escopo do app (ex.: /peptide-tracker/), nunca outras páginas do mesmo site.
const escopo = new URL(self.registration.scope).pathname
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { allowlist: [new RegExp(`^${escopo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)] }))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? `${self.registration.scope}#/hoje`
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const j of janelas) {
        // no github.io o mesmo endereço tem sites de outros projetos: só reaproveita janelas deste app
        if (!j.url.startsWith(self.registration.scope)) continue
        if ('focus' in j) {
          await j.focus()
          if ('navigate' in j) await (j as WindowClient).navigate(url).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
