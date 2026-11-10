// Painel da tela Hoje: semana, próximas doses, avisos, peso e estoque.
import { afterEach, describe, expect, it } from 'vitest'
import type { Aplicacao, Frasco, ItemProtocolo, Medicao, Protocolo } from './tipos.ts'
import {
  alertasPainel,
  diasDaSemana,
  dosesDoDia,
  indexarPorDia,
  inicioDaSemana,
  proximasDoses,
  resumoEstoquePainel,
  resumoPeso,
  resumoSemana,
  saudacao,
  sequenciaTudoFeito,
} from './painel.ts'

// 09/11/2026 é segunda-feira
const SEG = new Date(2026, 10, 9, 10, 0)
const prot = (p: Partial<Protocolo> = {}): Protocolo => ({ id: 'p1', inicio: '2026-11-01', estado: 'ativo', lembretes: true, criadoEm: '', ...p })
const item = (i: Partial<ItemProtocolo> = {}): ItemProtocolo => ({
  id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 2.5, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['08:00'], ordem: 0, ...i,
})
let seq = 0
const ap = (previsto: string, mais: Partial<Aplicacao> = {}): Aplicacao => ({
  id: `a${++seq}`, protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', previsto, dataHora: new Date(previsto.replace(' ', 'T') + ':00').toISOString(), doseValor: 2.5, doseUnidade: 'mg', status: 'feita', ...mais,
})
const fr = (id: string, mais: Partial<Frasco> = {}): Frasco => ({ id, substanciaId: 's1', mgTotal: 10, diluenteMl: 2, status: 'reconstituido', reconstituidoEm: '2026-11-01', criadoEm: '2026-11-01T10:00:00Z', ...mais })
const base = (m: { protocolos?: Protocolo[]; itens?: ItemProtocolo[]; aplicacoes?: Aplicacao[]; frascos?: Frasco[] }) => ({ protocolos: [], itens: [], aplicacoes: [], frascos: [], ...m })

