// Novo/editar protocolo em 2 passos: T21 "O quê e quanto" (substância + dose com unidade já marcada
// + calculadora), T23 "Quando" (frequência e horário; início, fim, ciclo, nome, cor e outras
// substâncias em "Mais opções"). Sem tela de revisão: o botão Salvar mostra o resumo.
// Também: E21 busca vazia, M25 criar substância, T26 editor de blend, M24 salvar alteração, M26 sair sem salvar.
import { pedirArmazenamentoPersistente } from '../sistema/armazenamento.ts'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { repo, useBase } from '../dados/index.ts'
import { mensagemDeErro } from '../dados/repo.ts'
import { AMOSTRA_IDS, buscar, existeNomeExato, type ResultadoBusca } from '../dominio/sugestoes.ts'
import { descreverFrequencia } from '../dominio/agenda.ts'
import { dataCurta, hojeStr, SEMANA_CURTA } from '../dominio/datas.ts'
import { erroNumero, fmtDose, lerNumero, somaComponentesMg, fmtNum } from '../dominio/calculos.ts'
import type { Componente, ItemProtocolo, Substancia, UnidadeDose } from '../dominio/tipos.ts'
import { MAX_NOME_PROTOCOLO, nomeProtocolo } from '../dominio/nomes.ts'
import { pedidoAvisosAoSalvar } from '../dominio/primeiro-acesso.ts'
import { Carregando, Chips, Dialogo, NaoAchou, Nota, Tela } from '../ui/base.tsx'
import { IcoBusca, IcoCheck, IcoEstoque, IcoFechar, IcoMais, IcoSeta, IcoVoltar, IcoX } from '../ui/icones.tsx'
import { CORES_PROTOCOLO, proximaCor } from '../dominio/cores.ts'
import { escolherFrasco, frascosNaOrdem, frascoUsavel } from '../dominio/estoque.ts'
import { textoDoseUn, unidadesDaDose } from '../dominio/unidades.ts'
import { useToast } from '../ui/toast.tsx'
import { useVoltar } from '../ui/navegar.ts'
import { UNIDADES } from './dose.tsx'
import { CalculadoraSeringa } from './calculadora-seringa.tsx'
import {
  calculoInvalido,
  frascoDoCalculo,
  frequenciaDe,
  itemVazio,
  LISTA_PROTOCOLOS,
  montarProtocolo,
  novoRascunho,
  rascunho,
  rascunhoDe,
  resumoDoSalvar,
  situacaoPasso,
  temOpcoesAvancadas,
  unidadeInicial,
  useRascunho,
  validarRascunho,
  type ItemRascunho,
  type Rascunho,
  type SituacaoPasso,
} from './rascunho.ts'

const PASSOS = 2

