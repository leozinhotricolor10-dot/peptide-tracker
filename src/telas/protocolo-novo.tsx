// Novo/editar protocolo: T21 substância (+E21), M25 criar substância, T26 editor de blend,
// T22 dose, T23 frequência, T24 duração e revisão, M24 salvar alteração, M26 sair sem salvar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { repo, useBase } from '../dados/index.ts'
import { AMOSTRA_IDS, buscar, existeNomeExato, type ResultadoBusca } from '../dominio/sugestoes.ts'
import { descreverFrequencia } from '../dominio/agenda.ts'
import { dataCurta, SEMANA_CURTA } from '../dominio/datas.ts'
import { erroNumero, fmtDose, lerNumero, somaComponentesMg, fmtNum } from '../dominio/calculos.ts'
import type { Componente, UnidadeDose } from '../dominio/tipos.ts'
import { MAX_NOME_PROTOCOLO, nomeProtocolo } from '../dominio/nomes.ts'
import { Carregando, Chips, Dialogo, NaoAchou, Nota, Tela } from '../ui/base.tsx'
import { IcoBusca, IcoFechar, IcoMais, IcoVoltar, IcoX } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'
import { UNIDADES } from './dose.tsx'
import {
  fimDe,
  frequenciaDe,
  itemVazio,
  montarProtocolo,
  novoRascunho,
  rascunho,
  rascunhoDe,
  useRascunho,
  validarRascunho,
  type ItemRascunho,
  type Rascunho,
} from './rascunho.ts'

