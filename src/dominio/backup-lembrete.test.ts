import { describe, expect, it } from 'vitest'
import { adiarLembrete, ehIOSDe, lembreteBackup, resumoTexto, textoUltimoBackup, type SituacaoBackup } from './backup-lembrete.ts'

const base: SituacaoBackup = { hoje: '2026-11-21', registros: 0, temDados: true, dadosNovos: true, primeiroUso: '2026-11-21' }
// meio-dia local: o dia não muda com o fuso
const iso = (dia: string) => new Date(`${dia}T12:00:00`).toISOString()

describe('lembrete de backup', () => {
  it('nunca fez backup: sem dados não avisa', () => {
    expect(lembreteBackup({ ...base, temDados: false, registros: 0 })).toBeNull()
    expect(lembreteBackup({ ...base, temDados: false, primeiroUso: '2026-11-01' })).toBeNull()
  })

  it('nunca fez backup: avisa a partir do 3º registro de dose (mesmo no primeiro dia)', () => {
    expect(lembreteBackup({ ...base, registros: 1 })).toBeNull()
    expect(lembreteBackup({ ...base, registros: 2 })).toBeNull()
    expect(lembreteBackup({ ...base, registros: 3 })).toEqual({ tipo: 'primeiro' })
    expect(lembreteBackup({ ...base, registros: 10 })).toEqual({ tipo: 'primeiro' })
  })

  it('nunca fez backup: avisa depois de 1 dia de uso, mesmo com poucos registros', () => {
    expect(lembreteBackup({ ...base, registros: 0, primeiroUso: '2026-11-20' })).toEqual({ tipo: 'primeiro' })
    expect(lembreteBackup({ ...base, registros: 0, primeiroUso: undefined })).toBeNull()
  })

  it('já fez: avisa a cada 7 dias se houver dado novo', () => {
    expect(lembreteBackup({ ...base, ultimoBackup: iso('2026-11-15') })).toBeNull() // 6 dias
    expect(lembreteBackup({ ...base, ultimoBackup: iso('2026-11-14') })).toEqual({ tipo: 'atrasado', dias: 7 })
    expect(lembreteBackup({ ...base, ultimoBackup: iso('2026-11-01') })).toEqual({ tipo: 'atrasado', dias: 20 })
  })

  it('sem dado novo desde o último backup não avisa, nem depois de muito tempo', () => {
    expect(lembreteBackup({ ...base, ultimoBackup: iso('2026-08-01'), dadosNovos: false, registros: 50 })).toBeNull()
  })

  it('"Lembrar depois" adia 3 dias e volta a avisar no 3º dia', () => {
    const ate = adiarLembrete('2026-11-21')
    expect(ate).toBe('2026-11-24')
    const s = { ...base, registros: 5, adiadoAte: ate }
    expect(lembreteBackup({ ...s, hoje: '2026-11-22' })).toBeNull()
    expect(lembreteBackup({ ...s, hoje: '2026-11-23' })).toBeNull()
    expect(lembreteBackup({ ...s, hoje: '2026-11-24' })).toEqual({ tipo: 'primeiro' })
    // adiar também vale para o lembrete de 7 dias
    expect(lembreteBackup({ ...base, ultimoBackup: iso('2026-11-01'), adiadoAte: '2026-11-23' })).toBeNull()
  })
})

describe('data do último backup', () => {
  it('nunca fez', () => {
    expect(textoUltimoBackup(undefined, '2026-11-21')).toBe('Você ainda não fez nenhum backup')
    expect(textoUltimoBackup('lixo', '2026-11-21')).toBe('Você ainda não fez nenhum backup')
  })
  it('hoje, ontem e há N dias, com a data curta', () => {
    expect(textoUltimoBackup(iso('2026-11-21'), '2026-11-21')).toBe('Último backup: hoje (21/11)')
    expect(textoUltimoBackup(iso('2026-11-20'), '2026-11-21')).toBe('Último backup: ontem (20/11)')
    expect(textoUltimoBackup(iso('2026-11-03'), '2026-11-15')).toBe('Último backup: há 12 dias (03/11)')
  })
})

describe('detecção simples de iPhone', () => {
  it('iPhone, iPad e iPad que se diz Mac', () => {
    expect(ehIOSDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(ehIOSDe('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe(true)
    expect(ehIOSDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 5)).toBe(true)
  })
  it('Android, Mac de verdade e Windows não', () => {
    expect(ehIOSDe('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', 5)).toBe(false)
    expect(ehIOSDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0)).toBe(false)
    expect(ehIOSDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0')).toBe(false)
  })
})

describe('resumo dos dados', () => {
  it('muda quando o texto muda e é igual para o mesmo texto', () => {
    expect(resumoTexto('abc')).toBe(resumoTexto('abc'))
    expect(resumoTexto('abc')).not.toBe(resumoTexto('abd'))
    expect(resumoTexto('')).toBe(resumoTexto(''))
  })
})