describe('semana de segunda a domingo', () => {
  it('começa na segunda, inclusive quando hoje é domingo', () => {
    expect(inicioDaSemana('2026-11-09')).toBe('2026-11-09')
    expect(inicioDaSemana('2026-11-15')).toBe('2026-11-09')
    expect(inicioDaSemana('2026-11-12')).toBe('2026-11-09')
    expect(diasDaSemana('2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
  })

  it('virada de mês e de ano', () => {
    expect(diasDaSemana('2026-12-31')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(diasDaSemana('2026-12-01')[0]).toBe('2026-11-30')
  })
})

describe('resumo da semana', () => {
  it('semana vazia: sem protocolo, nada previsto, sem sequência', () => {
    const r = resumoSemana([], [], [], SEG)
    expect(r.dias).toHaveLength(7)
    expect(r.dias.every((d) => d.previstas === 0)).toBe(true)
    expect([r.previstas, r.feitas, r.sequencia]).toEqual([0, 0, 0])
  })

  it('só um protocolo semanal (quarta): uma dose na semana, no dia certo, ainda por fazer', () => {
    const r = resumoSemana([prot()], [item({ frequencia: { tipo: 'semana', dias: [3] }, horarios: ['13:00'] })], [], SEG)
    expect(r.dias.map((d) => d.previstas)).toEqual([0, 0, 1, 0, 0, 0, 0])
    expect(r.dias[2]).toMatchObject({ dia: '2026-11-11', aFazer: 1, semRegistro: 0, protocolos: ['p1'] })
    expect(r.dias[2].doses[0].status).toBe('futura')
    expect([r.previstas, r.feitas]).toEqual([1, 0])
  })

  it('conta feitas, não feitas, sem registro e as que faltam; hoje usa o horário exato como a lista de Hoje', () => {
    const quarta = new Date(2026, 10, 11, 9, 0) // 08:00 de hoje já passou da tolerância
    const aps = [ap('2026-11-09 08:00'), ap('2026-11-10 08:00', { status: 'pulada' })]
    const r = resumoSemana([prot()], [item()], aps, quarta)
    expect(r.dias.slice(0, 3).map((d) => [d.feitas, d.puladas, d.semRegistro, d.aFazer])).toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])
    expect(r.dias[3].doses[0].status).toBe('futura')
    expect([r.previstas, r.feitas, r.puladas]).toEqual([7, 1, 1])
  })

  it('pausa no meio da semana: os dias da pausa não têm dose nem contam como sem registro', () => {
    const p = prot({ estado: 'pausado', pausadoDesde: '2026-11-11', pausadoAte: '2026-11-13' })
    const r = resumoSemana([p], [item()], [], SEG)
    expect(r.dias.map((d) => d.previstas)).toEqual([1, 1, 0, 0, 1, 1, 1])
    // pausa já terminada (histórico de pausas) também
    const p2 = prot({ pausas: [{ de: '2026-11-09', ate: '2026-11-11' }] })
    expect(resumoSemana([p2], [item()], [], new Date(2026, 10, 12, 12)).dias.map((d) => d.semRegistro)).toEqual([0, 0, 1, 1, 0, 0, 0])
  })

  it('protocolo que termina na semana (fim) e protocolo encerrado no meio dela', () => {
    expect(resumoSemana([prot({ fim: '2026-11-12' })], [item()], [], SEG).dias.map((d) => d.previstas)).toEqual([1, 1, 1, 1, 0, 0, 0])
    const enc = prot({ estado: 'encerrado', encerradoEm: '2026-11-11' })
    expect(resumoSemana([enc], [item()], [], new Date(2026, 10, 13, 12)).dias.map((d) => d.previstas)).toEqual([1, 1, 0, 0, 0, 0, 0])
  })

  it('dia passado: registro com horário antigo (o horário mudou depois) ainda vale para a mesma linha', () => {
    const porDia = indexarPorDia([ap('2026-11-09 07:00')])
    const d = dosesDoDia([prot()], [item({ horarios: ['08:00'] })], porDia, '2026-11-09', new Date(2026, 10, 10, 12))
    expect(d[0].status).toBe('feita')
    // hoje não: a lista de Hoje mostra esse registro à parte e o horário novo como pendente
    const h = dosesDoDia([prot()], [item({ horarios: ['08:00'] })], porDia, '2026-11-09', new Date(2026, 10, 9, 7, 50))
    expect(h[0].status).toBe('pendente')
  })

  it('virada de ano: semana de 28/12 a 03/01 com doses dos dois anos', () => {
    const r = resumoSemana([prot({ inicio: '2026-12-01' })], [item({ frequencia: { tipo: 'cadaN', n: 2 } })], [], new Date(2026, 11, 31, 12))
    expect(r.dias.map((d) => d.dia)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(r.dias.map((d) => d.previstas)).toEqual([0, 1, 0, 1, 0, 1, 0])
    expect(r.dias[5].doses[0].status).toBe('futura')
  })
})

describe('sequência de dias com tudo feito', () => {
  it('conta dias seguidos com todas as doses tomadas; hoje em andamento não quebra; pular quebra', () => {
    const aps = ['2026-11-06', '2026-11-07', '2026-11-08'].map((d) => ap(`${d} 08:00`))
    const ag = new Date(2026, 10, 9, 7, 0)
    expect(sequenciaTudoFeito([prot()], [item()], indexarPorDia(aps), ag)).toBe(3)
    // hoje completo entra
    expect(sequenciaTudoFeito([prot()], [item()], indexarPorDia([...aps, ap('2026-11-09 08:00')]), new Date(2026, 10, 9, 9))).toBe(4)
    // um dia marcado como não feito quebra
    const comPulo = [ap('2026-11-06 08:00'), ap('2026-11-07 08:00', { status: 'pulada' }), ap('2026-11-08 08:00')]
    expect(sequenciaTudoFeito([prot()], [item()], indexarPorDia(comPulo), ag)).toBe(1)
  })

  it('dias sem dose prevista (semanal) não contam nem quebram', () => {
    const semanal = item({ frequencia: { tipo: 'semana', dias: [1] } }) // segundas
    const aps = [ap('2026-10-26 08:00'), ap('2026-11-02 08:00')]
    expect(sequenciaTudoFeito([prot({ inicio: '2026-10-01' })], [semanal], indexarPorDia(aps), new Date(2026, 10, 9, 7))).toBe(2)
  })

  it('sem nada registrado: zero (e não passa do início do protocolo)', () => {
    expect(sequenciaTudoFeito([prot()], [item()], new Map(), SEG)).toBe(0)
  })
})

describe('próximas doses', () => {
  it('a partir de amanhã, agrupadas por dia, nas cores/linhas de cada protocolo', () => {
    const p2 = prot({ id: 'p2' })
    const g = proximasDoses([prot(), p2], [item({ horarios: ['08:00', '20:00'] }), item({ id: 'i2', protocoloId: 'p2', horarios: ['13:00'], frequencia: { tipo: 'cadaN', n: 2 } })], SEG)
    expect(g.map((x) => x.dia)).toEqual(['2026-11-10', '2026-11-11'])
    expect(g[0].doses.map((s) => `${s.horario} ${s.protocoloId}`)).toEqual(['08:00 p1', '20:00 p1'])
    expect(g[1].doses.map((s) => `${s.horario} ${s.protocoloId}`)).toEqual(['08:00 p1', '13:00 p2', '20:00 p1'])
  })

  it('protocolo semanal: as próximas 5 semanas; pausado e encerrado ficam de fora', () => {
    const g = proximasDoses([prot()], [item({ frequencia: { tipo: 'semana', dias: [3] } })], SEG)
    expect(g.map((x) => x.dia)).toEqual(['2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02', '2026-12-09'])
    expect(proximasDoses([prot({ estado: 'pausado', pausadoDesde: '2026-11-01' })], [item()], SEG)).toEqual([])
    expect(proximasDoses([prot({ estado: 'encerrado', encerradoEm: '2026-11-05' })], [item()], SEG)).toEqual([])
    // pausa com data de volta: retoma no dia certo
    expect(proximasDoses([prot({ estado: 'pausado', pausadoDesde: '2026-11-05', pausadoAte: '2026-11-20' })], [item()], SEG, 1)[0].dia).toBe('2026-11-20')
  })

  it('virada de ano', () => {
    expect(proximasDoses([prot()], [item()], new Date(2026, 11, 31, 22), 2).map((x) => x.dia)).toEqual(['2027-01-01', '2027-01-02'])
  })
})

describe('avisos do painel', () => {
  it('nada a avisar: lista vazia', () => {
    expect(alertasPainel(base({}), SEG)).toEqual([])
    expect(alertasPainel(base({ protocolos: [prot({ inicio: '2026-11-09' })], itens: [item()], frascos: [fr('f1')] }), SEG)).toEqual([])
  })

  it('dose de ontem sem registro aparece; registrada ou marcada como não feita, não', () => {
    const b = base({ protocolos: [prot()], itens: [item({ horarios: ['08:00', '20:00'] })], frascos: [fr('f1')] })
    const a = alertasPainel(b, SEG)
    expect(a[0]).toMatchObject({ tipo: 'ontem' })
    expect(a[0].tipo === 'ontem' && a[0].doses.map((s) => s.chave)).toEqual(['2026-11-08 08:00', '2026-11-08 20:00'])
    const b2 = { ...b, aplicacoes: [ap('2026-11-08 08:00'), ap('2026-11-08 20:00', { status: 'pulada' })] }
    expect(alertasPainel(b2, SEG).filter((x) => x.tipo === 'ontem')).toEqual([])
  })

  it('frasco acabando (2 doses ou menos) só quando não há outro frasco da substância', () => {
    const aps = [1, 2, 3].map((k) => ap(`2026-11-0${k + 5} 08:00`, { frascoId: 'f1' })) // 10 mg - 7,5 mg = 1 dose de 2,5 mg
    const b = base({ protocolos: [prot({ inicio: '2026-11-09' })], itens: [item({ frascoId: 'f1' })], frascos: [fr('f1')], aplicacoes: aps })
    expect(alertasPainel(b, SEG)).toEqual([{ tipo: 'acabando', frascoId: 'f1', substanciaId: 's1', itemId: 'i1', protocoloId: 'p1', doses: 1 }])
    expect(alertasPainel({ ...b, frascos: [fr('f1'), fr('f2', { status: 'fechado', diluenteMl: undefined, reconstituidoEm: undefined })] }, SEG)).toEqual([])
    // com 3 doses ainda não avisa
    expect(alertasPainel({ ...b, aplicacoes: aps.slice(0, 1) }, SEG)).toEqual([])
  })

  it('frasco vencido vem antes; vencendo em até 14 dias vem depois dos de estoque', () => {
    const b = base({
      protocolos: [prot({ inicio: '2026-11-09' })],
      itens: [item(), item({ id: 'i2', substanciaId: 's2' })],
      frascos: [fr('venc', { usarAte: '2026-11-07' }), fr('logo', { substanciaId: 's9', usarAte: '2026-11-14' }), fr('longe', { substanciaId: 's9', usarAte: '2027-01-01' })],
    })
    const a = alertasPainel(b, SEG)
    expect(a.map((x) => x.tipo)).toEqual(['vencimento', 'sem-frasco', 'vencimento'])
    expect(a[0]).toMatchObject({ frascoId: 'venc', dias: -2 })
    expect(a[1]).toMatchObject({ itemId: 'i2' })
    expect(a[2]).toMatchObject({ frascoId: 'logo', dias: 5 })
    // frasco vencido já sem saldo pelos registros: não repete o aviso de data
    const vazio = [1, 2, 3, 4].map((k) => ap(`2026-11-0${k} 08:00`, { frascoId: 'venc' }))
    expect(alertasPainel({ ...b, itens: [], aplicacoes: vazio }, SEG).map((x) => x.tipo === 'vencimento' && x.frascoId)).toEqual(['logo'])
    // descartado ou acabado não avisa
    expect(alertasPainel({ ...b, frascos: [fr('venc', { usarAte: '2026-11-07', status: 'descartado' })], itens: [] }, SEG)).toEqual([])
  })

  it('sem frasco: só linhas de protocolo ativo (pausado e encerrado não)', () => {
    const b = base({ protocolos: [prot({ inicio: '2026-11-09' })], itens: [item()] })
    expect(alertasPainel(b, SEG)).toEqual([{ tipo: 'sem-frasco', itemId: 'i1', protocoloId: 'p1', substanciaId: 's1' }])
    expect(alertasPainel({ ...b, protocolos: [prot({ inicio: '2026-11-09', estado: 'pausado', pausadoDesde: '2026-11-09' })] }, SEG)).toEqual([])
    expect(alertasPainel({ ...b, protocolos: [prot({ inicio: '2026-11-09', estado: 'encerrado', encerradoEm: '2026-11-09' })] }, SEG)).toEqual([])
  })

  it('protocolo terminando nos próximos 7 dias', () => {
    const b = base({ protocolos: [prot({ inicio: '2026-11-09', fim: '2026-11-12' })], itens: [item({ frascoId: 'f1' })], frascos: [fr('f1')] })
    expect(alertasPainel(b, SEG)).toEqual([{ tipo: 'termina', protocoloId: 'p1', fim: '2026-11-12', dias: 3 }])
    expect(alertasPainel({ ...b, protocolos: [prot({ inicio: '2026-11-09', fim: '2026-11-30' })] }, SEG)).toEqual([])
    expect(alertasPainel({ ...b, protocolos: [prot({ inicio: '2026-11-01', fim: '2026-11-08' })] }, SEG).filter((x) => x.tipo === 'termina')).toEqual([])
  })
})

describe('peso, estoque e saudação', () => {
  const med = (data: string, pesoKg?: number): Medicao => ({ id: data, data, pesoKg, medidas: {} })
  it('peso: último e diferença desde o primeiro (sem julgar)', () => {
    expect(resumoPeso([])).toBeNull()
    expect(resumoPeso([med('2026-11-01')])).toBeNull()
    expect(resumoPeso([med('2026-11-08', 80.4), med('2026-10-01', 82), med('2026-10-15')])).toEqual({
      primeiro: { data: '2026-10-01', kg: 82 }, ultimo: { data: '2026-11-08', kg: 80.4 }, variacao: -1.6, registros: 2,
    })
    expect(resumoPeso([med('2026-11-08', 80)])?.variacao).toBe(0)
  })

  it('estoque: frascos em uso e o que tem menos doses', () => {
    const b = base({
      protocolos: [prot()],
      itens: [item({ frascoId: 'f1' }), item({ id: 'i2', substanciaId: 's2', frascoId: 'f2' })],
      frascos: [fr('f1'), fr('f2', { substanciaId: 's2', mgTotal: 5 }), fr('f3', { status: 'acabou' })],
    })
    expect(resumoEstoquePainel(b, '2026-11-09')).toEqual({ emUso: 2, maisPerto: { itemId: 'i2', substanciaId: 's2', doses: 2 } })
    expect(resumoEstoquePainel(base({}), '2026-11-09')).toEqual({ emUso: 0, maisPerto: undefined })
  })

  it('saudação pela hora local', () => {
    expect(saudacao(new Date(2026, 10, 9, 4, 59))).toBe('Boa noite')
    expect(saudacao(new Date(2026, 10, 9, 5))).toBe('Bom dia')
    expect(saudacao(new Date(2026, 10, 9, 12))).toBe('Boa tarde')
    expect(saudacao(new Date(2026, 10, 9, 18))).toBe('Boa noite')
  })
})

// process.env.TZ: o Node relê o fuso quando ele muda
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
describe('fuso e horário de verão', () => {
  const tz = env.TZ
  afterEach(() => {
    env.TZ = tz
  })
  it('São Paulo 2018: a semana do início do verão tem 7 dias e uma dose por dia, inclusive à meia-noite', () => {
    env.TZ = 'America/Sao_Paulo'
    const r = resumoSemana([prot({ inicio: '2018-10-01' })], [item({ horarios: ['00:00'] })], [], new Date(2018, 10, 4, 12))
    expect(r.dias.map((d) => d.dia)).toEqual(['2018-10-29', '2018-10-30', '2018-10-31', '2018-11-01', '2018-11-02', '2018-11-03', '2018-11-04'])
    expect(r.previstas).toBe(7)
    expect(proximasDoses([prot({ inicio: '2018-10-01' })], [item({ horarios: ['00:00'] })], new Date(2018, 10, 3, 12), 2).map((g) => g.dia)).toEqual(['2018-11-04', '2018-11-05'])
  })
  it('Nova York: semana que atravessa a troca de horário de março', () => {
    env.TZ = 'America/New_York'
    const r = resumoSemana([prot({ inicio: '2026-03-01' })], [item({ horarios: ['02:30'] })], [], new Date(2026, 2, 8, 12))
    expect(r.dias.map((d) => d.dia)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'])
    expect(r.previstas).toBe(7)
  })
})