function Barra({ n }: { n: number }) {
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      {[1, 2, 3, 4].map((k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k <= n ? 'bg-acento' : 'bg-sup2'}`} />)}
    </div>
  )
}

function Etapa({ n, titulo, children, rodape, aoVoltar, fecharEmVezDeVoltar }: { n?: number; titulo: string; children: ReactNode; rodape: ReactNode; aoVoltar?: () => void; fecharEmVezDeVoltar?: boolean }) {
  const nav = useNavigate()
  return (
    <Tela className="min-h-dvh">
      <div className="flex items-center gap-2">
        <button type="button" className="icone-btn -ml-2.5" aria-label={fecharEmVezDeVoltar ? 'Cancelar' : 'Voltar'} onClick={aoVoltar ?? (() => nav(-1))}>
          {fecharEmVezDeVoltar ? <IcoFechar /> : <IcoVoltar />}
        </button>
        {n && <span className="text-[13px] font-bold tracking-wide text-acento uppercase">Passo {n} de 4</span>}
      </div>
      {n && <Barra n={n} />}
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{titulo}</h1>
      {children}
      <div className="mt-auto flex flex-col gap-2 pt-2">{rodape}</div>
    </Tela>
  )
}

/** /novo: começa um rascunho limpo. */
export function NovoProtocolo() {
  useEffect(() => {
    rascunho.iniciar(novoRascunho())
  }, [])
  return useRascunho()?.modo === 'novo' ? <Navigate to="/novo/substancia" replace /> : <Carregando />
}

/** /protocolos/:id/editar e /duplicar */
export function CarregarRascunho({ modo }: { modo: 'editar' | 'duplicar' }) {
  const { id } = useParams()
  const nav = useNavigate()
  const base = useBase()
  useEffect(() => {
    if (!base || !id) return
    const p = base.protocolos.find((x) => x.id === id)
    if (!p) return void nav('/protocolos', { replace: true })
    const itens = base.itens.filter((i) => i.protocoloId === id)
    const antes = itens.map((i) => `${base.subs.get(i.substanciaId)?.nome ?? ''} ${fmtDose(i.doseValor, i.doseUnidade)}, ${descreverFrequencia(i.frequencia, i.horarios)}`).join('; ')
    rascunho.iniciar(rascunhoDe(p, itens, modo, antes))
    nav('/novo/revisao', { replace: true })
  }, [base, id, modo, nav])
  return <Carregando />
}

function useRascunhoObrigatorio(): Rascunho | null {
  const r = useRascunho()
  const nav = useNavigate()
  // Só redireciona se a tela abriu sem rascunho (ex.: link direto). Se o rascunho foi limpo
  // depois de salvar/descartar, a própria ação já navegou.
  const [tinhaAoAbrir] = useState(() => r !== null)
  useEffect(() => {
    if (!r && !tinhaAoAbrir) nav('/novo', { replace: true })
  }, [r, nav, tinhaAoAbrir])
  return r
}

function itemAtual(r: Rascunho): ItemRascunho {
  return r.itens[r.atual] ?? r.itens[0]
}

// ---------------- T21 ----------------
export function PassoSubstancia() {
  const r = useRascunhoObrigatorio()
  const base = useBase()
  const nav = useNavigate()
  const [texto, setTexto] = useState('')
  const [sair, setSair] = useState(false)
  const resultados = useMemo(() => (base ? buscar(texto, base.substancias, undefined, 30) : []), [base, texto])
  if (!r || !base) return <Carregando />
  const atual = itemAtual(r)
  const escolhida = atual.substanciaId ? base.subs.get(atual.substanciaId) : undefined
  const q = texto.trim()

  const escolher = async (res: ResultadoBusca) => {
    if (res.origem === 'minha') {
      rascunho.mudarItem(() => ({ substanciaId: res.substancia.id }))
      return
    }
    const s = await repo.usarSugestao(res.sugestao)
    if (s.tipo === 'blend') nav(`/novo/blend?id=${s.id}&usar=1`)
    else rascunho.mudarItem(() => ({ substanciaId: s.id }))
  }

  const cancelar = () => {
    const tem = r.itens.some((i) => i.substanciaId || i.doseTxt || i.horarios.length) || r.nome
    if (r.atual > 0 || r.modo !== 'novo') {
      // adicionando outra linha: volta para a revisão sem a linha vazia
      if (!atual.substanciaId) rascunho.mudar((x) => ({ itens: x.itens.filter((_, k) => k !== x.atual), atual: 0 }))
      nav('/novo/revisao', { replace: true })
    } else if (tem) setSair(true)
    else {
      rascunho.limpar()
      nav(-1)
    }
  }

  return (
    <Etapa
      n={1}
      titulo="O que você vai usar?"
      aoVoltar={cancelar}
      fecharEmVezDeVoltar
      rodape={
        <button type="button" className="btn-primario" disabled={!escolhida} onClick={() => nav('/novo/dose')}>
          {escolhida ? `Continuar com ${escolhida.nome}` : 'Escolha ou crie uma substância'}
        </button>
      }
    >
      <label className="relative flex items-center">
        <span className="sr-only">Buscar ou digitar o nome</span>
        <IcoBusca tam={20} className="pointer-events-none absolute left-3.5 text-fraco" />
        <input
          type="search"
          autoComplete="off"
          placeholder="Buscar ou digitar o nome"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="campo h-[52px] pl-11 font-semibold"
        />
      </label>

      {q && resultados.length === 0 ? (
        <div className="flex flex-col gap-3 py-2">
          <b className="text-lg">Nada encontrado para “{q}”</b>
          <p className="m-0 text-[15px] text-suave">Sem problema: crie com esse nome. Ela fica salva só para você e aparece nas próximas buscas.</p>
          <button type="button" className="btn-primario" onClick={() => nav(`/novo/criar?nome=${encodeURIComponent(q)}`)}>Criar “{q}”</button>
          <button type="button" className="btn-secundario" onClick={() => nav(`/novo/blend?nome=${encodeURIComponent(q)}&usar=1`)}>É um blend: criar com componentes</button>
          <p className="m-0 text-[13px] text-fraco">Dica: confira a grafia, com ou sem hífen.</p>
        </div>
      ) : (
        <div role="listbox" aria-label="Substâncias" className="card flex flex-col overflow-hidden">
          {resultados.map((res) => {
            const id = res.origem === 'minha' ? res.substancia.id : res.sugestao.id
            const nome = res.origem === 'minha' ? res.substancia.nome : res.sugestao.nome
            const tipo = res.origem === 'minha' ? res.substancia.tipo : res.sugestao.tipo
            const sel = res.origem === 'minha' && res.substancia.id === atual.substanciaId
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => escolher(res)}
                className={`flex min-h-[52px] items-center justify-between gap-2.5 border-t border-sup2 px-4 text-left first:border-t-0 ${sel ? 'bg-selecionado text-acento' : ''}`}
              >
                <span className="text-base font-bold break-words">{nome}</span>
                <span className="flex shrink-0 gap-1.5">
                  {tipo === 'blend' && <span className="selo border border-borda text-suave">Blend</span>}
                  <span className={`selo ${res.origem === 'minha' ? 'bg-selecionado text-acento' : 'bg-sup2 text-fraco'}`}>{res.origem === 'minha' ? 'Sua' : 'Lista'}</span>
                </span>
              </button>
            )
          })}
          {q && !existeNomeExato(q, base.substancias) && (
            <button type="button" onClick={() => nav(`/novo/criar?nome=${encodeURIComponent(q)}`)} className="flex min-h-[52px] items-center gap-2.5 border-t border-sup2 px-4 text-left text-[15px] font-bold text-acento">
              <IcoMais tam={20} /> Não achei: criar “{q}”
            </button>
          )}
          {!q && (
            <button type="button" onClick={() => nav('/novo/criar')} className="flex min-h-[52px] items-center gap-2.5 border-t border-sup2 px-4 text-left text-[15px] font-bold text-acento">
              <IcoMais tam={20} /> Criar substância do zero
            </button>
          )}
          <button type="button" onClick={() => nav(`/novo/blend?usar=1${q ? `&nome=${encodeURIComponent(q)}` : ''}`)} className="flex min-h-[52px] items-center gap-2.5 border-t border-sup2 px-4 text-left text-[15px] font-bold text-acento">
            <IcoMais tam={20} /> Criar blend (vários em um frasco)
          </button>
        </div>
      )}
      <p className="m-0 text-[13px] leading-relaxed text-fraco">
        Sugestões, só nomes (sem doses nem composição). Não é limite: digite qualquer composto ou blend, mesmo que não esteja aqui. {!q && `Mostrando ${AMOSTRA_IDS.length} da lista; busque para ver mais.`}
      </p>
      {sair && (
        <Dialogo titulo="Sair sem salvar?" aoFechar={() => setSair(false)}>
          <p className="m-0 text-[15px] text-suave">O que você digitou neste protocolo será descartado.</p>
          <button type="button" className="btn-primario" onClick={() => setSair(false)}>Continuar editando</button>
          <button type="button" className="btn-neutro text-erro" onClick={() => { rascunho.limpar(); nav('/protocolos', { replace: true }) }}>Descartar</button>
        </Dialogo>
      )}
    </Etapa>
  )
}

// ---------------- M25 (também usada por Minhas substâncias) ----------------
export function CriarSubstancia() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const volta = params.get('volta')
  const editarId = params.get('editar')
  const base = useBase()
  const editando = editarId ? base?.subs.get(editarId) : undefined
  const [nome, setNome] = useState(params.get('nome') ?? '')
  const [tipo, setTipo] = useState<'simples' | 'blend'>('simples')
  const [erro, setErro] = useState('')
  const ocupado = useRef(false)
  useEffect(() => {
    if (editando) setNome(editando.nome)
  }, [editando])

  const salvar = async () => {
    const n = nome.trim()
    if (!n) return setErro('Digite o nome.')
    if (ocupado.current) return
    ocupado.current = true
    if (editando) {
      await repo.atualizarSubstancia({ ...editando, nome: n })
      toast({ titulo: 'Substância atualizada', texto: n })
      return nav(-1)
    }
    if (tipo === 'blend') return nav(`/novo/blend?nome=${encodeURIComponent(n)}${volta ? `&volta=${volta}` : '&usar=1'}`, { replace: true })
    const s = await repo.criarSubstancia({ nome: n, tipo: 'simples', origem: 'usuario' })
    if (volta) {
      toast({ titulo: 'Substância criada', texto: n })
      return nav(-1)
    }
    rascunho.mudarItem(() => ({ substanciaId: s.id }))
    nav('/novo/dose', { replace: true })
  }

  return (
    <Etapa
      titulo={editando ? 'Editar substância' : 'Nova substância'}
      rodape={
        <>
          <button type="button" className="btn-primario" onClick={salvar}>{editando || volta ? 'Salvar' : 'Salvar e usar'}</button>
          {!volta && !editando && <button type="button" className="btn-texto" onClick={() => nav(-1)}>Voltar à busca</button>}
        </>
      }
    >
      <label className="rotulo text-sm">
        Nome
        <input className="campo" value={nome} autoFocus onChange={(e) => { setNome(e.target.value); setErro('') }} placeholder="Como você chama" />
      </label>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      {!editando && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-bold text-fraco">Tipo</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {([['simples', 'Simples', '1 substância'], ['blend', 'Blend', 'vários no mesmo frasco']] as const).map(([v, t, d]) => (
              <button key={v} type="button" aria-pressed={tipo === v} onClick={() => setTipo(v)} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border ${tipo === v ? 'border-2 border-acento bg-selecionado text-acento' : 'border-borda bg-sup'}`}>
                <b className="text-base">{t}</b>
                <span className="text-xs text-fraco">{d}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <Nota>Fica em Minhas substâncias, só neste aparelho, e aparece nas próximas buscas. Dá para editar ou arquivar depois. Só o nome: nenhuma dose vem pronta.</Nota>
    </Etapa>
  )
}

