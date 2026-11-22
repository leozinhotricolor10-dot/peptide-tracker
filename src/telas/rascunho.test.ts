// Navegação do assistente de protocolo: o que um passo faz com o rascunho que existe,
// fechar o cadastro sem apagar no meio da troca de tela, e o frasco salvo pela calculadora.
import { beforeEach, describe, expect, it } from 'vitest'
import { frascoDoCalculo, itemVazio, LISTA_PROTOCOLOS, montarProtocolo, novoRascunho, rascunho, rascunhoDe, resumoDoSalvar, situacaoPasso, temOpcoesAvancadas, unidadeInicial, validarRascunho, type Rascunho } from './rascunho.ts'
import { temTelaAnterior } from '../ui/navegar.ts'

const pronto = (mudar: Partial<Rascunho['itens'][0]> = {}): Rascunho => {
  const r = novoRascunho()
  r.itens = [{ ...itemVazio(), substanciaId: 's1', doseTxt: '250', doseUnidade: 'mcg', horarios: ['08:00'], ...mudar }]
  return r
}

beforeEach(() => rascunho.limpar())

describe('passo do assistente sem cadastro em andamento (bug: voltar reabria os passos / Carregando infinito)', () => {
  it('sem rascunho (link antigo, aba nova): vai para a lista, não começa um cadastro novo escondido', () => {
    expect(situacaoPasso(null)).toEqual({ tipo: 'sem-rascunho', para: LISTA_PROTOCOLOS })
  })

  it('cadastro salvo: o passo leva ao protocolo salvo, nunca mostra o passo de novo', () => {
    rascunho.iniciar(pronto())
    rascunho.fechar('/protocolos/abc')
    const s = situacaoPasso(rascunho.get())
    expect(s).toEqual({ tipo: 'fechado', para: '/protocolos/abc' })
  })

  it('fechar não apaga o rascunho no meio da troca de tela (a tela antiga não fica sem dados)', () => {
    rascunho.iniciar(pronto())
    rascunho.fechar(LISTA_PROTOCOLOS)
    expect(rascunho.get()?.itens[0].doseTxt).toBe('250')
    // e mexer depois de fechado não reabre
    rascunho.mudar(() => ({ nome: 'x' }))
    expect(situacaoPasso(rascunho.get()).tipo).toBe('fechado')
  })

  it('um cadastro novo substitui o fechado', () => {
    rascunho.iniciar(pronto())
    rascunho.fechar('/protocolos/abc')
    const novo = novoRascunho()
    rascunho.iniciar(novo)
    const s = situacaoPasso(rascunho.get())
    expect(s.tipo).toBe('ok')
    expect(s.tipo === 'ok' && s.r.protocoloId).toBe(novo.protocoloId)
  })

  it('fechar sem rascunho não cria nada', () => {
    rascunho.fechar('/x')
    expect(rascunho.get()).toBeNull()
  })
})

describe('voltar com saída garantida', () => {
  it('só volta pelo histórico quando há tela anterior do app', () => {
    expect(temTelaAnterior({ idx: 3, key: 'a', usr: null })).toBe(true)
    expect(temTelaAnterior({ idx: 0 })).toBe(false) // primeira tela aberta (link direto, F5 em aba nova)
    expect(temTelaAnterior(null)).toBe(false)
    expect(temTelaAnterior({})).toBe(false)
    expect(temTelaAnterior({ idx: '2' })).toBe(false)
  })
})

describe('frasco da calculadora: sempre vai para o Estoque', () => {
  it('com mg e água: frasco reconstituído hoje com os números digitados, sem precisar pedir', () => {
    const i = { ...pronto().itens[0], calcMgTxt: '5', calcMlTxt: '2,5' }
    expect(frascoDoCalculo(i, '2026-11-09')).toEqual({
      substanciaId: 's1', mgTotal: 5, diluenteMl: 2.5, status: 'reconstituido', reconstituidoEm: '2026-11-09', compradoEm: '2026-11-09',
    })
  })

  it('só com os mg (ainda não reconstituiu): entra lacrado', () => {
    expect(frascoDoCalculo({ ...pronto().itens[0], calcMgTxt: '10' }, '2026-11-09')).toEqual({ substanciaId: 's1', mgTotal: 10, status: 'fechado', compradoEm: '2026-11-09' })
  })

  it('sem dados do frasco: nenhum frasco (o protocolo salva e mostra o aviso para adicionar depois)', () => {
    expect(frascoDoCalculo(pronto().itens[0], '2026-11-09')).toBeNull()
    expect(validarRascunho(pronto()).ok).toBe(true)
  })

  it('linha que já tem frasco usável ligado (editar): não duplica', () => {
    expect(frascoDoCalculo({ ...pronto().itens[0], calcMgTxt: '5', calcMlTxt: '2' }, '2026-11-09', true)).toBeNull()
  })

  it('números inválidos na calculadora: a revisão avisa em vez de salvar sem o frasco calado', () => {
    for (const [mg, ml] of [['', '2'], ['0', '2'], ['5', '-1'], ['1.000', '2'], ['abc', '']]) {
      const r = pronto({ calcMgTxt: mg, calcMlTxt: ml })
      expect(frascoDoCalculo(r.itens[0], r.inicio)).toBeNull()
      const v = validarRascunho(r)
      expect(v.ok).toBe(false)
      expect(v.erros.join(' ')).toMatch(/frasco/)
    }
    expect(validarRascunho(pronto({ calcMgTxt: '5', calcMlTxt: '2' })).ok).toBe(true)
    expect(validarRascunho(pronto({ calcMgTxt: '  ', calcMlTxt: '' })).ok).toBe(true)
  })

  it('a calculadora não muda a dose gravada no protocolo', () => {
    const { itens } = montarProtocolo(pronto({ calcMgTxt: '10', calcMlTxt: '3' }))
    expect(itens[0].doseValor).toBe(250)
    expect(itens[0].doseUnidade).toBe('mcg')
  })

  it('a cor escolhida vai para o protocolo; editar mantém a cor', () => {
    expect(montarProtocolo({ ...pronto(), cor: 'violeta' }).protocolo.cor).toBe('violeta')
    expect(montarProtocolo(pronto()).protocolo.cor).toBeUndefined()
  })
})

