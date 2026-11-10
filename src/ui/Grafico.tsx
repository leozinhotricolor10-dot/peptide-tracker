// Gráfico de linha em SVG (sem biblioteca). Marca início de protocolo com linha tracejada.
import { useId } from 'react'
import { dataEixo, difDias } from '../dominio/datas.ts'
import { fmtNum } from '../dominio/calculos.ts'

export interface Ponto {
  dia: string
  valor: number
}

export function Grafico({ pontos, marcos = [], unidade, altura = 170, descricao }: { pontos: Ponto[]; marcos?: { dia: string; rotulo: string }[]; unidade: string; altura?: number; descricao: string }) {
  const id = useId()
  const W = 340
  const H = altura
  const m = { e: 34, d: 10, t: 14, b: 24 }
  if (pontos.length === 0) return <p className="m-0 py-8 text-center text-sm text-fraco">Sem registros no período.</p>
  const ordenados = [...pontos].sort((a, b) => a.dia.localeCompare(b.dia))
  const d0 = ordenados[0].dia
  const d1 = ordenados[ordenados.length - 1].dia
  const span = Math.max(1, difDias(d0, d1))
  const vals = ordenados.map((p) => p.valor)
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (max - min < 1) {
    min -= 0.5
    max += 0.5
  }
  const x = (dia: string) => (ordenados.length === 1 ? (m.e + W - m.d) / 2 : m.e + (difDias(d0, dia) / span) * (W - m.e - m.d))
  const y = (v: number) => m.t + (1 - (v - min) / (max - min)) * (H - m.t - m.b)
  const linha = ordenados.map((p) => `${x(p.dia).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  // um marco por dia (vários protocolos no mesmo dia viram "Início de N protocolos")
  const porDia = new Map<string, string[]>()
  for (const k of marcos) if (k.dia >= d0 && k.dia <= d1) porDia.set(k.dia, [...(porDia.get(k.dia) ?? []), k.rotulo])
  const marcosVis = [...porDia.entries()].map(([dia, rs]) => ({ dia, rotulo: rs.length > 1 ? `Início de ${rs.length} protocolos` : rs[0] }))
  const meio = ordenados[Math.floor(ordenados.length / 2)].dia
  const eixo = [...new Set([d0, meio, d1])]
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={id}>
        <title id={id}>{descricao}</title>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={m.e} x2={W - m.d} y1={y(v)} y2={y(v)} stroke="#17323B" strokeWidth="1" />
            <text x={m.e - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#A9BFCB">{fmtNum(v, 1)}</text>
          </g>
        ))}
        {marcosVis.map((k) => (
          <g key={k.dia + k.rotulo}>
            <line x1={x(k.dia)} x2={x(k.dia)} y1={m.t - 4} y2={H - m.b} stroke="#FFC46B" strokeWidth="1.5" strokeDasharray="4 4" />
            <text
              x={x(k.dia) > W / 2 ? x(k.dia) - 4 : x(k.dia) + 4}
              textAnchor={x(k.dia) > W / 2 ? 'end' : 'start'}
              y={m.t + 6}
              fontSize="10"
              fontWeight="700"
              fill="#FFC46B"
            >
              {k.rotulo.length > 26 ? k.rotulo.slice(0, 25) + '…' : k.rotulo}
            </text>
          </g>
        ))}
        <polyline key={linha} points={linha} pathLength={1} className="grafico-linha" fill="none" stroke="#00E5C3" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {ordenados.map((p) => <circle key={p.dia + p.valor + linha} className="grafico-ponto" cx={x(p.dia)} cy={y(p.valor)} r="3.5" fill="#00E5C3" />)}
        {ordenados.length > 1 && eixo.map((d) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor={d === d0 ? 'start' : d === d1 ? 'end' : 'middle'} fontSize="10" fill="#A9BFCB">{dataEixo(d)}</text>
        ))}
      </svg>
      <figcaption className="sr-only">Valores em {unidade}</figcaption>
    </figure>
  )
}
