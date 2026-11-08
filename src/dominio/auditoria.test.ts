// Testes dos bugs achados na auditoria (ver AUDITORIA.md). Cada bloco cita o achado.
import { afterEach, describe, expect, it } from 'vitest'
import type { Aplicacao, ItemProtocolo, Protocolo } from './tipos.ts'
import { estadoEfetivo, fecharPausa, itemNoDia, progresso, proximosSlots, resumoDoDia, slotsDoDia, terminouEm } from './agenda.ts'
import { diaDe, difDias, instante, parseDia, somaDias } from './datas.ts'
import { erroNumero, lerNumero, numeroAmbiguo } from './calculos.ts'
import { medidasReduzidas } from '../sistema/imagem.ts'
import { nomeComMg } from './nomes.ts'

function prot(p: Partial<Protocolo> = {}): Protocolo {
  return { id: 'p1', inicio: '2026-11-01', estado: 'ativo', lembretes: true, criadoEm: '', ...p }
}
function item(i: Partial<ItemProtocolo> = {}): ItemProtocolo {
  return { id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 1, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['08:00'], ordem: 0, ...i }
}
function feita(previsto: string, itemId = 'i1'): Aplicacao {
  return { id: previsto + itemId, protocoloId: 'p1', itemId, substanciaId: 's1', previsto, dataHora: '2026-11-01T08:00:00Z', doseValor: 1, doseUnidade: 'mg', status: 'feita' }
}

describe('A01 pausa retomada não vira dose perdida', () => {
  it('dias da pausa guardada em `pausas` não geram dose', () => {
    const pausado = prot({ estado: 'pausado', pausadoDesde: '2026-11-05' })
    const retomado = prot({ estado: 'ativo', pausas: fecharPausa(pausado, '2026-11-09') })
    expect(retomado.pausas).toEqual([{ de: '2026-11-05', ate: '2026-11-09' }])
    expect(itemNoDia(retomado, item(), '2026-11-04')).toBe(true)
    expect(itemNoDia(retomado, item(), '2026-11-05')).toBe(false)
    expect(itemNoDia(retomado, item(), '2026-11-08')).toBe(false)
    expect(itemNoDia(retomado, item(), '2026-11-09')).toBe(true)
  })
  it('pausa e retomada no mesmo dia não cria intervalo', () => {
    expect(fecharPausa(prot({ pausadoDesde: '2026-11-05' }), '2026-11-05')).toEqual([])
  })
})

describe('A02 histórico não perde doses feitas quando o horário é editado', () => {
  it('registro do horário antigo conta como feito no dia', () => {
    const antes = [feita('2026-11-02 08:00')]
    const editado = item({ horarios: ['09:00'] })
    expect(resumoDoDia([prot()], [editado], antes, '2026-11-02')).toEqual({ previstas: 1, feitas: 1 })
  })
  it('nunca conta mais feitas que previstas e ignora puladas', () => {
    const aps = [feita('2026-11-02 08:00'), feita('2026-11-02 07:00'), { ...feita('2026-11-02 20:00'), status: 'pulada' as const }]
    expect(resumoDoDia([prot()], [item()], aps, '2026-11-02')).toEqual({ previstas: 1, feitas: 1 })
    expect(resumoDoDia([prot()], [item({ horarios: ['08:00', '20:00'] })], aps.slice(2), '2026-11-02')).toEqual({ previstas: 2, feitas: 0 })
  })
})

describe('A03 protocolo com data de fim vencida aparece como concluído', () => {
  it('estado efetivo e data de término', () => {
    const p = prot({ fim: '2026-11-10' })
    expect(estadoEfetivo(p, '2026-11-10')).toBe('ativo')
    expect(estadoEfetivo(p, '2026-11-11')).toBe('encerrado')
    expect(terminouEm(p, '2026-11-11')).toBe('2026-11-10')
    expect(estadoEfetivo(prot({ fim: '2026-11-10', estado: 'pausado' }), '2026-11-20')).toBe('encerrado')
    expect(estadoEfetivo(prot({ estado: 'encerrado', encerradoEm: '2026-11-03' }), '2026-11-04')).toBe('encerrado')
  })
})

