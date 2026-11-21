/// <reference types="node" />
// Tom descritivo: nenhum texto de tela pode soar como instrução de dose ("Puxe", "Aplique",
// "Tome"...). Lê o código das telas, pega só os textos (strings e texto entre tags, sem
// comentários nem nomes de variáveis) e procura os verbos proibidos. As exceções são frases que
// não falam de dose e estão listadas uma a uma abaixo.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '.')

/** Formas proibidas (palavra inteira, sem diferenciar maiúsculas). */
const PROIBIDOS = ['puxe', 'puxar', 'puxa', 'aplique', 'aplicar', 'injete', 'injetar', 'tome', 'tomar', 'use', 'usar', 'recomendamos', 'recomendado', 'recomendada', 'ideal', 'deve', 'deveria']

/**
 * Frases permitidas: ações do próprio app ou textos sem relação com dose.
 * Cada uma é tirada do texto antes da busca; tudo que sobrar não pode ter verbo proibido.
 */
export const EXCECOES = [
  'Usar até', // nome do campo de data do frasco (o que a pessoa anotou do rótulo)
  'usar até', // idem, no meio da frase
  'Salvar e usar', // botão do cadastro: salvar a substância e seguir com ela
  'Salvar blend e usar', // idem para blend
  'Voltar a usar este frasco', // reativar um frasco marcado como acabado
  'Usar mesmo assim e salvar', // frasco vencido: a pessoa decide manter o frasco no registro
  'Usar a agenda do celular', // canal de lembrete (agenda), não dose
  'use também a agenda do celular', // idem
  'Use o menu do navegador', // instalar o app
  'Use vírgula para decimais', // formato de número
  'use um backup sem fotos', // espaço cheio ao restaurar
  'O que você vai usar?', // pergunta do passo da substância (o que a pessoa já decidiu)
  'o que você decide usar', // aviso legal: o app só registra
  'o que você já decidiu usar', // idem
]

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return arquivos(p)
    return /\.(tsx?|mjs)$/.test(n) && !/\.test\.ts$/.test(n) && n !== 'sw.ts' ? [p] : []
  })
}

/** Tira comentários (de bloco e de linha), sem confundir com "https://". */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Textos de tela: strings ('', "", ``) e texto entre tags/chaves do JSX. */
export function textosDoCodigo(codigo: string): string[] {
  const c = semComentarios(codigo)
  const out: string[] = []
  for (const m of c.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const bruto = m[1] ?? m[2] ?? m[3] ?? ''
    const t = bruto.replace(/\$\{[^}]*\}/g, ' ')
    // caminhos, classes CSS, nomes de chaves e imports não são texto de tela
    if (/^[\w./?=&:#-]*$/.test(bruto.replace(/\$\{[^}]*\}/g, ''))) continue
    if (/[?&]\w+=/.test(t)) continue // endereço com parâmetros (ex.: "/novo/blend?usar=1")
    if (/^[\w\s:/[\]().%-]+$/.test(t) && /\b(flex|text-|px-|py-|gap-|rounded|bg-|border|min-h|items-)/.test(t)) continue
    out.push(t)
  }
  for (const m of c.matchAll(/[>}]([^<>{}`'"]+)[<{]/g)) {
    const t = m[1]
    // só trechos que parecem frase (letras e espaço), não código entre chaves
    if (!/[A-Za-zÀ-ú]{3}/.test(t) || /=>|===|!==|&&|\|\||\b(const|let|return|await|if|else|function|import|export|case|new)\b|\w\(|;\s*$|^\s*\)/.test(t)) continue
    out.push(t)
  }
  return out
}

export function verbosProibidos(texto: string): string[] {
  let t = texto
  for (const e of EXCECOES) t = t.split(e).join(' ')
  const achados: string[] = []
  for (const v of PROIBIDOS) {
    if (new RegExp(`(^|[^\\p{L}])${v}($|[^\\p{L}])`, 'iu').test(t)) achados.push(v)
  }
  return achados
}

describe('tom descritivo nos textos de tela', () => {
  it('o extrator pega strings e texto de JSX, e ignora comentários', () => {
    const t = textosDoCodigo(`// puxe isto\n/* aplique */ const a = 'Puxe na seringa'\nconst b = <b>Tome {x} agora</b>`)
    expect(t.some((x) => x.includes('Puxe na seringa'))).toBe(true)
    expect(t.some((x) => x.includes('Tome'))).toBe(true)
    expect(t.join('|')).not.toMatch(/puxe isto|aplique/)
  })

  it('acha o verbo proibido e respeita as exceções', () => {
    expect(verbosProibidos('Puxe na seringa para 250 mcg')).toEqual(['puxe'])
    expect(verbosProibidos('A dose ideal é 10 unidades')).toEqual(['ideal'])
    expect(verbosProibidos('O app não diz se você deve aplicar')).toEqual(['aplicar', 'deve'])
    expect(verbosProibidos('250 mcg equivalem a 10 unidades na seringa (0,1 mL)')).toEqual([])
    expect(verbosProibidos('Usar até (você informa)')).toEqual([])
    // "aplicação" e "usuário" não são os verbos
    expect(verbosProibidos('Registrar aplicação do usuário')).toEqual([])
  })

  it('nenhum texto de tela em src/ tem verbo prescritivo fora da lista de exceções', () => {
    const problemas: string[] = []
    const vistos: string[] = []
    for (const arq of arquivos(RAIZ)) {
      for (const t of textosDoCodigo(readFileSync(arq, 'utf8'))) {
        vistos.push(t)
        const v = verbosProibidos(t)
        if (v.length) problemas.push(`${arq.slice(RAIZ.length + 1)}: "${t.trim().slice(0, 90)}" (${v.join(', ')})`)
      }
    }
    expect(problemas).toEqual([])
    // a varredura de fato lê as telas (string, texto entre tags e texto ao lado de {valor})
    expect(vistos.length).toBeGreaterThan(400)
    for (const f of ['O app não decide nada por você', 'Fiz agora', ' unidades', 'Enviar backup para mim', 'Ele não indica dose']) {
      expect(vistos.some((t) => t.includes(f)), f).toBe(true)
    }
  })

  it('cada exceção ainda existe no código (lista sem lixo)', () => {
    const tudo = arquivos(RAIZ).map((a) => readFileSync(a, 'utf8')).join('\n')
    for (const e of EXCECOES) expect(tudo.includes(e), e).toBe(true)
  })
})
