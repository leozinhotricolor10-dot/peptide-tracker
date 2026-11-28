// Desenhos do próprio app, em código (SVG), num tom só: a seringa de insulina com a marca da conta e a
// régua graduada das barras de saldo do frasco. Não sugerem nada: só mostram o número que veio da
// conta feita com o que a pessoa digitou (dominio/desenho.ts).
import { CAPACIDADE_SERINGA, marcasDaRegua, marcasDaSeringa, posicaoNaSeringa } from '../dominio/desenho.ts'
import { IcoAlerta } from './icones.tsx'

// Geometria (viewBox 320 × 76): agulha à esquerda, corpo de vidro, êmbolo à direita.
const X0 = 52 // marca 0 (ponta interna do corpo)
const X100 = 268 // marca 100
const L = X100 - X0
const TOPO = 14
const BASE = 46
const MARCAS = marcasDaSeringa()

/**
 * Seringa de 100 unidades com a marca na conta: o líquido vai da ponta até a marca, a tampa do êmbolo
 * para na marca e um traço azul mostra o número. Sem número válido, não desenha nada.
 */
export function SeringaDesenho({ unidades, ml }: { unidades?: number | null; ml?: number | null }) {
  const p = posicaoNaSeringa({ unidades, ml })
  if (!p) return null
  const x = X0 + L * p.fracao
  return (
    <figure data-seringa-desenho="" data-fracao={p.fracao.toFixed(4)} className="m-0 flex flex-col gap-2">
      <svg viewBox="0 0 320 76" className="h-auto w-full" role="img" aria-label={p.rotulo}>
        {/* agulha e canhão */}
        <line x1="4" y1="30" x2="34" y2="30" className="stroke-fraco" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M34 25h10l4 3v4l-4 3H34z" className="fill-sup2 stroke-borda" strokeWidth="1.5" strokeLinejoin="round" />
        {/* líquido (da ponta até a marca), num cinza do texto bem claro */}
        <rect x={X0 - 4} y={TOPO + 2} width={Math.max(0, x - X0 + 4)} height={BASE - TOPO - 4} className="fill-texto seringa-liquido" opacity="0.1" />
        {/* corpo de vidro */}
        <rect x={X0 - 4} y={TOPO} width={L + 8} height={BASE - TOPO} rx="4" className="fill-none stroke-borda" strokeWidth="1.5" />
        {/* aba de apoio dos dedos */}
        <line x1={X100 + 14} y1={TOPO - 8} x2={X100 + 14} y2={BASE + 8} className="stroke-borda" strokeWidth="3" strokeLinecap="round" />
        {/* escala: risco a cada 2 unidades, maior a cada 10, número a cada 20 */}
        {MARCAS.map((m) => {
          const mx = X0 + (L * m.u) / CAPACIDADE_SERINGA
          return <line key={m.u} x1={mx} y1={TOPO} x2={mx} y2={TOPO + (m.grande ? 10 : 5)} className="stroke-fraco" strokeWidth="1" />
        })}
        {MARCAS.filter((m) => m.numero).map((m) => (
          <text key={m.u} x={X0 + (L * m.u) / CAPACIDADE_SERINGA} y={BASE + 18} textAnchor="middle" fontSize="14" className="fill-fraco">
            {m.u}
          </text>
        ))}
        {/* êmbolo: tampa de borracha na marca, haste até o apoio do polegar */}
        <g className="seringa-embolo" style={{ transform: `translateX(${x - X0}px)` }}>
          <rect x={X0} y={TOPO + 2} width="6" height={BASE - TOPO - 4} rx="1.5" className="fill-suave" />
          <line x1={X0 + 6} y1="30" x2={312 - (x - X0)} y2="30" className="stroke-borda" strokeWidth="3" />
        </g>
        <line x1="314" y1={TOPO - 4} x2="314" y2={BASE + 4} className="stroke-borda" strokeWidth="3" strokeLinecap="round" />
        {/* a marca da conta: o único traço no azul do acento */}
        <line x1={x} y1={TOPO - 8} x2={x} y2={BASE + 2} className="stroke-acento" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {p.acima && (
        <figcaption className="flex items-start gap-2 text-sm font-medium text-aviso-texto">
          <IcoAlerta tam={16} className="mt-0.5 shrink-0 text-aviso" /> A conta passou da seringa de {CAPACIDADE_SERINGA} unidades. Confira os números.
        </figcaption>
      )}
    </figure>
  )
}

const REGUA = marcasDaRegua()

/**
 * Régua graduada (assinatura do app): risquinhos a cada 10% embaixo de uma barra de saldo, como a
 * escala da seringa; o do meio é maior. Decorativa (a barra tem o valor para leitor de tela).
 */
export function Regua() {
  return (
    <span aria-hidden="true" data-regua="" className="relative block h-2">
      {REGUA.map((f) => (
        <span key={f} className={`absolute top-0 w-px bg-borda ${Math.abs(f - 0.5) < 1e-9 ? 'h-2' : 'h-1'}`} style={{ left: `${f * 100}%` }} />
      ))}
    </span>
  )
}

/**
 * Desenho de linha das telas vazias: um frasco com rótulo e uma seringa deitada, num tom só
 * (secundário), traço de 1,5 px. Decorativo.
 */
export function DesenhoBancada() {
  return (
    <svg viewBox="0 0 160 88" width="160" height="88" aria-hidden="true" data-desenho-vazio="" className="ico text-fraco" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* frasco: tampa, gargalo, corpo com rótulo e nível do líquido */}
      <rect x="22" y="6" width="28" height="10" rx="2" />
      <path d="M26 16v6h20v-6" />
      <rect x="18" y="22" width="36" height="58" rx="6" />
      <rect x="24" y="40" width="24" height="20" rx="2" />
      <path d="M30 46h12M30 52h8" />
      <path d="M18 68h36" strokeDasharray="2 3" />
      {/* seringa deitada: agulha, corpo com escala, êmbolo */}
      <path d="M66 70h10" />
      <rect x="76" y="64" width="56" height="12" rx="2" />
      <path d="M84 64v4M92 64v6M100 64v4M108 64v6M116 64v4M124 64v6" />
      <path d="M132 70h14M146 64v12M136 61v18" />
    </svg>
  )
}
