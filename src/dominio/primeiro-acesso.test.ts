import { describe, expect, it } from 'vitest'
import { mostrarConviteInstalar, pedidoAvisosAoSalvar } from './primeiro-acesso.ts'

describe('pedido de avisos depois do primeiro protocolo', () => {
  it('primeiro protocolo salvo: fica pendente (o pedido aparece)', () => {
    expect(pedidoAvisosAoSalvar(undefined, false)).toBe('pendente')
  })
  it('já pendente ou respondido (Sim / Agora não): nada muda, não repete', () => {
    expect(pedidoAvisosAoSalvar('pendente', false)).toBeNull()
    expect(pedidoAvisosAoSalvar('respondido', false)).toBeNull()
  })
  it('usuário do primeiro acesso antigo (ou backup restaurado): não pergunta de novo', () => {
    expect(pedidoAvisosAoSalvar(undefined, true)).toBe('respondido')
  })
})

describe('convite para instalar', () => {
  const base = { registros: 1, instalado: false, convite: undefined, fluxoAntigo: false }
  it('aparece depois do primeiro registro de dose', () => {
    expect(mostrarConviteInstalar({ ...base, registros: 0 })).toBe(false)
    expect(mostrarConviteInstalar(base)).toBe(true)
  })
  it('não aparece já instalado, depois de responder ou para usuário antigo', () => {
    expect(mostrarConviteInstalar({ ...base, instalado: true })).toBe(false)
    expect(mostrarConviteInstalar({ ...base, convite: 'respondido' })).toBe(false)
    expect(mostrarConviteInstalar({ ...base, fluxoAntigo: true })).toBe(false)
  })
})
