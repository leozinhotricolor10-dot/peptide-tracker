// Navegação do assistente de protocolo: o que um passo faz com o rascunho que existe,
// fechar o cadastro sem apagar no meio da troca de tela, e o frasco salvo pela calculadora.
import { beforeEach, describe, expect, it } from 'vitest'
import { frascoDoCalculo, itemVazio, LISTA_PROTOCOLOS, montarProtocolo, novoRascunho, rascunho, situacaoPasso, validarRascunho, type Rascunho } from './rascunho.ts'
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

describe('frasco da calculadora (opcional, um toque)', () => {
  it('sem pedir, não salva frasco', () => {
    expect(frascoDoCalculo({ ...pronto().itens[0], calcMgTxt: '5', calcMlTxt: '2' }, '2026-11-09')).toBeNull()
  })

  it('pedindo: frasco reconstituído hoje com os números digitados', () => {
    const i = { ...pronto().itens[0], calcMgTxt: '5', calcMlTxt: '2,5', salvarFrasco: true }
    expect(frascoDoCalculo(i, '2026-11-09')).toEqual({
      substanciaId: 's1', mgTotal: 5, diluenteMl: 2.5, status: 'reconstituido', reconstituidoEm: '2026-11-09', compradoEm: '2026-11-09',
    })
  })

  it('pedindo com números inválidos: a revisão avisa em vez de salvar calado', () => {
    for (const [mg, ml] of [['', '2'], ['0', '2'], ['5', '-1'], ['1.000', '2']]) {
      const r = pronto({ calcMgTxt: mg, calcMlTxt: ml, salvarFrasco: true })
      expect(frascoDoCalculo(r.itens[0], r.inicio)).toBeNull()
      const v = validarRascunho(r)
      expect(v.ok).toBe(false)
      expect(v.erros.join(' ')).toMatch(/Estoque/)
    }
    expect(validarRascunho(pronto({ calcMgTxt: '5', calcMlTxt: '2', salvarFrasco: true })).ok).toBe(true)
    // números da calculadora sem pedir para salvar não atrapalham
    expect(validarRascunho(pronto({ calcMgTxt: 'abc', calcMlTxt: '' })).ok).toBe(true)
  })

  it('a calculadora não muda a dose gravada no protocolo', () => {
    const { itens } = montarProtocolo(pronto({ calcMgTxt: '10', calcMlTxt: '3', salvarFrasco: true }))
    expect(itens[0].doseValor).toBe(250)
    expect(itens[0].doseUnidade).toBe('mcg')
  })
})