describe('A04 número "1.000" não vira 1 em silêncio', () => {
  it('ambíguo é recusado com mensagem clara', () => {
    expect(numeroAmbiguo('1.000')).toBe(true)
    expect(numeroAmbiguo('2.500')).toBe(true)
    expect(lerNumero('1.000')).toBeNull()
    expect(erroNumero('1.000', 'x')).toMatch(/vírgula/)
    expect(erroNumero('abc', 'x')).toBe('x')
  })
  it('formas claras continuam aceitas', () => {
    expect(lerNumero('0.250')).toBe(0.25)
    expect(lerNumero('1000')).toBe(1000)
    expect(lerNumero('1.000,5')).toBe(1000.5)
    expect(lerNumero('2.5')).toBe(2.5)
    expect(lerNumero('2,50')).toBe(2.5)
  })
  it('lixo e notação estranha são recusados', () => {
    for (const t of ['1e3', 'Infinity', '0x10', '1,2,3', '1.2.3', '--1', '.']) expect(lerNumero(t)).toBeNull()
  })
})

// process.env.TZ: o Node relê o fuso quando ele muda (os tipos do Node não entram no app)
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

describe('A05 datas robustas a horário de verão e fuso', () => {
  const tzOriginal = env.TZ
  afterEach(() => {
    env.TZ = tzOriginal
  })
  it('São Paulo 2018 (verão começava à meia-noite): dia não some nem repete', () => {
    env.TZ = 'America/Sao_Paulo'
    expect(new Date(2018, 10, 4).getHours()).toBe(1) // confirma que o fuso com verão está valendo
    expect(diaDe(parseDia('2018-11-04'))).toBe('2018-11-04')
    expect(somaDias('2018-11-03', 1)).toBe('2018-11-04')
    expect(somaDias('2018-11-04', 1)).toBe('2018-11-05')
    expect(difDias('2018-11-01', '2018-11-10')).toBe(9)
    expect(difDias('2019-02-10', '2019-02-20')).toBe(10)
    const p = prot({ inicio: '2018-11-01' })
    const dias = Array.from({ length: 10 }, (_, k) => somaDias('2018-11-01', k))
    expect(dias.filter((d) => slotsDoDia([p], [item({ horarios: ['00:00'] })], d).length === 1)).toHaveLength(10)
  })
  it('Nova York: horário que não existe (02:30) é mostrado e avisado, sem travar', () => {
    env.TZ = 'America/New_York'
    const t = instante('2026-03-08', '02:30')
    expect(Number.isNaN(t.getTime())).toBe(false)
    const p = prot({ inicio: '2026-03-07' })
    const prox = proximosSlots([p], [item({ horarios: ['02:30'] })], new Date(2026, 2, 7, 12), 3)
    expect(prox.map((s) => s.dia)).toEqual(['2026-03-08', '2026-03-09', '2026-03-10'])
  })
  it('ciclo e progresso contam dias de calendário mesmo cruzando o verão', () => {
    env.TZ = 'America/Sao_Paulo'
    const p = prot({ inicio: '2018-10-30', ciclo: { diasOn: 5, diasOff: 2 } })
    expect(progresso(p, '2018-11-05').pausaDeCiclo).toBe(true)
    expect(progresso(p, '2018-11-06').pausaDeCiclo).toBe(false)
  })
})

describe('A13 nome do frasco não repete a quantidade', () => {
  it('GLOW 70 mg não vira "GLOW 70 mg · 70 mg"', () => {
    expect(nomeComMg('GLOW 70 mg', 70)).toBe('GLOW 70 mg')
    expect(nomeComMg('Blend 70mg', 70)).toBe('Blend 70mg')
    expect(nomeComMg('BPC-157', 5)).toBe('BPC-157 · 5 mg')
    expect(nomeComMg('GLOW 70 mg', 50)).toBe('GLOW 70 mg · 50 mg')
    expect(nomeComMg('Blend 170 mg', 70)).toBe('Blend 170 mg · 70 mg')
    expect(nomeComMg('Tirzepatida 2,5 mg', 2.5)).toBe('Tirzepatida 2,5 mg')
  })
})

describe('A06 foto é reduzida sem aumentar e sem dividir por zero', () => {
  it('medidas', () => {
    expect(medidasReduzidas(4000, 3000)).toEqual({ w: 1280, h: 960 })
    expect(medidasReduzidas(800, 600)).toEqual({ w: 800, h: 600 })
    expect(medidasReduzidas(0, 0)).toEqual({ w: 1, h: 1 })
  })
})
