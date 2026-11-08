import { describe, expect, it } from 'vitest'
import type { Aplicacao, ItemProtocolo, Protocolo } from './tipos.ts'
import {
  descreverFrequencia,
  estadoEfetivo,
  frequenciaCurta,
  itemNoDia,
  progresso,
  proximosSlots,
  slotsDoDia,
  statusSlot,
} from './agenda.ts'
import { difDias, somaDias } from './datas.ts'

function prot(p: Partial<Protocolo> = {}): Protocolo {
  return { id: 'p1', inicio: '2026-11-02', estado: 'ativo', lembretes: true, criadoEm: '', ...p }
}
function item(i: Partial<ItemProtocolo> = {}): ItemProtocolo {
  return { id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 250, doseUnidade: 'mcg', frequencia: { tipo: 'diaria' }, horarios: ['08:00', '20:00'], ordem: 0, ...i }
}

describe('datas', () => {
  it('soma e diferença de dias atravessando mês e horário de verão', () => {
    expect(somaDias('2026-10-30', 3)).toBe('2026-11-02')
    expect(difDias('2026-10-30', '2026-11-02')).toBe(3)
    expect(difDias('2026-02-27', '2026-03-02')).toBe(3)
  })
})

describe('frequência', () => {
  it('diária gera todos os dias a partir do início', () => {
    const p = prot()
    expect(itemNoDia(p, item(), '2026-11-01')).toBe(false)
    expect(itemNoDia(p, item(), '2026-11-02')).toBe(true)
    expect(itemNoDia(p, item(), '2026-11-30')).toBe(true)
  })

  it('a cada N dias conta a partir do início', () => {
    const i = item({ frequencia: { tipo: 'cadaN', n: 3 } })
    const dias = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08']
    expect(dias.map((d) => itemNoDia(prot(), i, d))).toEqual([true, false, false, true, true])
  })

  it('dias da semana (seg e qui)', () => {
    const i = item({ frequencia: { tipo: 'semana', dias: [1, 4] } })
    // 02/11/2026 é segunda
    expect(itemNoDia(prot(), i, '2026-11-02')).toBe(true)
    expect(itemNoDia(prot(), i, '2026-11-03')).toBe(false)
    expect(itemNoDia(prot(), i, '2026-11-05')).toBe(true)
  })

  it('respeita o fim', () => {
    const p = prot({ fim: '2026-11-05' })
    expect(itemNoDia(p, item(), '2026-11-05')).toBe(true)
    expect(itemNoDia(p, item(), '2026-11-06')).toBe(false)
  })
})

describe('ciclo on/off', () => {
  it('5 dias sim, 2 não', () => {
    const p = prot({ ciclo: { diasOn: 5, diasOff: 2 } })
    const r = Array.from({ length: 9 }, (_, k) => itemNoDia(p, item(), somaDias('2026-11-02', k)))
    expect(r).toEqual([true, true, true, true, true, false, false, true, true])
  })

  it('8 semanas sim, 4 não', () => {
    const p = prot({ ciclo: { diasOn: 56, diasOff: 28 } })
    expect(itemNoDia(p, item(), somaDias('2026-11-02', 55))).toBe(true)
    expect(itemNoDia(p, item(), somaDias('2026-11-02', 56))).toBe(false)
    expect(itemNoDia(p, item(), somaDias('2026-11-02', 83))).toBe(false)
    expect(itemNoDia(p, item(), somaDias('2026-11-02', 84))).toBe(true)
  })

  it('progresso mostra pausa de ciclo e dias até voltar', () => {
    const p = prot({ ciclo: { diasOn: 5, diasOff: 2 } })
    const pr = progresso(p, '2026-11-07')
    expect(pr.pausaDeCiclo).toBe(true)
    expect(pr.diasAteVoltar).toBe(2)
  })
})

