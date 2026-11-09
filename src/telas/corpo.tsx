// T30 Peso e medidas (+E40), M41 medição, T41 detalhe da medida, T42 fotos, M42 nova foto, T43 comparar.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { repo, useBase, useFotos, type Base } from '../dados/index.ts'
import { dataBr, dataMedia, difDias, hojeStr, somaDias } from '../dominio/datas.ts'
import { erroNumero, fmtNum, lerNumero, numeroAmbiguo } from '../dominio/calculos.ts'
import { nomeProtocolo } from '../dominio/nomes.ts'
import type { Angulo, Foto, Medicao } from '../dominio/tipos.ts'
import { Cabecalho, Carregando, Chips, Dialogo, NaoAchou, Nota, Tela, Vazio } from '../ui/base.tsx'
import { useVoltar } from '../ui/navegar.ts'
import { Grafico } from '../ui/Grafico.tsx'
import { IcoCamera, IcoImagem, IcoMais, IcoPeso, IcoSeta, IcoLixo } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'
import { BotaoAcao } from '../ui/acao.tsx'
import { mensagemDeErro } from '../dados/repo.ts'
import { comprimirImagem } from '../sistema/imagem.ts'

type Campo = 'peso' | 'cintura' | 'quadril' | 'braco' | 'coxa'
const CAMPOS: { c: Campo; t: string; u: string }[] = [
  { c: 'peso', t: 'Peso', u: 'kg' },
  { c: 'cintura', t: 'Cintura', u: 'cm' },
  { c: 'quadril', t: 'Quadril', u: 'cm' },
  { c: 'braco', t: 'Braço', u: 'cm' },
  { c: 'coxa', t: 'Coxa', u: 'cm' },
]
const ANGULOS: { v: Angulo; t: string }[] = [
  { v: 'frente', t: 'Frente' },
  { v: 'lado', t: 'Lado' },
  { v: 'costas', t: 'Costas' },
]

function valorDe(m: Medicao, c: Campo): number | undefined {
  return c === 'peso' ? m.pesoKg : m.medidas[c]
}

function serie(meds: Medicao[], c: Campo) {
  return meds.filter((m) => valorDe(m, c) !== undefined).map((m) => ({ dia: m.data, valor: valorDe(m, c)!, id: m.id })).sort((a, b) => a.dia.localeCompare(b.dia))
}

/** Variação entre o último valor e o valor mais próximo de N dias antes. */
function variacao(s: { dia: string; valor: number }[], dias = 30): number | null {
  if (s.length < 2) return null
  const ult = s[s.length - 1]
  const limite = somaDias(ult.dia, -dias)
  const ref = s.find((p) => p.dia >= limite) ?? s[0]
  if (ref === ult) return null
  return ult.valor - ref.valor
}