// ---------------- T26 ----------------
interface CompEdit extends Omit<Componente, 'quantidade'> {
  k: string
  qtd: string
}

export function EditorBlend() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const base = useBase()
  const id = params.get('id')
  const usar = params.get('usar') === '1'
  const existente = id ? base?.subs.get(id) : undefined
  const [nome, setNome] = useState(params.get('nome') ?? '')
  const [comps, setComps] = useState<CompEdit[]>([])
  const [carregado, setCarregado] = useState(!id)
  const [erro, setErro] = useState('')
  const ocupado = useRef(false)
  useEffect(() => {
    if (existente && !carregado) {
      setNome(existente.nome)
      setComps((existente.componentes ?? []).map((c, i) => ({ k: String(i), nome: c.nome, unidade: c.unidade ?? 'mg', qtd: c.quantidade !== undefined ? fmtNum(c.quantidade) : '' })))
      setCarregado(true)
    }
  }, [existente, carregado])
  if (base && id && !existente && !carregado) return <NaoAchou titulo="Blend não encontrado" />
  if (!base || !carregado) return <Carregando />

  const componentes: Componente[] = comps
    .filter((c) => c.nome.trim())
    .map((c) => ({ nome: c.nome.trim(), unidade: c.unidade ?? 'mg', quantidade: lerNumero(c.qtd) ?? undefined }))
  const soma = somaComponentesMg(componentes)

  const salvar = async () => {
    const n = nome.trim()
    if (!n) return setErro('Dê um nome ao blend.')
    if (ocupado.current) return
    ocupado.current = true
    let subId: string
    if (existente) {
      await repo.atualizarSubstancia({ ...existente, nome: n, componentes })
      subId = existente.id
    } else {
      const s = await repo.criarSubstancia({ nome: n, tipo: 'blend', origem: 'usuario', componentes })
      subId = s.id
    }
    if (usar) {
      rascunho.mudarItem(() => ({ substanciaId: subId }))
      nav('/novo/dose', { replace: true })
    } else {
      toast({ titulo: 'Blend salvo', texto: n })
      nav(-1)
    }
  }

  return (
    <Etapa
      titulo={existente ? 'Blend' : 'Novo blend'}
      rodape={<button type="button" className="btn-primario" onClick={salvar}>{usar ? 'Salvar blend e usar' : 'Salvar blend'}</button>}
    >
      <label className="rotulo text-sm">
        Nome do blend (da lista ou como você chama)
        <input className="campo" value={nome} onChange={(e) => { setNome(e.target.value); setErro('') }} placeholder="Ex.: Blend pele 70 mg" />
      </label>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      <p className="m-0 text-[13px] leading-relaxed text-fraco">Este nome aparece em todas as telas e vira o nome do protocolo se você não der outro. Componentes são opcionais: só aparecem aqui e na reconstituição.</p>
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[17px] font-bold">Componentes no mesmo frasco</h2>
        {comps.map((c, i) => (
          <div key={c.k} className="card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-fraco">Componente {i + 1}</span>
              <button type="button" className="icone-btn -mr-2" aria-label={`Remover componente ${i + 1}`} onClick={() => setComps(comps.filter((x) => x.k !== c.k))}><IcoX tam={18} /></button>
            </div>
            <input className="campo" aria-label={`Nome do componente ${i + 1}`} placeholder="Nome" value={c.nome} onChange={(e) => setComps(comps.map((x) => (x.k === c.k ? { ...x, nome: e.target.value } : x)))} />
            <div className="flex gap-2">
              <input className="campo min-w-0" inputMode="decimal" aria-label={`Quantidade do componente ${i + 1} por frasco`} placeholder="Qtd. por frasco (opcional)" value={c.qtd} onChange={(e) => setComps(comps.map((x) => (x.k === c.k ? { ...x, qtd: e.target.value } : x)))} />
              <select className="campo w-24 shrink-0" aria-label="Unidade" value={c.unidade} onChange={(e) => setComps(comps.map((x) => (x.k === c.k ? { ...x, unidade: e.target.value as 'mg' | 'mcg' } : x)))}>
                <option value="mg">mg</option>
                <option value="mcg">mcg</option>
              </select>
            </div>
          </div>
        ))}
        <button type="button" className="btn-secundario" onClick={() => setComps([...comps, { k: crypto.randomUUID(), nome: '', qtd: '', unidade: 'mg' }])}>
          <IcoMais tam={20} /> Adicionar componente
        </button>
        {componentes.length === 1 && <p className="m-0 text-[13px] text-aviso">Blend costuma ter 2 ou mais componentes. Se for só 1, crie como substância simples.</p>}
        {soma !== null && <p className="m-0 text-sm font-semibold text-suave">Soma informada: {fmtNum(soma)} mg por frasco</p>}
      </section>
      <Nota>Quantidades são opcionais e vêm do rótulo. O app não calcula dose de cada componente.</Nota>
    </Etapa>
  )
}

