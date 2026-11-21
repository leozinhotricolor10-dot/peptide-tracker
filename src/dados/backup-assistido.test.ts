// Backup assistido: data do último backup, "dado novo" desde o backup, compartilhar (com e sem
// suporte, cancelado, erro) e o armazenamento persistente.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BancoLocal } from './db.ts'
import { criarRepo, type Repo } from './repo.ts'
import { aplicarBackup, impressaoDados, lerBackup, montarBackup, nomeArquivoBackup, registrarBackupFeito } from './backup.ts'
import { lembreteBackup } from '../dominio/backup-lembrete.ts'
import { arquivoCompartilhavel, compartilharArquivo, enviarArquivo, versoesDoArquivo, type NavegadorShare } from '../sistema/compartilhar.ts'
import { estadoArmazenamento, pedirArmazenamentoPersistente } from '../sistema/armazenamento.ts'
import type { Protocolo } from '../dominio/tipos.ts'

let repo: Repo
let n = 0
beforeEach(() => {
  repo = criarRepo(new BancoLocal(`backup-assistido-${n++}`))
})

const prot: Protocolo = { id: 'p1', inicio: '2026-11-01', estado: 'ativo', lembretes: true, criadoEm: '' }
const linha = { id: 'i1', protocoloId: 'p1', substanciaId: 's1', doseValor: 1, doseUnidade: 'mg' as const, frequencia: { tipo: 'diaria' as const }, horarios: ['08:00'], ordem: 0 }
const registrar = (id: string) =>
  repo.registrarAplicacao({ id, protocoloId: 'p1', itemId: 'i1', substanciaId: 's1', dataHora: '2026-11-20T08:00:00.000Z', doseValor: 1, doseUnidade: 'mg', status: 'feita' })

describe('data do último backup e dado novo', () => {
  it('registrar o backup grava a data, o resumo dos dados e tira o "lembrar depois"', async () => {
    await repo.salvarProtocolo(prot, [linha])
    await repo.setConfig('backupAdiadoAte', '2026-12-01')
    await registrarBackupFeito(repo, new Date('2026-11-21T15:00:00Z'))
    expect(await repo.getConfig('ultimoBackup')).toBe('2026-11-21T15:00:00.000Z')
    expect(await repo.getConfig('backupAdiadoAte')).toBeUndefined()
    expect(await repo.getConfig('backupImpressao')).toBe(await impressaoDados(repo))
  })

  it('o resumo muda com registro novo, edição e exclusão; não muda com configuração do aparelho', async () => {
    await repo.salvarProtocolo(prot, [linha])
    const r0 = await impressaoDados(repo)
    await repo.setConfig('backupAdiadoAte', '2026-12-01')
    await repo.setConfig('notificados', ['x'])
    expect(await impressaoDados(repo)).toBe(r0)
    await registrar('a1')
    const r1 = await impressaoDados(repo)
    expect(r1).not.toBe(r0)
    await repo.db.aplicacoes.update('a1', { local: 'editado' })
    const r2 = await impressaoDados(repo)
    expect(r2).not.toBe(r1)
    await repo.apagarAplicacao('a1')
    expect(await impressaoDados(repo)).toBe(r0)
  })

  it('sem dado novo depois do backup, o lembrete de 7 dias não aparece; com dado novo, aparece', async () => {
    await repo.salvarProtocolo(prot, [linha])
    await registrar('a1')
    await registrarBackupFeito(repo, new Date('2026-11-01T12:00:00'))
    const situacao = async () => ({
      hoje: '2026-11-21',
      ultimoBackup: await repo.getConfig('ultimoBackup'),
      registros: 1,
      temDados: true,
      dadosNovos: (await repo.getConfig('backupImpressao')) !== (await impressaoDados(repo)),
    })
    expect(lembreteBackup(await situacao())).toBeNull()
    await registrar('a2')
    expect(lembreteBackup(await situacao())).toEqual({ tipo: 'atrasado', dias: 20 })
  })

  it('o resumo do aparelho não vai no arquivo; restaurar deixa os dados "iguais ao backup"', async () => {
    await repo.salvarProtocolo(prot, [linha])
    await registrarBackupFeito(repo)
    const arq = await montarBackup(repo, false)
    expect(arq.tabelas.config.some((c) => c.chave === 'backupImpressao')).toBe(false)
    await repo.apagarTudo()
    await aplicarBackup(repo, lerBackup(JSON.stringify(arq)))
    expect(await repo.getConfig('backupImpressao')).toBe(await impressaoDados(repo))
  })

  it('nome do arquivo com a data', () => {
    expect(nomeArquivoBackup(new Date(2026, 10, 3, 9))).toBe('peptide-tracker-backup-2026-11-03.json')
  })
})

