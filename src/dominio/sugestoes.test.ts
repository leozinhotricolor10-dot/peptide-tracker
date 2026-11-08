import { describe, expect, it } from 'vitest'
import type { Substancia } from './tipos.ts'
import { SUGESTOES, buscar, existeNomeExato, normalizar } from './sugestoes.ts'
import { gerarIcs } from './ics.ts'
import { nomeProtocolo } from './nomes.ts'

const sub = (s: Partial<Substancia>): Substancia => ({ id: 'x', nome: 'X', tipo: 'simples', origem: 'usuario', arquivada: false, criadaEm: '', ...s })

describe('lista de sugestões', () => {
  it('tem 46 nomes, ids únicos e nenhum campo de dose ou composição', () => {
    expect(SUGESTOES).toHaveLength(46)
    expect(new Set(SUGESTOES.map((s) => s.id)).size).toBe(46)
    for (const s of SUGESTOES) expect(Object.keys(s).every((k) => ['id', 'nome', 'tipo', 'sinonimos'].includes(k))).toBe(true)
    expect(SUGESTOES.filter((s) => s.tipo === 'blend').map((s) => s.nome)).toEqual(['GLOW 70 mg'])
  })

  it('normaliza acento, hífen e caixa', () => {
    expect(normalizar('BPC-157')).toBe(normalizar('bpc 157'))
    expect(normalizar('Orotato de Lítio')).toBe('orotatodelitio')
  })

  it('acha por grafia alternativa', () => {
    const r = buscar('epithalon', [])
    expect(r[0]).toMatchObject({ origem: 'lista', sugestao: { id: 'epitalon' } })
    expect(buscar('mk677', [])[0]).toMatchObject({ sugestao: { id: 'ibutamoren' } })
  })

  it('sem texto mostra as suas primeiro e a amostra curta', () => {
    const r = buscar('', [sub({ nome: 'Minha X' })])
    expect(r[0]).toMatchObject({ origem: 'minha' })
    expect(r.filter((x) => x.origem === 'lista').map((x) => (x.origem === 'lista' ? x.sugestao.nome : ''))).toEqual(['BPC-157', 'TB-500', 'Semaglutida', 'Tirzepatida', 'GLOW 70 mg'])
  })

  it('nome fora da lista: nada encontrado, mas pode criar', () => {
    expect(buscar('xyz-12', [])).toHaveLength(0)
    expect(existeNomeExato('xyz-12', [])).toBe(false)
    expect(existeNomeExato('bpc 157', [])).toBe(true)
  })

  it('item da lista já copiado aparece como da pessoa, com o nome dela, sem duplicar', () => {
    const minha = sub({ id: 'm', nome: 'Meu BPC', origem: 'lista', listaId: 'bpc-157' })
    const r = buscar('bpc', [minha])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ origem: 'minha', substancia: { nome: 'Meu BPC' } })
  })

  it('atualizar a lista (renomear ou remover item) não altera as substâncias da pessoa', () => {
    const minha = sub({ id: 'm', nome: 'BPC-157', origem: 'lista', listaId: 'bpc-157' })
    const novaLista = SUGESTOES.filter((s) => s.id !== 'bpc-157').map((s) => (s.id === 'tb-500' ? { ...s, nome: 'TB-500 novo' } : s))
    const r = buscar('', [minha], novaLista)
    expect(r[0]).toMatchObject({ origem: 'minha', substancia: { nome: 'BPC-157' } })
    expect(minha.nome).toBe('BPC-157')
  })
})

describe('nome do protocolo', () => {
  it('vazio usa o nome do composto (blend: nome dado pela pessoa)', () => {
    const subs = [sub({ id: 's1', nome: 'Epithalon' }), sub({ id: 's2', nome: 'Blend pele 70 mg', tipo: 'blend' })]
    const itens = [{ id: 'i', protocoloId: 'p', substanciaId: 's2', doseValor: 10, doseUnidade: 'unidades' as const, frequencia: { tipo: 'diaria' as const }, horarios: [], ordem: 0 }]
    expect(nomeProtocolo({ id: 'p', nome: '' }, itens, subs)).toBe('Blend pele 70 mg')
    expect(nomeProtocolo({ id: 'p', nome: '  protocolo bela e bonita ✨ ' }, itens, subs)).toBe('protocolo bela e bonita ✨')
  })
})

describe('agenda .ics', () => {
  it('título genérico, alarme e horário local', () => {
    const ics = gerarIcs([{ inicio: new Date(2026, 10, 4, 8, 0), uid: 'a@pt' }], new Date(Date.UTC(2026, 10, 4, 0, 0, 0)))
    expect(ics).toContain('SUMMARY:Lembrete\r\n')
    expect(ics).toContain('DTSTART:20261104T080000\r\n')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('DTSTAMP:20261104T000000Z')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })
})
