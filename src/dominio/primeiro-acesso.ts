// Primeiro acesso curto: o que fica para depois e quando aparece.
// - Pedido de avisos: logo depois de salvar o primeiro protocolo, uma vez só.
// - Convite para instalar: depois do primeiro registro de dose, até a pessoa responder.
// Quem passou pelo primeiro acesso antigo (ou restaurou um backup) tem `onboarding: true` gravado:
// já respondeu instalar e lembretes lá, então não vê nenhum dos dois de novo (continua em Ajustes).

/** 'pendente': mostrar o pedido; 'respondido': Sim ou Agora não (não repete). */
export type EstadoPedido = 'pendente' | 'respondido'

/** Valor a gravar ao salvar um protocolo novo, ou null se nada muda. */
export function pedidoAvisosAoSalvar(atual: EstadoPedido | undefined, fluxoAntigo: boolean): EstadoPedido | null {
  if (atual) return null
  return fluxoAntigo ? 'respondido' : 'pendente'
}

export function mostrarConviteInstalar(s: { registros: number; instalado: boolean; convite: EstadoPedido | undefined; fluxoAntigo: boolean }): boolean {
  return s.registros >= 1 && !s.instalado && s.convite !== 'respondido' && !s.fluxoAntigo
}