function fmtVar(v: number | null, u: string): string {
  if (v === null) return ''
  const s = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${s}${fmtNum(Math.abs(v), 1)} ${u}`
}

function marcos(base: Base) {
  return base.protocolos.map((p) => ({ dia: p.inicio, rotulo: `Início ${nomeProtocolo(p, base.itens, base.subs)}` }))
}

export function Peso() {
  const base = useBase()
  const fotos = useFotos()
  const [periodo, setPeriodo] = useState<7 | 30 | 90>(30)
  const cab = (
    <div className="flex items-center justify-between">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Peso e medidas</h1>
      <Link to="/peso/medicao/nova" aria-label="Adicionar registro" className="icone-btn bg-acento text-sobre-acento"><IcoMais /></Link>
    </div>
  )
  if (!base || !fotos) return <Tela>{cab}<Carregando /></Tela>
  if (!base.medicoes.length && !fotos.length) {
    return (
      <Tela>
        <h1 className="text-[32px] font-extrabold">Peso e medidas</h1>
        <Vazio icone={<IcoPeso tam={30} />} titulo="Comece pelo peso de hoje" texto="Só o peso já basta. Medidas e fotos são opcionais e dá para incluir quando quiser.">
          <Link to="/peso/medicao/nova" className="btn-primario">Registrar peso</Link>
          <Link to="/peso/fotos" className="btn-texto">Fotos de progresso</Link>
        </Vazio>
      </Tela>
    )
  }
  const sPeso = serie(base.medicoes, 'peso')
  const hoje = hojeStr()
  const noPeriodo = sPeso.filter((p) => p.dia >= somaDias(hoje, -periodo))
  const atual = sPeso[sPeso.length - 1]
  return (
    <Tela>
      {cab}
      <div className="card flex flex-col gap-3 p-4">
        <Link to="/peso/medida/peso" className="flex items-end justify-between">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold tracking-wide text-fraco uppercase">Peso atual</span>
            <span className="text-[34px] leading-none font-extrabold">{atual ? <>{fmtNum(atual.valor, 1)} <span className="text-lg text-fraco">kg</span></> : '—'}</span>
          </span>
          {variacao(sPeso) !== null && <span className="rounded-full bg-selecionado px-3 py-1 text-sm font-bold text-acento">{fmtVar(variacao(sPeso), 'kg')} em 30 dias</span>}
        </Link>
        <Grafico pontos={noPeriodo} marcos={marcos(base)} unidade="kg" descricao={`Peso nos últimos ${periodo} dias`} />
        <div role="tablist" aria-label="Período" className="grid grid-cols-3 gap-1 rounded-xl bg-fundo p-1">
          {([7, 30, 90] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={periodo === p} onClick={() => setPeriodo(p)} className={`h-11 rounded-[10px] text-sm font-bold ${periodo === p ? 'bg-selecionado text-acento' : 'text-fraco'}`}>{p} dias</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {CAMPOS.slice(1).map(({ c, t, u }) => {
          const s = serie(base.medicoes, c)
          const v = s[s.length - 1]
          return (
            <Link key={c} to={`/peso/medida/${c}`} className="card flex min-h-[84px] flex-col gap-1 p-3.5">
              <span className="text-[13px] font-bold text-fraco">{t}</span>
              <span className="text-xl font-extrabold">{v ? `${fmtNum(v.valor, 1)} ${u}` : '—'}</span>
              <span className="text-xs font-semibold text-suave">{v ? fmtVar(variacao(s), u) || 'Só 1 registro' : 'Sem registro'}</span>
            </Link>
          )
        })}
      </div>
      <Link to="/peso/fotos" className="card flex min-h-[60px] items-center justify-between px-4">
        <span className="flex items-center gap-3 text-base font-bold"><IcoImagem className="text-acento" /> Fotos de progresso</span>
        <span className="flex items-center gap-1 text-sm text-fraco">{fotos.length} <IcoSeta tam={18} /></span>
      </Link>
      {fotos.length >= 2 && <Link to="/peso/fotos/comparar" className="link">Comparar duas datas</Link>}
    </Tela>
  )
}

export function NovaMedicao() {
  const { id } = useParams()
  const base = useBase()
  const voltarOu = useVoltar()
  const toast = useToast()
  const existente = id ? base?.medicoes.find((m) => m.id === id) : undefined
  const [data, setData] = useState(hojeStr())
  const [vals, setVals] = useState<Record<Campo, string>>({ peso: '', cintura: '', quadril: '', braco: '', coxa: '' })
  const [nota, setNota] = useState('')
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const salvando = useRef(false)
  const [pronto, setPronto] = useState(!id)
  useEffect(() => {
    if (existente && !pronto) {
      setData(existente.data)
      const v = (n?: number) => (n === undefined ? '' : fmtNum(n, 2))
      setVals({ peso: v(existente.pesoKg), cintura: v(existente.medidas.cintura), quadril: v(existente.medidas.quadril), braco: v(existente.medidas.braco), coxa: v(existente.medidas.coxa) })
      setNota(existente.nota ?? '')
      setPronto(true)
    }
  }, [existente, pronto])
  if (base && id && !existente) return <NaoAchou titulo="Medição não encontrada" para="/peso" rotulo="Ir para Peso" />
  if (!base || !pronto) return <Tela><Carregando /></Tela>

  const num = (c: Campo) => (vals[c].trim() ? lerNumero(vals[c]) : undefined)
  const salvar = async (forcar = false) => {
    const n: Partial<Record<Campo, number | null | undefined>> = {}
    for (const { c } of CAMPOS) n[c] = num(c)
    if (Object.values(n).some((v) => v === null || (typeof v === 'number' && v <= 0))) {
      const ambiguo = CAMPOS.find(({ c }) => numeroAmbiguo(vals[c]))
      return setErro(ambiguo ? erroNumero(vals[ambiguo.c], '') : 'Confira os números: use só números maiores que zero.')
    }
    if (n.peso === undefined && !CAMPOS.slice(1).some(({ c }) => n[c] !== undefined)) return setErro('Informe pelo menos o peso ou uma medida.')
    if (!data) return setErro('Informe a data.')
    if (data > hojeStr()) return setErro('A data não pode ser no futuro.')
    const anterior = serie(base.medicoes.filter((m) => m.id !== id), 'peso').filter((p) => p.dia <= data).pop()
    if (!forcar && n.peso && anterior && Math.abs(n.peso - anterior.valor) / anterior.valor > 0.1) {
      return setConfirmar(`O peso informado (${fmtNum(n.peso, 1)} kg) é bem diferente do último (${fmtNum(anterior.valor, 1)} kg em ${dataBr(anterior.dia)}). Está certo?`)
    }
    if (salvando.current) return
    salvando.current = true
    try {
      await repo.salvarMedicao({
      id: existente?.id,
      data,
      pesoKg: n.peso ?? undefined,
      medidas: { cintura: n.cintura ?? undefined, quadril: n.quadril ?? undefined, braco: n.braco ?? undefined, coxa: n.coxa ?? undefined },
      nota: nota.trim() || undefined,
      })
    } catch (e) {
      salvando.current = false
      return setErro(mensagemDeErro(e))
    }
    toast({ titulo: existente ? 'Medição atualizada' : 'Medição salva', texto: dataBr(data) })
    voltarOu('/peso')
  }

  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo={existente ? 'Editar medição' : 'Nova medição'} fechar={() => voltarOu('/peso')} />
      <div className="grid grid-cols-2 gap-2.5">
        <label className="rotulo">Data<input type="date" className="campo px-2" value={data} max={hojeStr()} onChange={(e) => setData(e.target.value)} /></label>
        <label className="rotulo">Peso (kg)<input className="campo" inputMode="decimal" autoFocus={!existente} placeholder="Ex.: 84,2" value={vals.peso} onChange={(e) => { setVals({ ...vals, peso: e.target.value }); setErro('') }} /></label>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-bold text-fraco">Medidas em cm (opcional)</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {CAMPOS.slice(1).map(({ c, t }) => (
            <label key={c} className="rotulo">{t}<input className="campo" inputMode="decimal" value={vals[c]} onChange={(e) => { setVals({ ...vals, [c]: e.target.value }); setErro('') }} /></label>
          ))}
        </div>
      </fieldset>
      <label className="rotulo">Nota (opcional)<textarea rows={2} className="campo h-auto py-2.5 font-medium" value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      <div className="mt-auto flex flex-col gap-2">
        <button type="button" className="btn-primario" onClick={() => salvar()}>Salvar medição</button>
        {existente && (
          <BotaoAcao
            className="btn-texto text-erro"
            ocupadoTexto="Apagando…"
            acao={async () => {
              const m = await repo.apagarMedicao(existente.id)
              toast({ tipo: 'info', titulo: 'Medição apagada', desfazer: m ? () => repo.restaurarMedicao(m) : undefined })
              voltarOu('/peso')
            }}
          >
            Apagar medição
          </BotaoAcao>
        )}
      </div>
      {confirmar && (
        <Dialogo titulo="Confira o valor" aoFechar={() => setConfirmar(null)}>
          <p className="m-0 text-[15px] text-suave">{confirmar}</p>
          <button type="button" className="btn-primario" onClick={() => { setConfirmar(null); void salvar(true) }}>Sim, salvar</button>
          <button type="button" className="btn-texto" onClick={() => setConfirmar(null)}>Corrigir</button>
        </Dialogo>
      )}
    </Tela>
  )
}

export function DetalheMedida() {
  const { campo } = useParams()
  const base = useBase()
  const info = CAMPOS.find((x) => x.c === campo)
  if (!base) return <Tela><Carregando /></Tela>
  if (!info) return <NaoAchou titulo="Medida não encontrada" texto="Este endereço não existe no app." para="/peso" rotulo="Ir para Peso" />
  const s = serie(base.medicoes, info.c)
  const v = variacao(s)
  const atual = s[s.length - 1]
  return (
    <Tela>
      <Cabecalho titulo={info.t} voltar />
      <div className="flex items-baseline gap-3">
        <span className="text-[34px] font-extrabold">{atual ? `${fmtNum(atual.valor, 1)} ${info.u}` : '—'}</span>
        {v !== null && <span className="text-sm font-bold text-suave">{fmtVar(v, info.u)} em 30 dias</span>}
      </div>
      <div className="card p-3">
        <Grafico pontos={s} marcos={marcos(base)} unidade={info.u} descricao={`${info.t} ao longo do tempo`} />
      </div>
      {s.length === 1 && <Nota>Só 1 registro até agora. Com mais medições, a linha aparece.</Nota>}
      <p className="m-0 text-[13px] leading-relaxed text-fraco">A linha tracejada marca quando um protocolo começou. O app não afirma que uma coisa causou a outra.</p>
      {s.length === 0 && <Vazio titulo="Sem registros" texto={`Ainda não há ${info.t.toLowerCase()} registrado.`}><Link className="btn-primario" to="/peso/medicao/nova">Registrar</Link></Vazio>}
      <div className="card flex flex-col">
        {[...s].reverse().map((p) => (
          <Link key={p.id} to={`/peso/medicao/${p.id}`} className="flex min-h-[52px] items-center justify-between border-t border-sup2 px-4 first:border-t-0">
            <span className="text-[15px] text-suave">{dataBr(p.dia)}</span>
            <span className="flex items-center gap-2 text-base font-bold">{fmtNum(p.valor, 1)} {info.u} <IcoSeta tam={16} className="text-fraco" /></span>
          </Link>
        ))}
      </div>
    </Tela>
  )
}

export function useUrlObjeto(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

function Miniatura({ foto, aoAbrir }: { foto: Foto; aoAbrir: () => void }) {
  const url = useUrlObjeto(foto.blob)
  const rot = ANGULOS.find((a) => a.v === foto.angulo)?.t
  return (
    <button type="button" onClick={aoAbrir} aria-label={`Foto ${rot}, ${dataMedia(foto.data)}`} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-linha bg-sup2">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <span className="absolute inset-x-0 bottom-0 bg-veu/80 py-1 text-center text-xs font-bold">{rot}</span>
    </button>
  )
}

function VerFoto({ foto, aoFechar }: { foto: Foto; aoFechar: () => void }) {
  const url = useUrlObjeto(foto.blob)
  const toast = useToast()
  return (
    <Dialogo titulo={`${ANGULOS.find((a) => a.v === foto.angulo)?.t} · ${dataBr(foto.data)}`} aoFechar={aoFechar}>
      {url && <img src={url} alt={`Foto de ${dataBr(foto.data)}`} className="max-h-[55dvh] w-full rounded-xl object-contain" />}
      <BotaoAcao
        className="btn-neutro text-erro"
        ocupadoTexto="Apagando…"
        acao={async () => {
          await repo.apagarFoto(foto.id)
          aoFechar()
          toast({ tipo: 'info', titulo: 'Foto apagada', desfazer: () => repo.adicionarFoto({ data: foto.data, angulo: foto.angulo, blob: foto.blob, tipo: foto.tipo }).then(() => undefined) })
        }}
      >
        <IcoLixo tam={20} /> Apagar foto
      </BotaoAcao>
      <button type="button" className="btn-texto" onClick={aoFechar}>Fechar</button>
    </Dialogo>
  )
}

export function Fotos() {
  const fotos = useFotos()
  const [filtro, setFiltro] = useState<Angulo | 'todas'>('todas')
  const [aberta, setAberta] = useState<Foto | null>(null)
  if (!fotos) return <Tela><Carregando /></Tela>
  const lista = fotos.filter((f) => filtro === 'todas' || f.angulo === filtro)
  const grupos = new Map<string, Foto[]>()
  for (const f of [...lista].sort((a, b) => b.data.localeCompare(a.data))) grupos.set(f.data, [...(grupos.get(f.data) ?? []), f])
  return (
    <Tela>
      <Cabecalho titulo="Fotos de progresso" voltar direita={<Link to="/peso/fotos/nova" aria-label="Adicionar foto" className="icone-btn bg-acento text-sobre-acento"><IcoMais /></Link>} />
      <Nota>Ficam só neste aparelho. O backup inclui as fotos.</Nota>
      <Chips rotulo="Ângulo" opcoes={[{ v: 'todas' as const, t: 'Todas' }, ...ANGULOS]} valor={filtro} aoMudar={setFiltro} />
      {fotos.length === 0 && (
        <Vazio icone={<IcoCamera tam={30} />} titulo="Nenhuma foto ainda" texto="Fotos de frente, lado e costas ajudam a comparar com o tempo. Ficam só aqui.">
          <Link to="/peso/fotos/nova" className="btn-primario">Adicionar foto</Link>
        </Vazio>
      )}
      {[...grupos.entries()].map(([dia, fs]) => (
        <section key={dia} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-fraco">{dataMedia(dia)}</h2>
          <div className="grid grid-cols-3 gap-2">
            {fs.map((f) => <Miniatura key={f.id} foto={f} aoAbrir={() => setAberta(f)} />)}
          </div>
        </section>
      ))}
      {fotos.length >= 2 && <Link to="/peso/fotos/comparar" className="btn-secundario">Comparar duas datas</Link>}
      {aberta && <VerFoto foto={aberta} aoFechar={() => setAberta(null)} />}
    </Tela>
  )
}

export function NovaFoto() {
  const voltarOu = useVoltar()
  const toast = useToast()
  const [angulo, setAngulo] = useState<Angulo>('frente')
  const [data, setData] = useState(hojeStr())
  const [estado, setEstado] = useState<'pronto' | 'comprimindo' | 'erro' | 'erro-data' | 'erro-salvar'>('pronto')
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const escolher = async (input: HTMLInputElement) => {
    const arq = input.files?.[0]
    input.value = '' // permite escolher o mesmo arquivo de novo depois de um erro
    if (!arq) return
    if (!data || data > hojeStr()) return setEstado('erro-data')
    setEstado('comprimindo')
    let blob: Blob
    try {
      blob = await comprimirImagem(arq)
    } catch {
      return setEstado('erro')
    }
    try {
      await repo.adicionarFoto({ data, angulo, blob, tipo: blob.type || 'image/jpeg' })
    } catch {
      return setEstado('erro-salvar')
    }
    toast({ titulo: 'Foto salva', texto: `${ANGULOS.find((a) => a.v === angulo)?.t} · ${dataBr(data)}` })
    voltarOu('/peso/fotos')
  }
  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo="Nova foto" fechar={() => voltarOu('/peso/fotos')} />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-bold text-fraco">Ângulo</legend>
        <Chips rotulo="Ângulo" opcoes={ANGULOS} valor={angulo} aoMudar={setAngulo} />
      </fieldset>
      <label className="rotulo">Data<input type="date" className="campo" value={data} max={hojeStr()} onChange={(e) => setData(e.target.value)} /></label>
      <Nota>Dica: mesma luz, mesma distância e mesma roupa deixam a comparação mais justa.</Nota>
      {estado === 'comprimindo' && <p role="status" className="m-0 text-center font-bold text-acento">Reduzindo e guardando a foto…</p>}
      {estado === 'erro' && <p role="alert" className="m-0 text-sm font-bold text-erro">Não deu para abrir esta imagem. Tente outra foto.</p>}
      {estado === 'erro-data' && <p role="alert" className="m-0 text-sm font-bold text-erro">Escolha uma data até hoje.</p>}
      {estado === 'erro-salvar' && <p role="alert" className="m-0 text-sm font-bold text-erro">Não deu para guardar a foto. Pode faltar espaço no aparelho.</p>}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => escolher(e.currentTarget)} />
      <input ref={galeria} type="file" accept="image/*" hidden data-testid="galeria" onChange={(e) => escolher(e.currentTarget)} />
      <div className="mt-auto grid grid-cols-2 gap-2.5">
        <button type="button" className="btn-primario" disabled={estado === 'comprimindo'} onClick={() => camera.current?.click()}><IcoCamera tam={20} /> Câmera</button>
        <button type="button" className="btn-secundario" disabled={estado === 'comprimindo'} onClick={() => galeria.current?.click()}><IcoImagem tam={20} /> Galeria</button>
      </div>
      <p className="m-0 text-center text-[13px] text-fraco">A foto é reduzida e guardada só aqui. Não vai para a galeria do celular.</p>
    </Tela>
  )
}

function ImagemComparar({ foto, peso }: { foto?: Foto; peso?: number }) {
  const url = useUrlObjeto(foto?.blob)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-linha bg-sup2">
        {url ? <img src={url} alt={foto ? `Foto de ${dataBr(foto.data)}` : ''} className="h-full w-full object-cover" /> : <span className="px-2 text-center text-xs text-fraco">Sem foto deste ângulo</span>}
      </div>
      {foto && <span className="text-center text-[13px] font-bold">{dataBr(foto.data)}{peso !== undefined ? ` · ${fmtNum(peso, 1)} kg` : ''}</span>}
    </div>
  )
}

export function CompararFotos() {
  const fotos = useFotos()
  const base = useBase()
  const [angulo, setAngulo] = useState<Angulo>('frente')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  if (!fotos || !base) return <Tela><Carregando /></Tela>
  const doAngulo = fotos.filter((f) => f.angulo === angulo).sort((x, y) => x.data.localeCompare(y.data))
  const datas = [...new Set(doAngulo.map((f) => f.data))]
  const da = a && datas.includes(a) ? a : datas[0]
  const db = b && datas.includes(b) ? b : datas[datas.length - 1]
  const pesoEm = (dia: string) => {
    const s = serie(base.medicoes, 'peso')
    let melhor: { dia: string; valor: number } | undefined
    for (const p of s) if (!melhor || Math.abs(difDias(p.dia, dia)) < Math.abs(difDias(melhor.dia, dia))) melhor = p
    return melhor && Math.abs(difDias(melhor.dia, dia)) <= 3 ? melhor.valor : undefined
  }
  return (
    <Tela>
      <Cabecalho titulo={`Comparar · ${ANGULOS.find((x) => x.v === angulo)?.t}`} voltar />
      <Chips rotulo="Ângulo" opcoes={ANGULOS} valor={angulo} aoMudar={setAngulo} />
      {datas.length < 2 ? (
        <Nota tipo="aviso">Falta foto deste ângulo: são precisas fotos em 2 datas diferentes para comparar.</Nota>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        <ImagemComparar foto={doAngulo.find((f) => f.data === da)} peso={da ? pesoEm(da) : undefined} />
        <ImagemComparar foto={datas.length > 1 ? [...doAngulo].reverse().find((f) => f.data === db) : undefined} peso={db ? pesoEm(db) : undefined} />
      </div>
      {datas.length >= 2 && (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="rotulo">Antes<select className="campo text-sm" value={da} onChange={(e) => setA(e.target.value)}>{datas.map((d) => <option key={d} value={d}>{dataBr(d)}</option>)}</select></label>
          <label className="rotulo">Depois<select className="campo text-sm" value={db} onChange={(e) => setB(e.target.value)}>{datas.map((d) => <option key={d} value={d}>{dataBr(d)}</option>)}</select></label>
        </div>
      )}
    </Tela>
  )
}