describe('compartilhar o backup', () => {
  const blob = new Blob(['{"app":"peptide-tracker"}'], { type: 'application/json' })
  const nome = 'peptide-tracker-backup-2026-11-21.json'

  it('sem a API (navegador sem compartilhar): baixa o .json', async () => {
    const baixar = vi.fn()
    expect(await enviarArquivo(blob, nome, { nav: {}, baixar })).toEqual({ tipo: 'baixado', nome })
    expect(baixar).toHaveBeenCalledWith(blob, nome)
    expect(await enviarArquivo(blob, nome, { nav: undefined, baixar })).toEqual({ tipo: 'baixado', nome })
  })

  it('compartilha só arquivos de texto (Chrome do Android): manda o mesmo conteúdo como .txt', async () => {
    const share = vi.fn(async () => {})
    const nav: NavegadorShare = { share, canShare: (d) => !!d?.files?.every((f) => f.type === 'text/plain') }
    const r = await enviarArquivo(blob, nome, { nav, baixar: vi.fn() })
    expect(r.tipo).toBe('compartilhado')
    const enviado = (share.mock.calls[0] as unknown as [ShareData])[0].files![0]
    expect(enviado.name).toBe('peptide-tracker-backup-2026-11-21.txt')
    expect(await enviado.text()).toBe(await blob.text())
  })

  it('aceita .json: manda o .json', async () => {
    const nav: NavegadorShare = { share: async () => {}, canShare: () => true }
    expect(arquivoCompartilhavel(nav, versoesDoArquivo(blob, nome))?.name).toBe(nome)
  })

  it('não aceita nenhum tipo: baixa', async () => {
    const baixar = vi.fn()
    const r = await enviarArquivo(blob, nome, { nav: { share: async () => {}, canShare: () => false }, baixar })
    expect(r.tipo).toBe('baixado')
    expect(baixar).toHaveBeenCalledOnce()
  })

  it('cancelado pela pessoa não é erro e não baixa', async () => {
    const baixar = vi.fn()
    const nav: NavegadorShare = { canShare: () => true, share: async () => { throw new DOMException('cancelou', 'AbortError') } }
    expect(await enviarArquivo(blob, nome, { nav, baixar })).toEqual({ tipo: 'cancelado' })
    expect(baixar).not.toHaveBeenCalled()
  })

  it('navegador pediu um toque novo: devolve o arquivo pronto para tentar de novo', async () => {
    const nav: NavegadorShare = { canShare: () => true, share: async () => { throw new DOMException('sem gesto', 'NotAllowedError') } }
    const r = await enviarArquivo(blob, nome, { nav, baixar: vi.fn() })
    expect(r.tipo).toBe('precisa-toque')
    const ok: NavegadorShare = { canShare: () => true, share: async () => {} }
    if (r.tipo === 'precisa-toque') expect((await compartilharArquivo(ok, r.arquivo)).tipo).toBe('compartilhado')
  })

  it('falha do sistema: mensagem clara e o arquivo para baixar', async () => {
    const nav: NavegadorShare = { canShare: () => true, share: async () => { throw new TypeError('falhou') } }
    const r = await enviarArquivo(blob, nome, { nav, baixar: vi.fn() })
    expect(r.tipo).toBe('erro')
    if (r.tipo === 'erro') {
      expect(r.mensagem).toMatch(/não conseguiu abrir o envio/)
      expect(r.arquivo.name).toBe(nome)
    }
  })

  it('canShare que lança é tratado como "não aceita"', () => {
    const nav: NavegadorShare = { share: async () => {}, canShare: () => { throw new Error('velho') } }
    expect(arquivoCompartilhavel(nav, versoesDoArquivo(blob, nome))).toBeNull()
  })
})

describe('armazenamento persistente', () => {
  it('sem a API', async () => {
    expect(await estadoArmazenamento(undefined)).toBe('sem-suporte')
    expect(await estadoArmazenamento({})).toBe('sem-suporte')
    expect(await pedirArmazenamentoPersistente({})).toBe('sem-suporte')
  })
  it('já protegido não pede de novo', async () => {
    const persist = vi.fn(async () => true)
    expect(await pedirArmazenamentoPersistente({ persisted: async () => true, persist })).toBe('protegido')
    expect(persist).not.toHaveBeenCalled()
  })
  it('pede e o navegador aceita ou recusa; falha não lança', async () => {
    expect(await pedirArmazenamentoPersistente({ persisted: async () => false, persist: async () => true })).toBe('protegido')
    expect(await pedirArmazenamentoPersistente({ persisted: async () => false, persist: async () => false })).toBe('nao-protegido')
    expect(await pedirArmazenamentoPersistente({ persisted: async () => false, persist: async () => { throw new Error('x') } })).toBe('nao-protegido')
    expect(await estadoArmazenamento({ persisted: async () => { throw new Error('x') } })).toBe('sem-suporte')
  })
})
