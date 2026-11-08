import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BancoLocal } from './db.ts'
import { criarRepo, type Repo } from './repo.ts'
import { aplicarBackup, lerBackup, montarBackup } from './backup.ts'
import { SUGESTOES } from '../dominio/sugestoes.ts'
import type { Protocolo } from '../dominio/tipos.ts'

let repo: Repo
let n = 0
beforeEach(() => {
  repo = criarRepo(new BancoLocal(`teste-${n++}`))
})

const prot = (id = 'p1'): Protocolo => ({ id, inicio: '2026-11-02', estado: 'ativo', lembretes: true, criadoEm: '' })

describe('repositório', () => {
  it('usar a mesma sugestão duas vezes não duplica', async () => {
    const bpc = SUGESTOES.find((s) => s.id === 'bpc-157')!
    const a = await repo.usarSugestao(bpc)
    const b = await repo.usarSugestao(bpc)
    expect(a.id).toBe(b.id)
    expect(await repo.listarSubstancias()).toHaveLength(1)
  })

  it('substância em uso não pode ser apagada, só arquivada', async () => {
    const s = await repo.criarSubstancia({ nome: 'xyz-12', tipo: 'simples', origem: 'usuario' })
    await repo.salvarProtocolo(prot(), [{ id: 'i1', protocoloId: 'p1', substanciaId: s.id, doseValor: 1, doseUnidade: 'mg', frequencia: { tipo: 'diaria' }, horarios: ['08:00'], ordem: 0 }])
    await expect(repo.apagarSubstancia(s.id)).rejects.toThrow()
    await repo.arquivarSubstancia(s.id)
    expect((await repo.listarSubstancias())[0].arquivada).toBe(true)
  })

  it('nome do protocolo vazio é salvo como ausente', async () => {
    await repo.salvarProtocolo({ ...prot(), nome: '   ' }, [])
    expect((await repo.obterProtocolo('p1'))!.protocolo.nome).toBeUndefined()
  })

  it('editar protocolo remove linhas apagadas e mantém os registros antigos', async () => {
    const base = { protocoloId: 'p1', substanciaId: 's', doseValor: 1, doseUnidade: 'mg' as const, frequencia: { tipo: 'diaria' as const }, horarios: ['08:00'], ordem: 0 }
    await repo.salvarProtocolo(prot(), [{ ...base, id: 'i1' }, { ...base, id: 'i2' }])
    await repo.registrarAplicacao({ protocoloId: 'p1', itemId: 'i2', substanciaId: 's', previsto: '2026-11-02 08:00', dataHora: '2026-11-02T08:00:00', doseValor: 1, doseUnidade: 'mg', status: 'feita' })
    await repo.salvarProtocolo(prot(), [{ ...base, id: 'i1', doseValor: 2 }])
    const p = await repo.obterProtocolo('p1')
    expect(p!.itens.map((i) => [i.id, i.doseValor])).toEqual([['i1', 2]])
    expect(await repo.listarAplicacoes()).toHaveLength(1)
  })

  it('registrar de novo o mesmo horário substitui; apagar e desfazer', async () => {
    const reg = { protocoloId: 'p1', itemId: 'i1', substanciaId: 's', previsto: '2026-11-02 08:00', dataHora: '2026-11-02T08:00:00', doseValor: 1, doseUnidade: 'mg' as const }
    await repo.registrarAplicacao({ ...reg, status: 'pulada' })
    const a = await repo.registrarAplicacao({ ...reg, status: 'feita' })
    expect(await repo.listarAplicacoes()).toHaveLength(1)
    const apagada = await repo.apagarAplicacao(a.id)
    expect(await repo.listarAplicacoes()).toHaveLength(0)
    await repo.restaurarAplicacao(apagada!)
    expect((await repo.listarAplicacoes())[0].status).toBe('feita')
  })

  it('pausa com data vencida volta a ativo', async () => {
    await repo.salvarProtocolo(prot(), [])
    await repo.pausarProtocolo('p1', '2026-11-05')
    await repo.normalizarPausas('2026-11-04')
    expect((await repo.obterProtocolo('p1'))!.protocolo.estado).toBe('pausado')
    await repo.normalizarPausas('2026-11-05')
    expect((await repo.obterProtocolo('p1'))!.protocolo.estado).toBe('ativo')
  })

  it('apagar tudo zera o aparelho', async () => {
    await repo.setConfig('aceite', { versao: '1', em: 'x' })
    await repo.salvarProtocolo(prot(), [])
    await repo.apagarTudo()
    expect(await repo.getConfig('aceite')).toBeUndefined()
    expect((await repo.contagens()).protocolos).toBe(0)
  })
})

describe('backup', () => {
  it('exporta, apaga, importa e tudo volta igual (com fotos)', async () => {
    await repo.setConfig('aceite', { versao: '1', em: 'agora' })
    await repo.setConfig('canais', { agenda: true, notificacao: true })
    const s = await repo.criarSubstancia({ nome: 'Blend pele', tipo: 'blend', origem: 'usuario', componentes: [{ nome: 'A', quantidade: 50, unidade: 'mg' }] })
    await repo.salvarProtocolo(prot(), [{ id: 'i1', protocoloId: 'p1', substanciaId: s.id, doseValor: 10, doseUnidade: 'unidades', frequencia: { tipo: 'diaria' }, horarios: ['21:00'], ordem: 0 }])
    await repo.salvarMedicao({ data: '2026-11-04', pesoKg: 84.2, medidas: { cintura: 91 } })
    await repo.adicionarFoto({ data: '2026-11-04', angulo: 'frente', blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }), tipo: 'image/jpeg' })

    const arquivo = await montarBackup(repo, true)
    const texto = JSON.stringify(arquivo)
    await repo.apagarTudo()
    await repo.setConfig('aceite', { versao: '1', em: 'novo aparelho' })

    const previa = lerBackup(texto)
    expect(previa.contagens).toEqual({ protocolos: 1, aplicacoes: 0, medicoes: 1, fotos: 1, frascos: 0 })
    await aplicarBackup(repo, previa)

    expect((await repo.listarSubstancias())[0].componentes![0].quantidade).toBe(50)
    expect((await repo.listarMedicoes())[0].pesoKg).toBe(84.2)
    const foto = (await repo.listarFotos())[0]
    expect(foto.blob.size).toBe(4)
    expect([...new Uint8Array(await foto.blob.arrayBuffer())]).toEqual([1, 2, 3, 250])
    expect((await repo.getConfig('aceite'))!.em).toBe('novo aparelho')
    expect(await repo.getConfig('reativarAvisos')).toBe(true)
  })

  it('sem fotos quando desmarcado', async () => {
    await repo.adicionarFoto({ data: '2026-11-04', angulo: 'lado', blob: new Blob([new Uint8Array([9])]), tipo: 'image/jpeg' })
    expect((await montarBackup(repo, false)).fotos).toHaveLength(0)
  })

  it('arquivo inválido é recusado sem mexer nos dados', async () => {
    await repo.salvarProtocolo(prot(), [])
    expect(() => lerBackup('não é json')).toThrow()
    expect(() => lerBackup(JSON.stringify({ app: 'outro', formato: 1 }))).toThrow()
    expect(() => lerBackup(JSON.stringify({ app: 'peptide-tracker', formato: 1, tabelas: { protocolos: 'x' } }))).toThrow()
    expect(() => lerBackup(JSON.stringify({ app: 'peptide-tracker', formato: 99, tabelas: {} }))).toThrow(/versão mais nova/)
    expect((await repo.contagens()).protocolos).toBe(1)
  })
})