describe('pausa e encerramento', () => {
  it('pausado sem data não gera doses a partir da pausa', () => {
    const p = prot({ estado: 'pausado', pausadoDesde: '2026-11-05' })
    expect(itemNoDia(p, item(), '2026-11-04')).toBe(true)
    expect(itemNoDia(p, item(), '2026-11-05')).toBe(false)
    expect(itemNoDia(p, item(), '2026-12-30')).toBe(false)
  })

  it('pausado com data volta no dia marcado', () => {
    const p = prot({ estado: 'pausado', pausadoDesde: '2026-11-05', pausadoAte: '2026-11-10' })
    expect(itemNoDia(p, item(), '2026-11-09')).toBe(false)
    expect(itemNoDia(p, item(), '2026-11-10')).toBe(true)
    expect(estadoEfetivo(p, '2026-11-09')).toBe('pausado')
    expect(estadoEfetivo(p, '2026-11-10')).toBe('ativo')
  })

  it('encerrado não gera doses a partir do encerramento', () => {
    const p = prot({ estado: 'encerrado', encerradoEm: '2026-11-06' })
    expect(itemNoDia(p, item(), '2026-11-05')).toBe(true)
    expect(itemNoDia(p, item(), '2026-11-06')).toBe(false)
  })
})

describe('slots e status', () => {
  it('slots do dia ordenados por horário, vários protocolos', () => {
    const p2 = prot({ id: 'p2' })
    const i2 = item({ id: 'i2', protocoloId: 'p2', horarios: ['13:00'] })
    const s = slotsDoDia([prot(), p2], [item(), i2], '2026-11-03')
    expect(s.map((x) => x.horario)).toEqual(['08:00', '13:00', '20:00'])
    expect(s[0].chave).toBe('2026-11-03 08:00')
  })

  it('próximos slots a partir de agora', () => {
    const agora = new Date(2026, 10, 3, 9, 0)
    const s = proximosSlots([prot()], [item()], agora, 3)
    expect(s.map((x) => x.chave)).toEqual(['2026-11-03 20:00', '2026-11-04 08:00', '2026-11-04 20:00'])
  })

  it('status: feita, pulada, atrasada (30 min de tolerância) e pendente', () => {
    const [s8, s20] = slotsDoDia([prot()], [item()], '2026-11-03')
    const ap: Aplicacao = { id: 'a', protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', previsto: s8.chave, dataHora: '', doseValor: 250, doseUnidade: 'mcg', status: 'feita' }
    expect(statusSlot(s8, [ap], new Date(2026, 10, 3, 9))).toBe('feita')
    expect(statusSlot(s8, [{ ...ap, status: 'pulada' }], new Date(2026, 10, 3, 9))).toBe('pulada')
    expect(statusSlot(s8, [], new Date(2026, 10, 3, 8, 29))).toBe('pendente')
    expect(statusSlot(s8, [], new Date(2026, 10, 3, 8, 31))).toBe('atrasada')
    expect(statusSlot(s20, [], new Date(2026, 10, 3, 9))).toBe('pendente')
  })
})

describe('textos', () => {
  it('descreve frequência', () => {
    expect(descreverFrequencia({ tipo: 'diaria' }, ['20:00', '08:00'])).toBe('todo dia às 08:00 e 20:00')
    expect(descreverFrequencia({ tipo: 'semana', dias: [4, 1] }, ['13:00'])).toBe('seg e qui às 13:00')
    expect(descreverFrequencia({ tipo: 'cadaN', n: 3 }, ['13:00'])).toBe('a cada 3 dias às 13:00')
    expect(frequenciaCurta({ tipo: 'semana', dias: [1, 4] }, ['13:00'])).toBe('2x por semana')
    expect(frequenciaCurta({ tipo: 'diaria' }, ['08:00', '20:00'])).toBe('2x ao dia')
  })

  it('progresso: dia X de Y e semana X de Y', () => {
    expect(progresso(prot({ fim: '2026-12-01' }), '2026-11-13').texto).toBe('Dia 12 de 30')
    expect(progresso(prot({ inicio: '2026-10-14', fim: '2026-12-08' }), '2026-11-03').texto).toBe('Semana 3 de 8')
    expect(progresso(prot({ inicio: '2026-10-01', fim: '2027-01-01' }), '2026-11-04').texto).toBe('Semana 5 de 14')
  })
})