// ---------------- T22 ----------------
export function PassoDose() {
  const r = useRascunhoObrigatorio()
  const base = useBase()
  const nav = useNavigate()
  const [erro, setErro] = useState('')
  if (!r || !base) return <Carregando />
  const it = itemAtual(r)
  const sub = it.substanciaId ? base.subs.get(it.substanciaId) : undefined
  if (!sub) return <Navigate to="/novo/substancia" replace />
  const blend = sub.tipo === 'blend'
  const continuar = () => {
    const v = lerNumero(it.doseTxt)
    if (v === null || v <= 0) return setErro(erroNumero(it.doseTxt, 'Digite um número maior que zero.'))
    if (!it.doseUnidade) return setErro('Escolha a unidade.')
    nav(it.horarios.length ? '/novo/revisao' : '/novo/frequencia')
  }
  return (
    <Etapa n={2} titulo="Quanto você aplica por vez?" rodape={<button type="button" className="btn-primario" onClick={continuar}>Continuar</button>}>
      <span className="text-lg font-bold text-acento break-words">{sub.nome}</span>
      <label className="rotulo text-sm">
        Dose que você definiu
        <input
          className="campo h-14 text-xl"
          inputMode="decimal"
          autoFocus
          placeholder="Digite o número"
          value={it.doseTxt}
          aria-invalid={!!erro}
          onChange={(e) => { rascunho.mudarItem(() => ({ doseTxt: e.target.value })); setErro('') }}
        />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-fraco">Unidade</legend>
        <Chips rotulo="Unidade" opcoes={UNIDADES.map((u) => ({ v: u, t: u }))} valor={it.doseUnidade} aoMudar={(v: UnidadeDose) => { rascunho.mudarItem(() => ({ doseUnidade: v })); setErro('') }} />
      </fieldset>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      {blend && <Nota>Em blend, use a dose do frasco todo (mL ou unidades), como você aplica.</Nota>}
      <Nota tipo="aviso">Confira a unidade: 1 mg = 1.000 mcg. O app não sugere doses; use a que você definiu.</Nota>
    </Etapa>
  )
}