function Barra({ n }: { n: number }) {
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      {Array.from({ length: PASSOS }, (_, k) => k + 1).map((k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k <= n ? 'bg-acento' : 'bg-sup2'}`} />)}
    </div>
  )
}

// Navegação do assistente: os passos trocam de tela com `replace`, então o cadastro inteiro ocupa
// UMA entrada no histórico. Depois de salvar, o voltar leva para onde a pessoa estava antes de
// começar (lista, Hoje ou o detalhe), nunca para um passo. As setas da tela voltam um passo.

function Etapa({ n, titulo, children, rodape, aoVoltar, fecharEmVezDeVoltar }: { n?: number; titulo: string; children: ReactNode; rodape: ReactNode; aoVoltar?: () => void; fecharEmVezDeVoltar?: boolean }) {
  const voltarOu = useVoltar()
  return (
    <Tela className="min-h-dvh">
      <div className="flex items-center gap-2">
        <button type="button" className="icone-btn -ml-2.5" aria-label={fecharEmVezDeVoltar ? 'Cancelar' : 'Voltar'} onClick={aoVoltar ?? (() => voltarOu('/hoje'))}>
          {fecharEmVezDeVoltar ? <IcoFechar /> : <IcoVoltar />}
        </button>
        {n && <span className="text-xs font-bold tracking-wide text-acento uppercase">Passo {n} de {PASSOS}</span>}
      </div>
      {n && <Barra n={n} />}
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{titulo}</h1>
      {children}
      <div className="mt-auto flex flex-col gap-2 pt-2">{rodape}</div>
    </Tela>
  )
}

/** /novo (ou /novo?saida=/hoje no primeiro acesso): começa um rascunho limpo. */
export function NovoProtocolo() {
  const [params] = useSearchParams()
  const saida = params.get('saida') === '/hoje' ? '/hoje' : undefined
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    const n = { ...novoRascunho(), saida }
    rascunho.iniciar(n)
    setId(n.protocoloId)
  }, [saida])
  const r = useRascunho()
  // Só segue quando o rascunho na sessão é o que acabou de ser criado (não um antigo, já fechado).
  return id && r?.protocoloId === id ? <Navigate to="/novo/substancia" replace /> : <Carregando />
}

/** Passo aberto sem cadastro em andamento (voltar depois de salvar, F5 numa aba nova, link antigo). */
function SaidaDoPasso({ s }: { s: Exclude<SituacaoPasso, { tipo: 'ok' }> }) {
  const nav = useNavigate()
  useEffect(() => {
    // Cadastro recém-fechado: a ação que fechou já está navegando; espera um instante para não
    // brigar com ela. Em qualquer caso há teto: a tela sempre sai daqui.
    const t = setTimeout(() => nav(s.para, { replace: true }), s.tipo === 'fechado' ? 400 : 0)
    return () => clearTimeout(t)
  }, [nav, s.para, s.tipo])
  return <Carregando />
}

/** Sai do assistente sem salvar: volta para onde estava antes de começar. */
function useSairDoAssistente() {
  const voltarOu = useVoltar()
  const nav = useNavigate()
  return (r: Rascunho, destino: string) => {
    rascunho.fechar(destino)
    if (r.saida) nav(r.saida, { replace: true })
    else voltarOu(destino)
  }
}

/** Onde fica o protocolo antes desta edição (para sair sem salvar). */
const origemDe = (r: Rascunho) => (r.base ? `/protocolos/${r.base.id}` : LISTA_PROTOCOLOS)

/** /protocolos/:id/editar e /duplicar: as mesmas 2 telas, começando pelo passo 1. */
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
    nav('/novo/substancia', { replace: true })
  }, [base, id, modo, nav])
  return <Carregando />
}

function itemAtual(r: Rascunho): ItemRascunho {
  return r.itens[r.atual] ?? r.itens[0]
}

/**
 * Põe a substância na linha atual e, se a pessoa ainda não tocou numa unidade, já marca a unidade
 * conhecida (a última usada com ela; senão mg, ou unidades em blend). Nunca preenche a dose.
 */
function usarSubstancia(sub: Pick<Substancia, 'id' | 'tipo'>, itens: ItemProtocolo[]) {
  rascunho.mudarItem((i) => ({ substanciaId: sub.id, ...(i.unidadeAuto !== false ? { doseUnidade: unidadeInicial(sub, itens), unidadeAuto: true } : {}) }))
}

// ---------------- T21: passo 1, o quê e quanto ----------------
export function PassoOQue() {
  const s = situacaoPasso(useRascunho())
  const base = useBase()
  const nav = useNavigate()
  const sairDoAssistente = useSairDoAssistente()
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [sair, setSair] = useState(false)
  const [trocando, setTrocando] = useState(false)
  const [erro, setErro] = useState('')
  const resultados = useMemo(() => (base ? buscar(texto, base.substancias, undefined, 30) : []), [base, texto])
  if (s.tipo !== 'ok') return <SaidaDoPasso s={s} />
  const r = s.r
  if (!base) return <Carregando />
  const atual = itemAtual(r)
  const escolhida = atual.substanciaId ? base.subs.get(atual.substanciaId) : undefined
  const buscando = !escolhida || trocando
  const q = texto.trim()
  const ir = (rota: string) => nav(rota, { replace: true })

  const escolher = async (res: ResultadoBusca) => {
    let sub: Substancia
    if (res.origem === 'minha') sub = res.substancia
    else {
      try {
        sub = await repo.usarSugestao(res.sugestao)
      } catch (e) {
        return toast({ tipo: 'info', titulo: 'Não deu para escolher', texto: mensagemDeErro(e) })
      }
      if (sub.tipo === 'blend') return ir(`/novo/blend?id=${sub.id}&usar=1`)
    }
    usarSubstancia(sub, base.itens)
    setTrocando(false)
    setTexto('')
    setErro('')
  }

  const cancelar = () => {
    if (r.atual > 0) {
      // outra linha do mesmo protocolo: volta ao passo 2 (sem a linha, se ficou vazia)
      if (!atual.substanciaId) rascunho.mudar((x) => ({ itens: x.itens.filter((_, k) => k !== x.atual), atual: 0 }))
      return ir('/novo/frequencia')
    }
    if (r.modo !== 'novo') return sairDoAssistente(r, origemDe(r))
    const tem = r.itens.some((i) => i.substanciaId || i.doseTxt.trim()) || r.nome.trim()
    if (tem) setSair(true)
    else sairDoAssistente(r, LISTA_PROTOCOLOS)
  }

  const continuar = () => {
    const v = lerNumero(atual.doseTxt)
    if (v === null || v <= 0) return setErro(erroNumero(atual.doseTxt, 'Digite um número maior que zero.'))
    if (!atual.doseUnidade) return setErro('Escolha a unidade.')
    if (calculoInvalido(atual)) return setErro('Confira os números do frasco na calculadora (mg do frasco e mL de água) ou apague-os.')
    ir('/novo/frequencia')
  }

  const pular = r.saida && r.modo === 'novo' && r.atual === 0 && (
    <button type="button" className="btn-texto" onClick={() => sairDoAssistente(r, r.saida!)}>Pular, ver o app primeiro</button>
  )
  const dialogoSair = sair && <DialogoSair aoFicar={() => setSair(false)} aoDescartar={() => { setSair(false); sairDoAssistente(r, LISTA_PROTOCOLOS) }} />

  if (buscando) {
    return (
      <Etapa
        n={1}
        titulo="O quê e quanto"
        aoVoltar={trocando ? () => setTrocando(false) : cancelar}
        fecharEmVezDeVoltar={!trocando}
        rodape={
          <>
            <button type="button" className="btn-primario" disabled>Escolha ou crie uma substância</button>
            {pular}
          </>
        }
      >
        <h2 className="text-lg font-bold">O que você vai usar?</h2>
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
            <p className="m-0 text-sm text-suave">Sem problema: crie com esse nome. Ela fica salva só para você e aparece nas próximas buscas.</p>
            <button type="button" className="btn-primario" onClick={() => ir(`/novo/criar?nome=${encodeURIComponent(q)}`)}>Criar “{q}”</button>
            <button type="button" className="btn-secundario" onClick={() => ir(`/novo/blend?nome=${encodeURIComponent(q)}&usar=1`)}>É um blend: criar com componentes</button>
            <p className="m-0 text-sm text-fraco">Dica: confira a grafia, com ou sem hífen.</p>
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
                  onClick={() => void escolher(res)}
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
              <button type="button" onClick={() => ir(`/novo/criar?nome=${encodeURIComponent(q)}`)} className="flex min-h-[52px] items-center gap-2.5 border-t border-sup2 px-4 text-left text-sm font-bold text-acento">
                <IcoMais tam={20} /> Não achei: criar “{q}”
              </button>
            )}
            {!q && (
              <button type="button" onClick={() => ir('/novo/criar')} className="flex min-h-[52px] items-center gap-2.5 border-t border-sup2 px-4 text-left text-sm font-bold text-acento">
                <IcoMais tam={20} /> Criar substância do zero
              </button>
            )}
            <button type="button" onClick={() => ir(`/novo/blend?usar=1${q ? `&nome=${encodeURIComponent(q)}` : ''}`)} className="flex min-h-[52px] items-center gap-2.5 border-t border-sup2 px-4 text-left text-sm font-bold text-acento">
              <IcoMais tam={20} /> Criar blend (vários em um frasco)
            </button>
          </div>
        )}
        <p className="m-0 text-sm leading-relaxed text-fraco">
          Sugestões, só nomes (sem doses nem composição). Não é limite: digite qualquer composto ou blend, mesmo que não esteja aqui. {!q && `Mostrando ${AMOSTRA_IDS.length} da lista; busque para ver mais.`}
        </p>
        {dialogoSair}
      </Etapa>
    )
  }

  const sub = escolhida!
  const blend = sub.tipo === 'blend'
  const hoje = hojeStr()
  const frascoLigado = atual.frascoId ? base.frascos.find((f) => f.id === atual.frascoId) : undefined
  const ligadoUsavel = !!frascoLigado && frascoUsavel(frascoLigado, base.aplicacoes)
  const novoFrasco = frascoDoCalculo(atual, hoje, ligadoUsavel)
  const frascos = frascosNaOrdem(sub.id, base.frascos, base.aplicacoes, hoje)
  return (
    <Etapa
      n={1}
      titulo="O quê e quanto"
      aoVoltar={cancelar}
      fecharEmVezDeVoltar
      rodape={
        <>
          <button type="button" className="btn-primario" onClick={continuar}>Continuar</button>
          {pular}
        </>
      }
    >
      <div className="card flex items-center justify-between gap-3 py-1 pr-1 pl-4">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-bold text-fraco">Substância</span>
          <b className="text-lg break-words text-acento">{sub.nome}</b>
        </span>
        <button type="button" className="btn-texto shrink-0" onClick={() => { setTrocando(true); setErro('') }}>Trocar</button>
      </div>
      <label className="rotulo text-sm">
        Dose que você definiu
        <input
          className="campo h-14 text-xl"
          inputMode="decimal"
          autoFocus
          placeholder="Digite o número"
          value={atual.doseTxt}
          aria-invalid={!!erro}
          onChange={(e) => { rascunho.mudarItem(() => ({ doseTxt: e.target.value })); setErro('') }}
        />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-fraco">Unidade</legend>
        <Chips rotulo="Unidade" opcoes={UNIDADES.map((u) => ({ v: u, t: u }))} valor={atual.doseUnidade} aoMudar={(v: UnidadeDose) => { rascunho.mudarItem(() => ({ doseUnidade: v, unidadeAuto: false })); setErro('') }} />
      </fieldset>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      <Nota tipo="aviso">Confira a unidade: 1 mg = 1.000 mcg. A dose é a que você definiu.</Nota>
      {blend && <Nota>Em blend, a dose é do frasco todo, em mL ou unidades.</Nota>}
      <CalculadoraSeringa it={atual} blend={blend} frascoLigado={frascoLigado} ligadoUsavel={ligadoUsavel} somaBlendMg={blend ? somaComponentesMg(sub.componentes) : null} />
      {!novoFrasco && frascos.length > 0 && (
        <label className="rotulo text-sm">
          Frasco do Estoque
          <select className="campo text-sm font-semibold" value={atual.frascoId ?? ''} onChange={(e) => rascunho.mudarItem(() => ({ frascoId: e.target.value || undefined }))}>
            <option value="">Automático (o mais antigo com saldo)</option>
            {frascos.map((f) => <option key={f.id} value={f.id}>{fmtNum(f.mgTotal)} mg · {f.status === 'reconstituido' ? 'reconstituído' : 'fechado'}{f.validade ? ` · val. ${dataCurta(f.validade)}` : ''}</option>)}
          </select>
        </label>
      )}
      {dialogoSair}
    </Etapa>
  )
}

/** M26: sair do cadastro com algo digitado. */
function DialogoSair({ aoFicar, aoDescartar }: { aoFicar: () => void; aoDescartar: () => void }) {
  return (
    <Dialogo titulo="Sair sem salvar?" aoFechar={aoFicar}>
      <p className="m-0 text-sm text-suave">O que você digitou neste protocolo será descartado.</p>
      <button type="button" className="btn-primario" onClick={aoFicar}>Continuar editando</button>
      <button type="button" className="btn-neutro text-erro" onClick={aoDescartar}>Descartar</button>
    </Dialogo>
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
  const voltarOu = useVoltar()
  // Aberta pelo assistente (não por Minhas substâncias): só faz sentido com um cadastro em andamento.
  const assistente = !volta && !editarId
  const s = situacaoPasso(useRascunho())
  if (assistente && s.tipo !== 'ok') return <SaidaDoPasso s={s} />
  const aBusca = () => nav('/novo/substancia', { replace: true })

  const salvar = async () => {
    const n = nome.trim()
    if (!n) return setErro('Digite o nome.')
    if (ocupado.current) return
    ocupado.current = true
    if (tipo === 'blend' && !editando) return nav(`/novo/blend?nome=${encodeURIComponent(n)}${volta ? `&volta=${volta}` : '&usar=1'}`, { replace: true })
    let s
    try {
      if (editando) await repo.atualizarSubstancia({ ...editando, nome: n })
      else s = await repo.criarSubstancia({ nome: n, tipo: 'simples', origem: 'usuario' })
    } catch (e) {
      ocupado.current = false
      return setErro(mensagemDeErro(e))
    }
    if (editando || !s) {
      toast({ titulo: 'Substância atualizada', texto: n })
      return voltarOu('/ajustes/substancias')
    }
    if (volta) {
      toast({ titulo: 'Substância criada', texto: n })
      return voltarOu('/ajustes/substancias')
    }
    usarSubstancia(s, base?.itens ?? [])
    nav('/novo/substancia', { replace: true })
  }

  return (
    <Etapa
      titulo={editando ? 'Editar substância' : 'Nova substância'}
      aoVoltar={assistente ? aBusca : undefined}
      rodape={
        <>
          <button type="button" className="btn-primario" onClick={salvar}>{editando || volta ? 'Salvar' : 'Salvar e usar'}</button>
          {!volta && !editando && <button type="button" className="btn-texto" onClick={aBusca}>Voltar à busca</button>}
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
                <span className="text-mini text-fraco">{d}</span>
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
  const voltarOu = useVoltar()
  const s = situacaoPasso(useRascunho())
  // Com usar=1 o blend vai para o cadastro em andamento: sem cadastro, não abre.
  if (usar && s.tipo !== 'ok') return <SaidaDoPasso s={s} />
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
    let sub: Substancia
    try {
      if (existente) {
        sub = { ...existente, nome: n, componentes }
        await repo.atualizarSubstancia(sub)
      } else {
        sub = await repo.criarSubstancia({ nome: n, tipo: 'blend', origem: 'usuario', componentes })
      }
    } catch (e) {
      ocupado.current = false
      return setErro(mensagemDeErro(e))
    }
    if (usar) {
      usarSubstancia(sub, base.itens)
      nav('/novo/substancia', { replace: true })
    } else {
      toast({ titulo: 'Blend salvo', texto: n })
      voltarOu('/estoque')
    }
  }

  return (
    <Etapa
      titulo={existente ? 'Blend' : 'Novo blend'}
      aoVoltar={usar ? () => nav('/novo/substancia', { replace: true }) : undefined}
      rodape={<button type="button" className="btn-primario" onClick={salvar}>{usar ? 'Salvar blend e usar' : 'Salvar blend'}</button>}
    >
      <label className="rotulo text-sm">
        Nome do blend (da lista ou como você chama)
        <input className="campo" value={nome} onChange={(e) => { setNome(e.target.value); setErro('') }} placeholder="Ex.: Blend pele 70 mg" />
      </label>
      {erro && <p role="alert" className="m-0 text-sm font-bold text-erro">{erro}</p>}
      <p className="m-0 text-sm leading-relaxed text-fraco">Este nome aparece em todas as telas e vira o nome do protocolo se você não der outro. Componentes são opcionais: só aparecem aqui e na reconstituição.</p>
      <section className="flex flex-col gap-2.5">
        <h2 className="text-xl font-bold">Componentes no mesmo frasco</h2>
        {comps.map((c, i) => (
          <div key={c.k} className="card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-fraco">Componente {i + 1}</span>
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
        {componentes.length === 1 && <p className="m-0 text-sm text-aviso">Blend costuma ter 2 ou mais componentes. Se for só 1, crie como substância simples.</p>}
        {soma !== null && <p className="m-0 text-sm font-semibold text-suave">Soma informada: {fmtNum(soma)} mg por frasco</p>}
      </section>
      <Nota>Quantidades são opcionais e vêm do rótulo. O app não calcula dose de cada componente.</Nota>
    </Etapa>
  )
}

// ---------------- T23: passo 2, quando (+ Mais opções e salvar) ----------------
export function PassoQuando() {
  const s = situacaoPasso(useRascunho())
  const base = useBase()
  const nav = useNavigate()
  const voltarOu = useVoltar()
  const toast = useToast()
  const [erros, setErros] = useState<string[]>([])
  const [confirmar, setConfirmar] = useState(false)
  /** null = ainda não mexeu: abre sozinho quando algum campo de "Mais opções" tem valor. */
  const [mais, setMais] = useState<boolean | null>(null)
  const salvando = useRef(false)
  if (s.tipo !== 'ok') return <SaidaDoPasso s={s} />
  const r = s.r
  if (!base) return <Carregando />
  const it = itemAtual(r)
  if (!it.substanciaId) return <Navigate to="/novo/substancia" replace />
  const aberto = mais ?? temOpcoesAvancadas(r)
  const hoje = hojeStr()
  const subNome = (i: ItemRascunho) => (i.substanciaId ? base.subs.get(i.substanciaId)?.nome ?? '' : '')
  const nomePadrao = subNome(r.itens[0]) || 'o composto'

  /** Frasco que cada linha leva para o Estoque ao salvar (regra: todo frasco informado vai para o Estoque). */
  const frascoNovoDe = (i: ItemRascunho, dia: string) => {
    const ligado = i.frascoId ? base.frascos.find((f) => f.id === i.frascoId) : undefined
    return frascoDoCalculo(i, dia, !!ligado && frascoUsavel(ligado, base.aplicacoes))
  }
  /** "2 mg · 10 un": a dose e, com o frasco que ela vai usar, as unidades na seringa. */
  const doseDaLinha = (i: ItemRascunho) => {
    if (!i.doseUnidade) return 'sem dose'
    const frasco = frascoNovoDe(i, r.inicio) ?? (i.substanciaId ? escolherFrasco({ substanciaId: i.substanciaId, preferidos: [i.frascoId], frascos: base.frascos, aplicacoes: base.aplicacoes, hoje }) : undefined)
    return textoDoseUn(unidadesDaDose(lerNumero(i.doseTxt) ?? 0, i.doseUnidade, frasco, !!i.substanciaId && base.subs.get(i.substanciaId)?.tipo === 'blend'))
  }
  const depois = r.itens.map((i) => `${subNome(i)} ${i.doseUnidade ? fmtDose(lerNumero(i.doseTxt) ?? 0, i.doseUnidade) : ''}, ${descreverFrequencia(frequenciaDe(i), i.horarios)}`).join('; ')
  const corEscolhida = r.cor ?? proximaCor(base.protocolos.filter((p) => p.id !== r.protocoloId).map((p) => p.cor))

  const gravar = async () => {
    if (salvando.current) return
    salvando.current = true
    const { protocolo, itens } = montarProtocolo(r)
    const novos: Record<string, NonNullable<ReturnType<typeof frascoDoCalculo>>> = {}
    for (const i of r.itens) {
      const f = frascoNovoDe(i, hojeStr())
      if (f) novos[i.id] = f
    }
    const primeiro = r.modo !== 'editar' && base.protocolos.length === 0
    let criados = 0
    try {
      criados = (await repo.salvarProtocolo({ ...protocolo, cor: corEscolhida }, itens, novos)).frascos.length
      if (r.modo !== 'editar') {
        // primeiro protocolo: o pedido de avisos aparece em seguida (uma vez só)
        const pedido = pedidoAvisosAoSalvar(await repo.getConfig('pedidoAvisos'), !!(await repo.getConfig('onboarding')))
        if (pedido) await repo.setConfig('pedidoAvisos', pedido)
      }
    } catch (e) {
      salvando.current = false
      setConfirmar(false)
      setErros([mensagemDeErro(e)])
      return
    }
    // pede ao navegador para não apagar os dados (sem janela no Chrome/Safari)
    if (r.modo !== 'editar') void pedirArmazenamentoPersistente()
    // Primeiro protocolo: a Hoje, já com a dose. Os outros: o detalhe do protocolo.
    const destino = primeiro ? '/hoje' : `/protocolos/${protocolo.id}`
    // Fecha o cadastro: nenhum passo reabre depois disto (voltar, F5, link antigo).
    rascunho.fechar(destino)
    toast({ titulo: r.modo === 'editar' ? 'Alteração salva' : 'Protocolo salvo', texto: `${nomeProtocolo(protocolo, itens, base.subs)}${criados ? ` · ${criados === 1 ? 'frasco' : `${criados} frascos`} no Estoque` : ''}` })
    // Editar: a tela anterior é o próprio protocolo. Novo/duplicar: o destino toma o lugar do assistente.
    if (r.modo === 'editar') voltarOu(destino)
    else nav(destino, { replace: true })
  }
  const salvar = () => {
    const v = validarRascunho(r)
    setErros(v.erros)
    if (!v.ok) {
      // erro num campo de "Mais opções": abre a seção para a pessoa ver
      if (v.erros.some((e) => /começa|duração|ciclo|nome|linha/i.test(e))) setMais(true)
      return
    }
    if (r.modo === 'editar') setConfirmar(true)
    else void gravar()
  }
  const editarLinha = (k: number) => {
    rascunho.mudar(() => ({ atual: k }))
    nav('/novo/substancia', { replace: true })
  }
  const novoHorario = () => {
    const livre = ['08:00', '20:00', '12:00', '16:00'].find((h) => !it.horarios.includes(h)) ?? '08:00'
    rascunho.mudarItem((i) => ({ horarios: [...i.horarios, livre] }))
    setErros([])
  }
  const opc = [
    { v: 'diaria', t: 'Todos os dias' },
    { v: 'cadaN', t: 'A cada N dias' },
    { v: 'semana', t: 'Dias da semana' },
  ] as const

  return (
    <Etapa
      n={2}
      titulo="Quando"
      aoVoltar={() => nav('/novo/substancia', { replace: true })}
      rodape={
        <>
          {erros.length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-xl bg-sup2 p-3 text-sm font-bold text-erro">
              {erros.map((e) => <span key={e}>{e}</span>)}
            </div>
          )}
          <button type="button" data-salvar="" className="btn-primario h-auto min-h-[54px] py-2.5 text-center leading-snug" onClick={salvar}>
            {r.modo === 'editar' ? 'Salvar alteração' : 'Salvar'} · {resumoDoSalvar(r)}
          </button>
        </>
      }
    >
      <button type="button" className="card tocavel flex min-h-[52px] items-center gap-3 px-4 py-2 text-left" onClick={() => editarLinha(r.atual)}>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-base break-words">{subNome(it)} · {doseDaLinha(it)}</b>
          <span className="text-sm text-fraco">Substância e dose</span>
        </span>
        <span className="flex shrink-0 items-center text-sm font-bold text-acento">Corrigir<IcoSeta tam={16} /></span>
      </button>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold text-fraco">Frequência</legend>
        {opc.map((o) => (
          <label key={o.v} className={`card flex min-h-[52px] items-center gap-3 px-4 text-base font-semibold ${it.freqTipo === o.v ? 'border-acento' : ''}`}>
            <input type="radio" name="freq" className="h-5 w-5" checked={it.freqTipo === o.v} onChange={() => { rascunho.mudarItem(() => ({ freqTipo: o.v })); setErros([]) }} />
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
            <button key={d} type="button" aria-pressed={it.dias.includes(k)} className="chip px-0 text-sm" onClick={() => { rascunho.mudarItem((i) => ({ dias: i.dias.includes(k) ? i.dias.filter((x) => x !== k) : [...i.dias, k] })); setErros([]) }}>
              {d}
            </button>
          ))}
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-fraco">{it.horarios.length > 1 ? 'Horários' : 'Horário'}</h2>
        {it.horarios.map((h, k) => (
          <div key={k} className="flex gap-2">
            <input
              type="time"
              aria-label={it.horarios.length > 1 ? `Horário ${k + 1}` : 'Horário'}
              className="campo"
              value={h}
              onChange={(e) => { const v = e.target.value; rascunho.mudarItem((i) => ({ horarios: i.horarios.map((x, j) => (j === k ? v : x)) })); setErros([]) }}
            />
            {it.horarios.length > 1 && (
              <button type="button" className="icone-btn shrink-0 border border-linha" aria-label={`Remover horário ${k + 1}`} onClick={() => rascunho.mudarItem((i) => ({ horarios: i.horarios.filter((_, j) => j !== k) }))}>
                <IcoX tam={18} />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="link gap-2 self-start text-sm" onClick={novoHorario}><IcoMais tam={18} /> {it.horarios.length ? 'Outro horário' : 'Adicionar horário'}</button>
      </section>

      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="mais-opcoes"
        className="card tocavel flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 text-left"
        onClick={() => setMais(!aberto)}
      >
        <span className="flex flex-col">
          <b className="text-base">Mais opções</b>
          <span className="text-sm text-fraco">Início, fim, ciclo, nome, cor e outras substâncias</span>
        </span>
        <IcoSeta tam={18} className={`shrink-0 text-acento transition-transform ${aberto ? 'rotate-90' : ''}`} />
      </button>
      {aberto && (
        <div id="mais-opcoes" className="anima-entrada flex flex-col gap-5">
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
                  <option value="sem-fim">sem fim</option>
                  <option value="semanas">semanas</option>
                  <option value="dias">dias</option>
                </select>
              </div>
            </div>
          </div>
          <div className="card flex flex-col gap-3 px-4 py-3">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <b className="text-sm">Ciclo com pausa</b>
                <span className="text-sm text-fraco">Ex.: X dias sim, Y dias não. Opcional.</span>
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
          <label className="rotulo text-sm text-texto">
            <span>Nome do protocolo <span className="font-medium text-fraco">(opcional)</span></span>
            <input className="campo font-medium" maxLength={MAX_NOME_PROTOCOLO} placeholder="Ex.: meu protocolo da pele" value={r.nome} onChange={(e) => rascunho.mudar(() => ({ nome: e.target.value }))} />
            <span className="text-sm leading-snug font-medium text-fraco">
              Se deixar vazio, fica o nome do composto (aqui, {nomePadrao}). Até {MAX_NOME_PROTOCOLO} caracteres; nomes repetidos são aceitos e diferenciados pela data de início.
            </span>
          </label>
          <SeletorCor valor={corEscolhida} aoMudar={(cor) => rascunho.mudar(() => ({ cor }))} />
          <section aria-labelledby="t-linhas" className="flex flex-col gap-2">
            <h2 id="t-linhas" className="text-sm font-bold text-texto">Substâncias deste protocolo</h2>
            <div className="card flex flex-col overflow-hidden">
              {r.itens.map((i, k) => (
                <div key={i.id} className="flex min-h-[52px] flex-wrap items-center gap-x-1 border-t border-sup2 py-1 pr-1 pl-4 first:border-t-0">
                  <span className="min-w-0 flex-1 text-sm font-semibold break-words">{subNome(i) || 'Sem substância'} · {doseDaLinha(i)} · {descreverFrequencia(frequenciaDe(i), i.horarios)}</span>
                  <button type="button" className="link px-2 text-sm" onClick={() => editarLinha(k)}>Editar</button>
                  {r.itens.length > 1 && (
                    <button type="button" className="link px-2 text-sm text-erro" onClick={() => rascunho.mudar((x) => ({ itens: x.itens.filter((y) => y.id !== i.id), atual: 0 }))}>Remover</button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="link gap-2 text-sm"
              onClick={() => {
                rascunho.mudar((x) => ({ itens: [...x.itens, itemVazio()], atual: x.itens.length }))
                nav('/novo/substancia', { replace: true })
              }}
            >
              <IcoMais tam={20} /> Adicionar outra substância a este protocolo
            </button>
          </section>
        </div>
      )}

      {r.itens.map((i) => {
        const f = frascoNovoDe(i, r.inicio)
        if (!f) return null
        return (
          <span key={i.id} className="flex items-start gap-2 text-sm font-semibold text-suave">
            <IcoEstoque tam={18} className="mt-0.5 shrink-0 text-acento" />
            {f.status === 'reconstituido'
              ? `Frasco novo: ${fmtNum(f.mgTotal)} mg + ${fmtNum(f.diluenteMl!)} mL, vai para o Estoque como reconstituído.`
              : `Frasco novo: ${fmtNum(f.mgTotal)} mg, vai para o Estoque lacrado.`}
          </span>
        )
      })}

      {confirmar && (
        <Dialogo titulo="Salvar a alteração?" aoFechar={() => setConfirmar(false)}>
          <p className="m-0 text-sm text-suave">Vale a partir de hoje. As doses já registradas continuam com o valor da época.</p>
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

/** Cor do protocolo: bolinhas de 44px; a escolhida tem um sinal de check (não depende só da cor). */
export function SeletorCor({ valor, aoMudar }: { valor: string; aoMudar: (cor: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="cor-titulo" className="text-sm font-bold text-texto">Cor do protocolo</span>
      <div role="radiogroup" aria-labelledby="cor-titulo" className="flex flex-wrap gap-1.5">
        {CORES_PROTOCOLO.map((c) => {
          const sel = c.id === valor
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={c.nome}
              title={c.nome}
              onClick={() => aoMudar(c.id)}
              className={`tocavel flex h-11 w-11 items-center justify-center rounded-full border-2 ${sel ? 'border-texto' : 'border-transparent'}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-sobre-acento" style={{ backgroundColor: c.hex }}>
                {sel && <IcoCheck tam={18} />}
              </span>
            </button>
          )
        })}
      </div>
      <span className="text-sm font-medium text-fraco">Só para reconhecer o cartão de relance. O nome continua aparecendo.</span>
    </div>
  )
}
