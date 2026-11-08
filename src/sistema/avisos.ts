// Avisos de dose SEM servidor (decisão do dono para o MVP).
//
// O que funciona:
// - Com o app aberto (ou em segundo plano recente, enquanto o navegador não o congela): um verificador
//   roda a cada 20 s e mostra a notificação do sistema na hora da dose, além do aviso dentro do app.
// - Onde existir a API Notification Triggers (experimental, quase nenhum navegador), as próximas 24 h
//   são agendadas no próprio aparelho e podem chegar com o app fechado.
// - Agenda do celular (.ics): avisa mesmo com o app fechado e sem internet (plano B confiável).
//
// O que NÃO funciona: aviso garantido com o app fechado. Na web isso exige Web Push, que precisa de um
// servidor para disparar na hora. Fica para uma versão futura.
import { proximosSlots, slotsDoDia, type Slot } from '../dominio/agenda.ts'
import { diaDe, instante, somaDias } from '../dominio/datas.ts'
import { repo } from '../dados/index.ts'
import { ehIOS, rodandoInstalado } from './instalar.ts'

export const TEXTO_AVISO = 'Hora do seu registro'
export const EVENTO_HORA_DOSE = 'pt:hora-dose'

export type SuporteAviso = 'ok' | 'sem-suporte' | 'ios-sem-instalar'

export function suporteAviso(): SuporteAviso {
  if (ehIOS() && !rodandoInstalado()) return 'ios-sem-instalar'
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'sem-suporte'
  return 'ok'
}

export function permissaoAtual(): NotificationPermission | 'indisponivel' {
  return 'Notification' in window ? Notification.permission : 'indisponivel'
}

export async function pedirPermissao(): Promise<NotificationPermission | 'indisponivel'> {
  if (!('Notification' in window)) return 'indisponivel'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function temGatilhos(): boolean {
  return typeof window !== 'undefined' && 'TimestampTrigger' in window && 'showTrigger' in Notification.prototype
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

interface OpcoesAviso extends NotificationOptions {
  showTrigger?: unknown
}

async function mostrar(tag: string, extra: Partial<OpcoesAviso> = {}): Promise<boolean> {
  if (permissaoAtual() !== 'granted') return false
  // Caminhos relativos à pasta do app (no GitHub Pages ele vive em /peptide-tracker/).
  const base = import.meta.env.BASE_URL
  const opcoes: OpcoesAviso = { body: 'Toque para abrir o app', tag, icon: `${base}pwa-192.png`, badge: `${base}pwa-192.png`, data: { url: `${base}#/hoje` }, ...extra }
  const reg = await registro()
  try {
    if (reg) await reg.showNotification(TEXTO_AVISO, opcoes)
    else new Notification(TEXTO_AVISO, opcoes)
    return true
  } catch {
    return false
  }
}

/** Aviso de teste (T62). Texto genérico: nunca o nome da substância nem a dose. */
export function avisoDeTeste(): Promise<boolean> {
  return mostrar('teste')
}

async function canalNotificacaoLigado(): Promise<boolean> {
  const canais = await repo.getConfig('canais')
  return !!canais?.notificacao && permissaoAtual() === 'granted'
}

async function slotsComLembrete(dia: string): Promise<Slot[]> {
  const [protocolos, itens] = await Promise.all([repo.listarProtocolos(), repo.listarItens()])
  const comAviso = protocolos.filter((p) => p.lembretes)
  return slotsDoDia(comAviso, itens, dia)
}

/** Verifica se chegou a hora de alguma dose (janela de 10 min) e avisa uma vez por horário. */
export async function verificarAgora(agora = new Date()): Promise<void> {
  const hoje = diaDe(agora)
  const slots = [...(await slotsComLembrete(somaDias(hoje, -1))), ...(await slotsComLembrete(hoje))]
  const aplicacoes = await repo.listarAplicacoes()
  const ja = new Set((await repo.getConfig('notificados')) ?? [])
  const novos: Slot[] = []
  for (const s of slots) {
    const t = instante(s.dia, s.horario).getTime()
    const dif = agora.getTime() - t
    if (dif < 0 || dif > 10 * 60000) continue
    if (ja.has(s.chave + '|' + s.itemId)) continue
    if (aplicacoes.some((a) => a.itemId === s.itemId && a.previsto === s.chave)) continue
    novos.push(s)
  }
  if (!novos.length) return
  const notif = await canalNotificacaoLigado()
  for (const s of novos) {
    ja.add(s.chave + '|' + s.itemId)
    window.dispatchEvent(new CustomEvent<Slot>(EVENTO_HORA_DOSE, { detail: s }))
    if (notif) await mostrar(`dose-${s.chave}`)
  }
  // guarda só os últimos 2 dias
  const limite = somaDias(hoje, -2)
  await repo.setConfig('notificados', [...ja].filter((k) => k.slice(0, 10) >= limite))
}

/** Onde o navegador suporta Notification Triggers, agenda as próximas 24 h no aparelho. */
export async function agendarComGatilhos(agora = new Date()): Promise<number> {
  if (!temGatilhos() || !(await canalNotificacaoLigado())) return 0
  const reg = await registro()
  if (!reg) return 0
  const [protocolos, itens] = await Promise.all([repo.listarProtocolos(), repo.listarItens()])
  const slots = proximosSlots(protocolos.filter((p) => p.lembretes), itens, agora, 50, 2).filter(
    (s) => instante(s.dia, s.horario).getTime() - agora.getTime() < 24 * 3600000,
  )
  const Gatilho = (window as unknown as { TimestampTrigger: new (t: number) => unknown }).TimestampTrigger
  let n = 0
  for (const s of slots) {
    const ok = await mostrar(`dose-${s.chave}`, { showTrigger: new Gatilho(instante(s.dia, s.horario).getTime()) })
    if (ok) n++
  }
  return n
}

let iniciado = false
/** Liga o verificador enquanto o app estiver aberto. */
export function iniciarAgendador(): void {
  if (iniciado) return
  iniciado = true
  const rodar = () => {
    void verificarAgora().catch(() => {})
  }
  rodar()
  void agendarComGatilhos().catch(() => {})
  window.setInterval(rodar, 20000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      rodar()
      void agendarComGatilhos().catch(() => {})
    }
  })
}
