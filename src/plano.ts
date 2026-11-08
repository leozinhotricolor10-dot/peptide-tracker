// Ponto único para ligar ou desligar recursos no futuro. Hoje tudo é liberado.
// As telas já perguntam por recurso; se isso mudar um dia, só esta função muda.
export type Recurso =
  | 'protocolos-ilimitados'
  | 'blend'
  | 'ciclo'
  | 'reconstituicao'
  | 'corpo'
  | 'notificacao'

export function temAcesso(recurso: Recurso): boolean {
  void recurso
  return true
}