describe('primeiro acesso curto: padrões do cadastro', () => {
  it('unidade já marcada: mg por padrão, nunca vazia no caminho padrão (sem "Escolha a unidade.")', () => {
    const i = itemVazio()
    expect(i.doseUnidade).toBe('mg')
    expect(i.unidadeAuto).toBe(true)
    expect(i.horarios).toEqual(['08:00'])
    const r = novoRascunho()
    r.itens = [{ ...r.itens[0], substanciaId: 's1', doseTxt: '2' }]
    // só substância e dose: já salva (unidade, horário, início hoje e sem fim vêm prontos)
    expect(validarRascunho(r)).toEqual({ ok: true, erros: [] })
    const { protocolo, itens } = montarProtocolo(r)
    expect(itens[0].doseUnidade).toBe('mg')
    expect(itens[0].horarios).toEqual(['08:00'])
    expect(protocolo.fim).toBeUndefined()
    expect(protocolo.ciclo).toBeUndefined()
    expect(protocolo.nome).toBeUndefined()
  })

  it('unidade conhecida da substância: a última usada com ela; blend sem histórico em unidades', () => {
    const itens = [
      { substanciaId: 'a', doseUnidade: 'mcg' as const },
      { substanciaId: 'b', doseUnidade: 'mL' as const },
      { substanciaId: 'a', doseUnidade: 'UI' as const },
    ]
    expect(unidadeInicial({ id: 'a', tipo: 'simples' }, itens)).toBe('UI')
    expect(unidadeInicial({ id: 'c', tipo: 'simples' }, itens)).toBe('mg')
    expect(unidadeInicial({ id: 'd', tipo: 'blend' }, itens)).toBe('unidades')
    expect(unidadeInicial({ id: 'b', tipo: 'blend' }, itens)).toBe('mL')
  })

  it('horário vazio é avisado; horários repetidos viram um só', () => {
    expect(validarRascunho(pronto({ horarios: ['08:00', ''] })).erros.join(' ')).toMatch(/horário vazio/)
    expect(validarRascunho(pronto({ horarios: [''] })).erros.join(' ')).toMatch(/pelo menos um horário/)
    expect(montarProtocolo(pronto({ horarios: ['20:00', '08:00', '20:00'] })).itens[0].horarios).toEqual(['08:00', '20:00'])
  })

  it('resumo no botão Salvar', () => {
    expect(resumoDoSalvar(pronto({ doseTxt: '2', doseUnidade: 'mg', freqTipo: 'semana', dias: [5], horarios: ['08:00'] }))).toBe('2 mg, 1x por semana, sex às 08:00')
    expect(resumoDoSalvar(pronto({ doseTxt: '250', doseUnidade: 'mcg', horarios: ['08:00', '20:00'] }))).toBe('250 mcg, todo dia às 08:00 e 20:00')
    expect(resumoDoSalvar(pronto({ freqTipo: 'cadaN', cadaN: '3', horarios: ['07:30'] }))).toBe('250 mcg, a cada 3 dias às 07:30')
    const dois = pronto()
    dois.itens = [...dois.itens, { ...dois.itens[0], id: 'x' }]
    expect(resumoDoSalvar(dois)).toBe('2 substâncias')
  })

  it('"Mais opções" abre sozinho só com campo avançado preenchido', () => {
    expect(temOpcoesAvancadas(pronto())).toBe(false)
    expect(temOpcoesAvancadas({ ...pronto(), nome: 'Pele' })).toBe(true)
    expect(temOpcoesAvancadas({ ...pronto(), duracaoTipo: 'semanas' })).toBe(true)
    expect(temOpcoesAvancadas({ ...pronto(), ciclo: true })).toBe(true)
    expect(temOpcoesAvancadas({ ...pronto(), inicio: '2020-01-01' })).toBe(true)
    // editar: a data de início (que todo protocolo tem) não abre sozinha; a cor também não
    const p = { id: 'p', inicio: '2026-01-01', estado: 'ativo' as const, lembretes: true, criadoEm: '2026-01-01T00:00:00Z', cor: 'violeta' }
    const item = { id: 'i', protocoloId: 'p', substanciaId: 's1', doseValor: 2, doseUnidade: 'mg' as const, frequencia: { tipo: 'diaria' as const }, horarios: ['08:00'], ordem: 0 }
    expect(temOpcoesAvancadas(rascunhoDe(p, [item], 'editar', ''))).toBe(false)
    expect(temOpcoesAvancadas(rascunhoDe({ ...p, fim: '2026-02-25' }, [item], 'editar', ''))).toBe(true)
    expect(temOpcoesAvancadas(rascunhoDe({ ...p, nome: 'Meu' }, [item], 'editar', ''))).toBe(true)
    expect(temOpcoesAvancadas(rascunhoDe({ ...p, ciclo: { diasOn: 5, diasOff: 2 } }, [item], 'editar', ''))).toBe(true)
    // editar mantém a unidade gravada (não troca pela automática)
    expect(rascunhoDe(p, [item], 'editar', '').itens[0].unidadeAuto).toBe(false)
  })
})