// ---------------- T23 ----------------
export function PassoFrequencia() {
  const r = useRascunhoObrigatorio()
  const nav = useNavigate()
  const [hora, setHora] = useState('08:00')
  const [erro, setErro] = useState('')
  if (!r) return <Carregando />
  const it = itemAtual(r)
  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(hora)) return
    if (!it.horarios.includes(hora)) rascunho.mudarItem((i) => ({ horarios: [...i.horarios, hora].sort() }))
    setErro('')
  }
  const continuar = () => {
    if (it.freqTipo === 'semana' && !it.dias.length) return setErro('Escolha pelo menos um dia da semana.')
    if (it.freqTipo === 'cadaN' && !((lerNumero(it.cadaN) ?? 0) >= 1)) return setErro('Informe de quantos em quantos dias.')
    if (!it.horarios.length) return setErro('Adicione pelo menos um horário.')
    nav('/novo/revisao')
  }
  const opc = [
    { v: 'diaria', t: 'Todos os dias' },
    { v: 'cadaN', t: 'A cada N dias' },
    { v: 'semana', t: 'Dias da semana' },
  ] as const
  return (
    <Etapa n={3} titulo="Quando você aplica?" rodape={<button type="button" className="btn-primario" onClick={continuar}>Continuar</button>}>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-fraco">Frequência</legend>
        {opc.map((o) => (
          <label key={o.v} className={`card flex min-h-[52px] items-center gap-3 px-4 text-base font-semibold ${it.freqTipo === o.v ? 'border-acento' : ''}`}>
            <input type="radio" name="freq" className="h-5 w-5" checked={it.freqTipo === o.v} onChange={() => { rascunho.mudarItem(() => ({ freqTipo: o.v })); setErro('') }} />
            {o.t}
            {o.v === 'cadaN' && it.freqTipo === 'cadaN' && (
              <span className="ml-auto flex items-center gap-2 text-sm text-fraco">
                a cada
                <input aria-label="Número de dias" inputMode="numeric" className="campo h-11 w-16 text-center" value={it.cadaN} onChange={(e) => rascunho.mudarItem(() => ({ cadaN: e.target.value }))} />
                dias
              </span>
            )}
          </label>
        ))}
      </fieldset>
      {it.freqTipo === 'semana' && (
        <div role="group" aria-label="Dias da semana" className="grid grid-cols-7 gap-1">
          {SEMANA_CURTA.map((d, k) => (
            <button key={d} type="button" aria-pressed={it.dias.includes(k)} className="chip px-0 text-[13px]" onClick={() => rascunho.mudarItem((i) => ({ dias: i.dias.includes(k) ? i.dias.filter((x) => x !== k) : [...i.dias, k] }))}>
              {d}
            </button>
          ))}
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-fraco">Horários</h2>
        <div className="flex flex-wrap gap-2">
          {it.horarios.map((h) => (
            <button key={h} type="button" className="chip gap-1.5" aria-pressed="true" aria-label={`Remover ${h}`} onClick={() => rascunho.mudarItem((i) => ({ horarios: i.horarios.filter((x) => x !== h) }))}>
              {h} <IcoX tam={14} />
            </button>
          ))}
          {!it.horarios.length && <span className="text-sm text-fraco">Nenhum horário ainda.</span>}
        </div>
        <div className="flex gap-2">
          <input type="time" aria-label="Horário" className="campo" value={hora} onChange={(e) => setHora(e.target.value)} />
          <button type="button" className="btn-secundario w-auto shrink-0" onClick={add}><IcoMais tam={18} /> Adicionar</button>
        </div>
        {it.horarios.length > 0 && <span className="text-[13px] text-fraco">Toque num horário para remover.</span>}
      </section>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
    </Etapa>
  )
}

// ---------------- T24 ----------------
export function PassoRevisao() {
  const r = useRascunhoObrigatorio()
  const base = useBase()
  const nav = useNavigate()
  const toast = useToast()
  const [erros, setErros] = useState<string[]>([])
  const [confirmar, setConfirmar] = useState(false)
  if (!r || !base) return <Carregando />
  const subNome = (i: ItemRascunho) => (i.substanciaId ? base.subs.get(i.substanciaId)?.nome ?? '' : '')
  const nomePadrao = subNome(r.itens[0]) || 'o composto'
  const fim = fimDe(r)
  const depois = r.itens.map((i) => `${subNome(i)} ${i.doseUnidade ? fmtDose(lerNumero(i.doseTxt) ?? 0, i.doseUnidade) : ''}, ${descreverFrequencia(frequenciaDe(i), i.horarios)}`).join('; ')

  const gravar = async () => {
    const { protocolo, itens } = montarProtocolo(r)
    await repo.salvarProtocolo(protocolo, itens)
    rascunho.limpar()
    toast({ titulo: r.modo === 'editar' ? 'Alteração salva' : 'Protocolo salvo', texto: nomeProtocolo(protocolo, itens, base.subs) })
    nav(`/protocolos/${protocolo.id}`, { replace: true })
  }
  const salvar = () => {
    const v = validarRascunho(r)
    setErros(v.erros)
    if (!v.ok) return
    if (r.modo === 'editar') setConfirmar(true)
    else void gravar()
  }
  const irPara = (k: number, rota: string) => {
    rascunho.mudar(() => ({ atual: k }))
    nav(rota)
  }

  return (
    <Etapa
      n={4}
      titulo={r.modo === 'editar' ? 'Editar protocolo' : r.modo === 'duplicar' ? 'Novo ciclo (cópia)' : 'Por quanto tempo?'}
      aoVoltar={() => (r.modo === 'novo' ? nav(-1) : (rascunho.limpar(), nav(-1)))}
      rodape={
        <>
          {erros.length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-xl bg-sup2 p-3 text-sm font-bold text-erro">
              {erros.map((e) => <span key={e}>{e}</span>)}
            </div>
          )}
          <button type="button" className="btn-primario" onClick={salvar}>{r.modo === 'editar' ? 'Salvar alteração' : 'Salvar protocolo'}</button>
        </>
      }
    >
      <label className="rotulo text-sm text-texto">
        <span>Nome do protocolo <span className="font-medium text-fraco">(opcional)</span></span>
        <input className="campo font-medium" maxLength={MAX_NOME_PROTOCOLO} placeholder="Ex.: meu protocolo da pele" value={r.nome} onChange={(e) => rascunho.mudar(() => ({ nome: e.target.value }))} />
        <span className="text-[13px] leading-snug font-medium text-fraco">
          Se deixar vazio, usamos o nome do composto (aqui, {nomePadrao}). Até {MAX_NOME_PROTOCOLO} caracteres; nomes repetidos são aceitos e diferenciados pela data de início.
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="rotulo text-sm text-texto">
          Começa em
          <input type="date" className="campo px-2" value={r.inicio} onChange={(e) => rascunho.mudar(() => ({ inicio: e.target.value }))} />
        </label>
        <div className="rotulo text-sm text-texto">
          <span>Duração</span>
          <div className="flex gap-1.5">
            {r.duracaoTipo !== 'sem-fim' && (
              <input aria-label="Duração" inputMode="numeric" className="campo w-14 shrink-0 px-2 text-center" value={r.duracaoValor} onChange={(e) => rascunho.mudar(() => ({ duracaoValor: e.target.value }))} />
            )}
            <select aria-label="Unidade da duração" className="campo min-w-0 px-2 text-sm" value={r.duracaoTipo} onChange={(e) => rascunho.mudar(() => ({ duracaoTipo: e.target.value as Rascunho['duracaoTipo'] }))}>
              <option value="semanas">semanas</option>
              <option value="dias">dias</option>
              <option value="sem-fim">sem fim</option>
            </select>
          </div>
        </div>
      </div>
      <div className="card flex flex-col gap-3 px-4 py-3">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <b className="text-[15px]">Ciclo com pausa</b>
            <span className="text-[13px] text-fraco">Ex.: X dias sim, Y dias não. Opcional.</span>
          </span>
          <input type="checkbox" role="switch" className="h-6 w-6" checked={r.ciclo} onChange={(e) => rascunho.mudar(() => ({ ciclo: e.target.checked }))} />
        </label>
        {r.ciclo && (
          <div className="flex items-center gap-2 text-sm font-semibold text-suave">
            <input aria-label="Dias com dose" inputMode="numeric" className="campo h-11 w-16 text-center" value={r.diasOn} onChange={(e) => rascunho.mudar(() => ({ diasOn: e.target.value }))} />
            dias sim,
            <input aria-label="Dias de pausa" inputMode="numeric" className="campo h-11 w-16 text-center" value={r.diasOff} onChange={(e) => rascunho.mudar(() => ({ diasOff: e.target.value }))} />
            dias não
          </div>
        )}
      </div>

      <section aria-label="Resumo" className="flex flex-col gap-2.5">
        <span className="text-[13px] font-bold tracking-wide text-fraco uppercase">Confira antes de salvar</span>
        {r.itens.map((i, k) => {
          const frascos = base.frascos.filter((f) => f.substanciaId === i.substanciaId && (f.status === 'fechado' || f.status === 'reconstituido'))
          return (
            <div key={i.id} className="card flex flex-col gap-1.5 p-4">
              <b className="text-lg break-words">{subNome(i) || 'Sem substância'} · {i.doseUnidade ? fmtDose(lerNumero(i.doseTxt) ?? 0, i.doseUnidade) : 'sem dose'}</b>
              <span className="text-[15px] leading-normal text-suave">
                {descreverFrequencia(frequenciaDe(i), i.horarios).replace(/^./, (c) => c.toUpperCase())}
                {r.inicio && `, de ${dataCurta(r.inicio)}${fim ? ` a ${dataCurta(fim)}` : ' sem data de fim'}`}
                {r.duracaoTipo !== 'sem-fim' && ` (${r.duracaoValor} ${r.duracaoTipo})`}
                {r.ciclo && `, ciclo ${r.diasOn} dias sim e ${r.diasOff} não`}.
              </span>
              {frascos.length > 0 && (
                <label className="rotulo mt-1">
                  Frasco em uso (opcional)
                  <select className="campo text-sm font-semibold" value={i.frascoId ?? ''} onChange={(e) => rascunho.mudar((x) => ({ itens: x.itens.map((y) => (y.id === i.id ? { ...y, frascoId: e.target.value || undefined } : y)) }))}>
                    <option value="">Nenhum</option>
                    {frascos.map((f) => <option key={f.id} value={f.id}>{fmtNum(f.mgTotal)} mg · {f.status === 'reconstituido' ? 'reconstituído' : 'fechado'}{f.validade ? ` · val. ${dataCurta(f.validade)}` : ''}</option>)}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap gap-x-4">
                <button type="button" className="link" onClick={() => irPara(k, '/novo/dose')}>Corrigir dose</button>
                <button type="button" className="link" onClick={() => irPara(k, '/novo/frequencia')}>Corrigir horários</button>
                {r.itens.length > 1 && (
                  <button type="button" className="link text-erro" onClick={() => rascunho.mudar((x) => ({ itens: x.itens.filter((y) => y.id !== i.id), atual: 0 }))}>Remover</button>
                )}
              </div>
            </div>
          )
        })}
      </section>
      <button
        type="button"
        className="link gap-2 text-[15px]"
        onClick={() => {
          rascunho.mudar((x) => ({ itens: [...x.itens, itemVazio()], atual: x.itens.length }))
          nav('/novo/substancia')
        }}
      >
        <IcoMais tam={20} /> Adicionar outra substância a este protocolo
      </button>
      {confirmar && (
        <Dialogo titulo="Salvar a alteração?" aoFechar={() => setConfirmar(false)}>
          <p className="m-0 text-[15px] text-suave">Vale a partir de hoje. As doses já registradas continuam com o valor da época.</p>
          <div className="flex flex-col gap-1.5 rounded-xl bg-sup2 p-3 text-sm">
            <span><b className="text-fraco">Antes:</b> {r.antes}</span>
            <span><b className="text-acento">Depois:</b> {depois}</span>
          </div>
          <button type="button" className="btn-primario" onClick={gravar}>Salvar a partir de hoje</button>
          <button type="button" className="btn-texto" onClick={() => setConfirmar(false)}>Continuar editando</button>
        </Dialogo>
      )}
    </Etapa>
  )
}
