// T61 Configurações, T62 Lembretes, M61 agenda (.ics), T63 Backup, M62 restaurar, E72 erro,
// M63/M64 apagar tudo, T64 Sobre, Privacidade, Termos, T65 Minhas substâncias, M65.
import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { repo, useBase, useConfig, type Base } from '../dados/index.ts'
import { aplicarBackup, fmtBytes, lerBackup, montarBackup, nomeArquivoBackup, tamanhoEstimado, TAMANHO_MAX_BACKUP, type PreviaBackup } from '../dados/backup.ts'
import { comTeto, ehCotaCheia, mensagemDeErro } from '../dados/repo.ts'
import { estadoEfetivo, descreverFrequencia, proximosSlots } from '../dominio/agenda.ts'
import { dataBr, diaDe, diaRelativo, difDias, hojeStr, instante } from '../dominio/datas.ts'
import { gerarIcs, TITULO_AGENDA } from '../dominio/ics.ts'
import { nomeProtocolo, nomeSubstancia } from '../dominio/nomes.ts'
import { Cabecalho, Carregando, Dialogo, Nota, Tela } from '../ui/base.tsx'
import { useVoltar } from '../ui/navegar.ts'
import { IcoAlerta, IcoArquivo, IcoDownload, IcoMais, IcoSeta, IcoUpload } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'
import { BotaoAcao } from '../ui/acao.tsx'
import { baixarArquivo } from '../sistema/imagem.ts'
import { avisoDeTeste, permissaoAtual, suporteAviso, temGatilhos, TEXTO_AVISO } from '../sistema/avisos.ts'
import { useInstalacao } from '../sistema/instalar.ts'
import { AvisosBloqueados, PrePermissao, VERSAO_AVISO } from './inicio.tsx'
import { rascunho } from './rascunho.ts'
import type { Substancia } from '../dominio/tipos.ts'

export const VERSAO_APP = '0.1.0 (MVP)'

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">{titulo}</h2>
      <div className="card flex flex-col overflow-hidden">{children}</div>
    </section>
  )
}

function LinhaLink({ to, rotulo, valor, perigo }: { to: string; rotulo: string; valor?: string; perigo?: boolean }) {
  return (
    <Link to={to} className={`flex min-h-[52px] items-center gap-2.5 border-t border-sup2 pr-3 pl-4 text-[15px] font-bold first:border-t-0 ${perigo ? 'text-erro' : ''}`}>
      <span className="flex-1">{rotulo}</span>
      {valor && <span className="text-sm font-semibold text-fraco">{valor}</span>}
      <IcoSeta tam={18} className="text-fraco" />
    </Link>
  )
}

export function Ajustes() {
  const base = useBase()
  const ultimo = useConfig('ultimoBackup')
  const aceite = useConfig('aceite')
  const canais = useConfig('canais')
  const inst = useInstalacao()
  const hoje = hojeStr()
  const dias = ultimo.valor ? difDias(diaDe(new Date(ultimo.valor)), hoje) : null
  const minhas = base?.substancias.filter((s) => !s.arquivada).length ?? 0
  const lembrete = [canais.valor?.notificacao && permissaoAtual() === 'granted' ? 'Notificação' : '', canais.valor?.agenda ? 'Agenda' : '', 'App'].filter(Boolean).join(' · ')
  return (
    <Tela>
      <Cabecalho titulo="Configurações" voltar="/hoje" />
      <Grupo titulo="Lembretes"><LinhaLink to="/ajustes/lembretes" rotulo="Lembretes e agenda" valor={lembrete} /></Grupo>
      <Grupo titulo="Preferências">
        <LinhaLink to="/ajustes/substancias" rotulo="Minhas substâncias" valor={String(minhas)} />
        <div className="flex min-h-[52px] items-center justify-between border-t border-sup2 px-4 text-[15px] font-bold"><span>Unidades</span><span className="text-sm text-fraco">kg · cm</span></div>
        <div className="flex min-h-[52px] items-center justify-between border-t border-sup2 px-4 text-[15px] font-bold"><span>Tema</span><span className="text-sm text-fraco">Escuro</span></div>
      </Grupo>
      <Grupo titulo="Seus dados">
        <LinhaLink to="/ajustes/backup" rotulo="Backup" valor={dias === null ? 'nunca feito' : dias === 0 ? 'hoje' : `há ${dias} dia${dias > 1 ? 's' : ''}`} />
        <LinhaLink to="/instalar" rotulo="Instalar na tela inicial" valor={inst.instalado ? 'instalado' : ''} />
      </Grupo>
      <Grupo titulo="Sobre">
        <LinhaLink to="/sobre" rotulo="Aviso de uso e privacidade" />
        <LinhaLink to="/termos" rotulo="Termos de uso" />
      </Grupo>
      <Grupo titulo="Zona de perigo"><LinhaLink to="/ajustes/apagar" rotulo="Apagar todos os dados" perigo /></Grupo>
      <p className="m-0 text-center text-[13px] text-fraco">Versão {VERSAO_APP}{aceite.valor ? ` · aviso aceito em ${dataBr(diaDe(new Date(aceite.valor.em)))}` : ''}</p>
    </Tela>
  )
}

export function Lembretes() {
  const base = useBase()
  const canais = useConfig('canais')
  const agendaEm = useConfig('agendaGeradaEm')
  const toast = useToast()
  const [dialogo, setDialogo] = useState<null | 'pre' | 'bloq'>(null)
  const [, forcar] = useState(0)
  if (!base || !canais.carregado) return <Tela><Carregando /></Tela>
  const sup = suporteAviso()
  const perm = permissaoAtual()
  const notifLigada = !!canais.valor?.notificacao && perm === 'granted'
  const hoje = hojeStr()
  const visiveis = base.protocolos.filter((p) => estadoEfetivo(p, hoje) !== 'encerrado')
  const proximos = proximosSlots(base.protocolos.filter((p) => p.lembretes), base.itens, new Date(), 6)
  const setCanal = async (c: Partial<{ agenda: boolean; notificacao: boolean }>) => {
    try {
      await repo.setConfig('canais', { agenda: false, notificacao: false, ...canais.valor, ...c })
    } catch (e) {
      toast({ tipo: 'info', titulo: 'Não deu para gravar a escolha', texto: mensagemDeErro(e) })
    }
  }
  return (
    <Tela>
      <Cabecalho titulo="Lembretes" voltar />
      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">Como você é avisado</h2>
        <div className="card flex flex-col">
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <b className="text-[15px]">Dentro do app</b>
            <span className="text-[13px] text-fraco">Sempre ligado. A tela Hoje mostra o que falta e, com o app aberto, aparece um aviso na hora.</span>
          </div>
          <Link to="/ajustes/agenda" className="flex items-center gap-2 border-t border-sup2 px-4 py-3">
            <span className="flex flex-1 flex-col gap-0.5">
              <b className="text-[15px]">Agenda do celular</b>
              <span className="text-[13px] text-fraco">{agendaEm.valor ? `Arquivo gerado em ${dataBr(diaDe(new Date(agendaEm.valor)))} · refazer se mudar algo` : 'Avisa mesmo com o app fechado. Gere o arquivo.'}</span>
            </span>
            <IcoSeta tam={18} className="text-fraco" />
          </Link>
          <div className="flex flex-col gap-2 border-t border-sup2 px-4 py-3">
            <b className="text-[15px]">Notificação no aparelho</b>
            <span className="text-[13px] text-fraco">
              {notifLigada
                ? `Ligada neste aparelho · texto: “${TEXTO_AVISO}”`
                : sup === 'ios-sem-instalar'
                  ? 'No iPhone, só funciona com o app instalado na Tela de Início.'
                  : sup === 'sem-suporte'
                    ? 'Este navegador não mostra notificações de apps da web.'
                    : perm === 'denied'
                      ? 'Bloqueada nas configurações do aparelho.'
                      : 'Desligada.'}
            </span>
            {notifLigada ? (
              <div className="flex flex-wrap gap-x-4">
                <button type="button" className="link" onClick={async () => toast(await avisoDeTeste() ? { titulo: 'Aviso de teste enviado', texto: 'Confira a barra de notificações' } : { tipo: 'info', titulo: 'Não deu para mostrar o aviso' })}>Enviar um aviso de teste</button>
                <button type="button" className="link text-suave" onClick={() => setCanal({ notificacao: false })}>Desligar</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-4">
                {perm !== 'denied' && sup === 'ok' && <button type="button" className="link" onClick={() => setDialogo('pre')}>Ativar neste aparelho</button>}
                <button type="button" className="link" onClick={() => setDialogo('bloq')}>Os avisos não chegam?</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2 rounded-xl bg-aviso-fundo p-4 text-sm leading-relaxed text-aviso-texto">
        <b className="flex items-center gap-2"><IcoAlerta tam={18} /> Limite desta versão (sem servidor)</b>
        <span>A notificação é criada pelo próprio aparelho, sem servidor. Por isso ela só chega com o app aberto ou aberto há pouco tempo. <b>Com o app fechado, o aviso não é garantido</b> (isso exige um servidor de avisos, previsto para uma próxima versão).</span>
        <span>Para não esquecer com o app fechado, use a <b>agenda do celular</b>: ela avisa sempre, mesmo sem internet.</span>
        {temGatilhos() && <span>Este navegador permite agendar avisos no aparelho: as doses das próximas 24 h ficam agendadas ao abrir o app.</span>}
      </div>

      {visiveis.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">Por protocolo</h2>
          <div className="card flex flex-col">
            {visiveis.map((p) => (
              <label key={p.id} className="flex min-h-[52px] items-center justify-between gap-3 border-t border-sup2 px-4 first:border-t-0">
                <span className="text-[15px] font-bold break-words">{nomeProtocolo(p, base.itens, base.subs)}{estadoEfetivo(p, hoje) === 'pausado' && <span className="font-medium text-fraco"> · em pausa</span>}</span>
                <input type="checkbox" role="switch" className="h-6 w-6 shrink-0" checked={p.lembretes} onChange={(e) => { const v = e.target.checked; repo.lembretesProtocolo(p.id, v).then(() => forcar((x) => x + 1), (err: unknown) => toast({ tipo: 'info', titulo: 'Não deu para mudar o lembrete', texto: mensagemDeErro(err) })) }} />
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">Próximos avisos</h2>
        <p className="m-0 text-[13px] text-fraco">No horário deste aparelho. Se você mudar de fuso, os avisos acompanham o relógio do aparelho.</p>
        {proximos.length === 0 && <p className="m-0 text-sm text-suave">Nenhum aviso previsto.</p>}
        {proximos.map((s) => (
          <div key={s.chave + s.itemId} className="flex min-h-11 items-center justify-between border-b border-sup2 text-[15px]">
            <span>{diaRelativo(s.dia, hoje)} · <b>{nomeSubstancia(s.substanciaId, base.subs)}</b></span>
            <b>{s.horario}</b>
          </div>
        ))}
      </section>

      {dialogo === 'pre' && (
        <PrePermissao
          aoFechar={() => setDialogo(null)}
          aoTerminar={(r) => {
            if (r === 'ativado') {
              setDialogo(null)
              toast({ titulo: 'Avisos ativados', texto: 'Neste aparelho' })
            } else setDialogo('bloq')
          }}
        />
      )}
      {dialogo === 'bloq' && <AvisosBloqueados aoFechar={() => setDialogo(null)} />}
    </Tela>
  )
}

export function Agenda() {
  const base = useBase()
  const toast = useToast()
  const voltarOu = useVoltar()
  const [fora, setFora] = useState<Set<string>>(new Set())
  const [dias, setDias] = useState(60)
  if (!base) return <Tela><Carregando /></Tela>
  const hoje = hojeStr()
  const lista = base.protocolos.filter((p) => estadoEfetivo(p, hoje) !== 'encerrado')
  const gerar = async () => {
    const incl = lista.filter((p) => !fora.has(p.id))
    const slots = proximosSlots(incl, base.itens, new Date(), 1500, dias).filter((s) => difDias(hoje, s.dia) < dias)
    const ics = gerarIcs(slots.map((s) => ({ inicio: instante(s.dia, s.horario), uid: `${s.itemId}-${s.chave.replace(/\D/g, '')}@peptide-tracker` })))
    baixarArquivo(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'lembretes.ics')
    await repo.setConfig('agendaGeradaEm', new Date().toISOString())
    const c = (await repo.getConfig('canais')) ?? { agenda: false, notificacao: false }
    await repo.setConfig('canais', { ...c, agenda: true })
    toast({ titulo: 'Arquivo da agenda gerado', texto: `${slots.length} lembretes · abra o arquivo baixado` })
    voltarOu('/ajustes')
  }
  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo="Lembrar pela agenda" voltar />
      <p className="m-0 text-[15px] leading-relaxed text-suave">Vamos gerar um arquivo com os horários e um alarme. Abra o arquivo e confirme na agenda do celular. Funciona mesmo com o app fechado e sem internet.</p>
      {lista.length === 0 ? (
        <Nota>Você ainda não tem protocolo ativo. Crie um protocolo e volte aqui.</Nota>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">Incluir</h2>
          <div className="card flex flex-col">
            {lista.map((p) => (
              <label key={p.id} className="flex min-h-[56px] items-center gap-3 border-t border-sup2 px-4 py-2 first:border-t-0">
                <input type="checkbox" className="h-6 w-6 shrink-0" checked={!fora.has(p.id)} onChange={(e) => { const n = new Set(fora); if (e.target.checked) n.delete(p.id); else n.add(p.id); setFora(n) }} />
                <span className="flex flex-col">
                  <b className="text-[15px]">{nomeProtocolo(p, base.itens, base.subs)}</b>
                  <span className="text-[13px] text-fraco">{base.itens.filter((i) => i.protocoloId === p.id).map((i) => descreverFrequencia(i.frequencia, i.horarios)).join('; ')}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}
      <label className="rotulo">
        Período
        <select className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={30}>Próximos 30 dias</option>
          <option value={60}>Próximos 60 dias</option>
          <option value={90}>Próximos 90 dias</option>
        </select>
      </label>
      <div className="card flex flex-col gap-1 p-4">
        <span className="text-[13px] text-fraco">Título na agenda</span>
        <b className="text-lg">{TITULO_AGENDA}</b>
        <span className="text-[13px] text-fraco">O nome da substância não aparece na agenda.</span>
      </div>
      <Nota tipo="aviso">Se mudar horários ou pausar, gere o arquivo de novo e apague os eventos antigos na agenda.</Nota>
      <button type="button" className="btn-primario mt-auto" disabled={lista.length === fora.size} onClick={gerar}><IcoDownload tam={20} /> Gerar arquivo da agenda</button>
    </Tela>
  )
}

/** Escolher arquivo + M62 + E72. Usado no Backup (T63) e no primeiro acesso. */
function Restaurador({ aoRestaurar, children }: { aoRestaurar: (p: PreviaBackup) => void; children: (abrir: () => void) => ReactNode }) {
  const input = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState<PreviaBackup | null>(null)
  const [erro, setErro] = useState<{ nome: string; msg: string } | null>(null)
  const [restaurando, setRestaurando] = useState(false)
  const nav = useNavigate()
  const ler = async (f: File | undefined) => {
    if (!f) return
    try {
      if (f.size > TAMANHO_MAX_BACKUP) throw new Error('O arquivo é grande demais para um backup deste app.')
      setPrevia(lerBackup(await f.text()))
    } catch (e) {
      setErro({ nome: f.name, msg: e instanceof Error && e.message ? e.message : 'O arquivo não é um backup deste app.' })
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" hidden data-testid="arquivo-backup" onChange={(e) => ler(e.target.files?.[0])} />
      {children(() => input.current?.click())}
      {previa && (
        <Dialogo titulo="Restaurar este backup?" aoFechar={() => setPrevia(null)}>
          <div className="flex flex-col gap-1 rounded-xl bg-sup2 p-4">
            <b className="text-base">Backup de {previa.exportadoEm ? dataBr(diaDe(new Date(previa.exportadoEm))) : 'data desconhecida'}</b>
            <span className="text-sm text-suave">
              {previa.contagens.protocolos} protocolo(s) · {previa.contagens.aplicacoes} registro(s) de dose · {previa.contagens.medicoes} medição(ões) · {previa.contagens.frascos} frasco(s) · {previa.contagens.fotos} foto(s)
            </span>
          </div>
          <p className="m-0 text-[15px] text-suave">Os dados deste aparelho serão trocados pelos do arquivo.{previa.tinhaNotificacao ? ' Depois, ative os avisos de novo neste aparelho.' : ''}</p>
          <button
            type="button"
            className="btn-primario"
            disabled={restaurando}
            onClick={async () => {
              setRestaurando(true)
              try {
                await comTeto(aplicarBackup(repo, previa), 120_000)
                const p = previa
                setPrevia(null)
                aoRestaurar(p)
              } catch (e) {
                setPrevia(null)
                setErro({
                  nome: '',
                  msg: ehCotaCheia(e)
                    ? 'O espaço do app neste aparelho não é suficiente para este backup. Libere espaço ou use um backup sem fotos.'
                    : mensagemDeErro(e),
                })
              } finally {
                setRestaurando(false)
              }
            }}
          >
            {restaurando ? 'Restaurando…' : 'Restaurar'}
          </button>
          <button type="button" className="btn-secundario" onClick={() => { setPrevia(null); nav('/ajustes/backup') }}>Salvar os atuais antes</button>
          <button type="button" className="btn-texto" onClick={() => setPrevia(null)}>Cancelar</button>
        </Dialogo>
      )}
      {erro && (
        <Dialogo titulo="Não conseguimos ler este arquivo" aoFechar={() => setErro(null)} icone={<IcoAlerta className="text-aviso" tam={28} />}>
          <p className="m-0 text-[15px] text-suave">{erro.msg} Nenhum dado seu foi alterado.</p>
          {erro.nome && <p className="m-0 text-sm text-fraco">Arquivo: {erro.nome}</p>}
          <p className="m-0 text-sm text-fraco">Confira se escolheu o arquivo exportado pelo app, sem renomear nem abrir em outro programa.</p>
          <button type="button" className="btn-primario" onClick={() => { setErro(null); input.current?.click() }}>Escolher outro arquivo</button>
          <button type="button" className="btn-texto" onClick={() => setErro(null)}>Fechar</button>
        </Dialogo>
      )}
    </>
  )
}

export function Backup() {
  const ultimo = useConfig('ultimoBackup')
  const toast = useToast()
  const nav = useNavigate()
  const [fotos, setFotos] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const est = useLiveQuery(() => tamanhoEstimado(repo, fotos), [fotos])
  const exportar = async () => {
    setExportando(true)
    try {
      const arq = await montarBackup(repo, fotos)
      baixarArquivo(new Blob([JSON.stringify(arq)], { type: 'application/json' }), nomeArquivoBackup())
      await repo.setConfig('ultimoBackup', new Date().toISOString())
      await repo.delConfig('backupAdiadoAte')
      toast({ titulo: 'Backup exportado', texto: `${arq.fotos.length} foto(s) incluídas · confira a pasta de downloads` })
    } catch {
      toast({ tipo: 'info', titulo: 'Não deu para exportar', texto: fotos ? 'Tente sem as fotos (arquivo menor).' : 'Tente de novo.' })
    } finally {
      setExportando(false)
    }
  }
  return (
    <Tela>
      <Cabecalho titulo="Backup" voltar />
      <p className="m-0 text-[15px] leading-relaxed text-suave">Sem conta, seus dados existem só neste aparelho. Uma cópia salva protege contra perda ou troca de celular.</p>
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <b className="text-lg">Salvar uma cópia</b>
          <span className="text-[13px] text-fraco">Última: {ultimo.valor ? dataBr(diaDe(new Date(ultimo.valor))) : 'nunca'}</span>
        </div>
        <span className="text-sm text-suave">Protocolos, doses, medições, frascos e fotos em um arquivo.</span>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] bg-fundo px-3 text-sm">
          <span className="text-suave">Tamanho estimado</span>
          <b>{est ? fmtBytes(est.bytes) : '…'} · {est?.fotos ?? 0} foto{est?.fotos === 1 ? '' : 's'}</b>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-6 w-6 shrink-0" checked={fotos} onChange={(e) => setFotos(e.target.checked)} />
          <b className="text-[15px]">Incluir fotos</b>
          <span className="text-[13px] font-semibold text-fraco">(desmarque se o arquivo ficar grande)</span>
        </label>
        <button type="button" className="btn-primario" disabled={exportando} onClick={exportar}><IcoDownload tam={20} /> {exportando ? 'Exportando…' : 'Exportar backup'}</button>
      </section>
      <Nota tipo="aviso">Exportar é sempre liberado. O arquivo tem seus dados de saúde e fotos. Guarde em um lugar só seu e não compartilhe.</Nota>
      <section className="card flex flex-col gap-3 p-4">
        <b className="text-lg">Restaurar de um arquivo</b>
        <span className="text-sm text-suave">Use ao trocar de celular. Você vê o conteúdo antes de confirmar.</span>
        <Restaurador aoRestaurar={() => { toast({ titulo: 'Backup restaurado' }); nav('/hoje', { replace: true }) }}>
          {(abrir) => <button type="button" className="btn-secundario" onClick={abrir}><IcoUpload tam={20} /> Escolher arquivo</button>}
        </Restaurador>
        <button type="button" className="link self-start" aria-expanded={ajuda} onClick={() => setAjuda(!ajuda)}>O arquivo não abre?</button>
        {ajuda && (
          <p className="m-0 text-[13px] leading-relaxed text-suave">
            Use o arquivo .json exportado por este app, sem abrir nem salvar em outro programa. No celular, ele costuma estar em Downloads ou na pasta onde você guardou. Arquivos de outra versão mais nova do app pedem que você atualize primeiro.
          </p>
        )}
      </section>
    </Tela>
  )
}

/** Restaurar a partir do primeiro acesso (T01) ou do Hoje vazio. */
export function RestaurarInicio() {
  const nav = useNavigate()
  const aceite = useConfig('aceite')
  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo="Restaurar backup" voltar />
      <p className="m-0 text-[15px] leading-relaxed text-suave">Escolha o arquivo de backup exportado pelo app (termina em .json). Você vê o conteúdo antes de confirmar.</p>
      <Nota>Nada sai do aparelho: o arquivo é lido aqui mesmo.</Nota>
      <Restaurador aoRestaurar={() => nav(aceite.valor ? '/hoje' : '/aviso?depois=hoje', { replace: true })}>
        {(abrir) => <button type="button" className="btn-primario mt-auto" onClick={abrir}><IcoUpload tam={20} /> Escolher arquivo</button>}
      </Restaurador>
    </Tela>
  )
}

export function ApagarTudo() {
  const nav = useNavigate()
  const voltarOu = useVoltar()
  const [passo, setPasso] = useState<1 | 2>(1)
  const [texto, setTexto] = useState('')
  const c = useLiveQuery(() => repo.contagens())
  if (!c) return <Tela><Carregando /></Tela>
  return (
    <Tela className="min-h-dvh">
      <Cabecalho titulo={passo === 1 ? 'Apagar todos os dados?' : 'Última confirmação'} voltar />
      {passo === 1 ? (
        <>
          <p className="m-0 text-[15px] text-suave">Isto apaga deste aparelho, sem volta:</p>
          <ul className="m-0 flex flex-col gap-2 pl-5 text-[15px] leading-relaxed">
            <li>{c.protocolos} protocolo(s) e {c.aplicacoes} registro(s) de dose</li>
            <li>{c.medicoes} medição(ões) e {c.fotos} foto(s)</li>
            <li>{c.frascos} frasco(s), {c.substancias} substância(s) e o aceite do aviso</li>
          </ul>
          <div className="mt-auto flex flex-col gap-2">
            <Link to="/ajustes/backup" className="btn-primario">Salvar backup antes</Link>
            <button type="button" className="btn-neutro text-erro" onClick={() => setPasso(2)}>Continuar para apagar</button>
            <button type="button" className="btn-texto" onClick={() => voltarOu('/ajustes')}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[15px] leading-relaxed text-suave">Não dá para desfazer. Depois disso o app volta ao início, como se fosse o primeiro uso.</p>
          <label className="rotulo text-sm">
            Digite APAGAR para confirmar
            <input className="campo" autoCapitalize="characters" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <div className="mt-auto flex flex-col gap-2">
            <BotaoAcao
              className="btn-perigo"
              ocupadoTexto="Apagando…"
              disabled={texto.trim().toUpperCase() !== 'APAGAR'}
              acao={async () => {
                await repo.apagarTudo()
                rascunho.limpar()
                nav('/boas-vindas', { replace: true })
              }}
            >
              Apagar tudo
            </BotaoAcao>
            <button type="button" className="btn-texto" onClick={() => nav('/ajustes')}>Cancelar</button>
          </div>
        </>
      )}
    </Tela>
  )
}

export function Sobre() {
  const aceite = useConfig('aceite')
  return (
    <Tela>
      <Cabecalho titulo="Sobre e avisos" voltar />
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-[17px] font-bold">Aviso de uso</h2>
        <p className="m-0 text-[15px] leading-relaxed text-suave">Este app é só um registro pessoal. Não faz diagnóstico, não prescreve e não substitui a orientação de um profissional de saúde. As informações e decisões são suas.</p>
        <span className="text-[13px] text-fraco">{aceite.valor ? `Aceito em ${dataBr(diaDe(new Date(aceite.valor.em)))} · versão ${aceite.valor.versao} · uso por maiores de 18 anos` : `Versão do aviso ${VERSAO_AVISO}`}</span>
      </section>
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-[17px] font-bold">Privacidade</h2>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] text-suave">
          <li>Seus dados ficam só neste aparelho.</li>
          <li>Não há conta, servidor, anúncio nem rastreamento de uso.</li>
          <li>Você pode exportar ou apagar tudo quando quiser.</li>
        </ul>
        <Link to="/privacidade" className="link">Ler a política completa</Link>
        <Link to="/termos" className="link">Ler os termos de uso</Link>
      </section>
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-[17px] font-bold">O que o app não faz</h2>
        <p className="m-0 text-[15px] text-suave">Não sugere substâncias, doses ou protocolos, não vende produtos e não indica fornecedores.</p>
      </section>
      <p className="m-0 text-center text-[13px] text-fraco">Peptide Tracker (nome provisório) · versão {VERSAO_APP} · [CONTATO]</p>
    </Tela>
  )
}

function TextoLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Tela>
      <Cabecalho titulo={titulo} voltar />
      <Nota tipo="aviso">Texto provisório. Precisa de revisão jurídica antes do lançamento.</Nota>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-suave [&_h2]:mt-2 [&_h2]:text-[17px] [&_h2]:font-bold [&_h2]:text-texto">{children}</div>
    </Tela>
  )
}

export function Privacidade() {
  return (
    <TextoLegal titulo="Política de privacidade">
      <h2>1. Quem somos</h2>
      <p className="m-0">[NOME DO APP] é um diário pessoal. Responsável: [NOME/EMPRESA]. Contato: [CONTATO].</p>
      <h2>2. Que dados o app guarda</h2>
      <p className="m-0">Tudo o que você digita (substâncias, doses, horários, frascos, peso, medidas, observações) e as fotos que você adiciona. São dados de saúde, considerados sensíveis pela LGPD.</p>
      <h2>3. Onde ficam</h2>
      <p className="m-0">Só neste aparelho, no armazenamento do navegador. Esta versão não tem servidor, conta ou login: nada é enviado para nós nem para terceiros. Não usamos anúncios nem rastreamento.</p>
      <h2>4. Backup</h2>
      <p className="m-0">Ao exportar, o app gera um arquivo com seus dados e fotos. Você decide onde guardar. Quem tiver o arquivo consegue ver o conteúdo.</p>
      <h2>5. Avisos e agenda</h2>
      <p className="m-0">As notificações são criadas pelo próprio aparelho, com texto genérico. O arquivo de agenda usa só o título “Lembrete”.</p>
      <h2>6. Seus direitos</h2>
      <p className="m-0">Você pode ver, exportar e apagar tudo a qualquer momento em Configurações → Apagar todos os dados.</p>
    </TextoLegal>
  )
}

export function Termos() {
  return (
    <TextoLegal titulo="Termos de uso">
      <h2>1. Para que serve</h2>
      <p className="m-0">O app é um registro pessoal do que você decide usar. Não faz diagnóstico, não prescreve e não substitui orientação de profissional de saúde.</p>
      <h2>2. Idade</h2>
      <p className="m-0">Uso permitido apenas para maiores de 18 anos.</p>
      <h2>3. Suas informações</h2>
      <p className="m-0">Substâncias, doses e datas são informadas por você. As contas (concentração, unidades na seringa, saldo) só convertem os números que você digitou. Confira sempre.</p>
      <h2>4. O que o app não faz</h2>
      <p className="m-0">Não recomenda substâncias, doses ou protocolos, não vende produtos e não indica fornecedores. A lista de nomes é só para facilitar a digitação.</p>
      <h2>5. Dados e backup</h2>
      <p className="m-0">Os dados ficam no seu aparelho. Se o app for apagado ou o navegador limpar os dados sem um backup, eles não voltam.</p>
      <h2>6. Avisos de dose</h2>
      <p className="m-0">Nesta versão, as notificações dependem do app aberto ou aberto há pouco. Não garantimos o aviso com o app fechado; use também a agenda do celular.</p>
    </TextoLegal>
  )
}

function usoDe(base: Base, s: Substancia) {
  const itens = base.itens.filter((i) => i.substanciaId === s.id)
  const prots = base.protocolos.filter((p) => itens.some((i) => i.protocoloId === p.id))
  return {
    prots,
    ativos: prots.filter((p) => p.estado !== 'encerrado'),
    frascos: base.frascos.filter((f) => f.substanciaId === s.id).length,
    regs: base.aplicacoes.filter((a) => a.substanciaId === s.id).length,
  }
}

export function Substancias() {
  const base = useBase()
  const nav = useNavigate()
  const toast = useToast()
  const [verArq, setVerArq] = useState(false)
  const [alvo, setAlvo] = useState<Substancia | null>(null)
  if (!base) return <Tela><Carregando /></Tela>
  const ativas = base.substancias.filter((s) => !s.arquivada).sort((a, b) => a.nome.localeCompare(b.nome))
  const arquivadas = base.substancias.filter((s) => s.arquivada)
  const linha = (s: Substancia) => {
    const u = usoDe(base, s)
    const emUso = u.prots.length + u.frascos + u.regs > 0
    return (
      <div key={s.id} className="flex min-h-[60px] items-center gap-1 border-t border-sup2 py-1.5 pr-1 pl-4 first:border-t-0">
        <button type="button" className="flex flex-1 flex-col items-start gap-0.5 text-left" onClick={() => nav(s.tipo === 'blend' ? `/novo/blend?id=${s.id}` : `/novo/criar?editar=${s.id}&volta=1`)}>
          <b className="text-[15px] break-words">{s.nome}</b>
          <span className="text-[13px] text-fraco">{s.tipo === 'blend' ? (s.origem === 'lista' ? 'Blend da lista' : 'Blend') : 'Simples'} · {emUso ? 'em uso' : 'sem uso'}</span>
        </button>
        {s.arquivada ? (
          <BotaoAcao className="link px-3 disabled:opacity-60" acao={async () => { await repo.arquivarSubstancia(s.id, false); toast({ titulo: 'Substância reativada', texto: s.nome }) }}>Reativar</BotaoAcao>
        ) : (
          <button type="button" aria-label={`Arquivar ou apagar ${s.nome}`} className="icone-btn text-fraco" onClick={() => setAlvo(s)}><IcoArquivo tam={20} /></button>
        )}
      </div>
    )
  }
  const criadas = ativas.filter((s) => s.origem === 'usuario')
  const daLista = ativas.filter((s) => s.origem === 'lista')
  const u = alvo ? usoDe(base, alvo) : null
  const emUso = !!u && u.prots.length + u.frascos + u.regs > 0
  return (
    <Tela>
      <Cabecalho titulo="Minhas substâncias" voltar direita={<Link to="/novo/criar?volta=1" aria-label="Nova substância" className="icone-btn bg-acento text-sobre-acento"><IcoMais /></Link>} />
      <p className="m-0 text-sm text-fraco">O que você criou ou já usou. Aparece primeiro nas buscas. Só nomes: nenhuma dose vem pronta.</p>
      {ativas.length === 0 && <Nota>Nenhuma substância ainda. Elas aparecem aqui quando você cria um protocolo ou um frasco.</Nota>}
      {criadas.length > 0 && <section className="flex flex-col gap-2"><h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">Criadas por você</h2><div className="card flex flex-col">{criadas.map(linha)}</div></section>}
      {daLista.length > 0 && <section className="flex flex-col gap-2"><h2 className="text-[13px] font-bold tracking-wide text-fraco uppercase">Da lista, já usadas</h2><div className="card flex flex-col">{daLista.map(linha)}</div></section>}
      {arquivadas.length > 0 && (
        <>
          <button type="button" className="link" aria-expanded={verArq} onClick={() => setVerArq(!verArq)}>Arquivadas ({arquivadas.length})</button>
          {verArq && <div className="card flex flex-col">{arquivadas.map(linha)}</div>}
        </>
      )}
      {alvo && u && (
        <Dialogo titulo={emUso ? `“${alvo.nome}” está em uso` : `Arquivar ou apagar “${alvo.nome}”?`} aoFechar={() => setAlvo(null)}>
          {emUso ? (
            <>
              <ul className="m-0 flex flex-col gap-1 pl-5 text-[15px] text-suave">
                {u.prots.length > 0 && <li>{u.prots.length} protocolo(s){u.ativos.length ? ` (${u.ativos.length} ativo/pausado)` : ''}</li>}
                {u.frascos > 0 && <li>{u.frascos} frasco(s) no estoque</li>}
                {u.regs > 0 && <li>{u.regs} registro(s) de dose</li>}
              </ul>
              <p className="m-0 text-sm text-fraco">Arquivar tira das buscas e mantém o histórico. Para apagar de vez, encerre o protocolo, remova o frasco e apague os registros antes.</p>
            </>
          ) : (
            <p className="m-0 text-[15px] text-suave">Ela não está em uso. Arquivar tira das buscas; apagar remove de vez.</p>
          )}
          <BotaoAcao className="btn-primario" ocupadoTexto="Arquivando…" acao={async () => { await repo.arquivarSubstancia(alvo.id); setAlvo(null); toast({ tipo: 'info', titulo: 'Substância arquivada', texto: alvo.nome, desfazer: () => repo.arquivarSubstancia(alvo.id, false) }) }}>Arquivar</BotaoAcao>
          <BotaoAcao className="btn-neutro text-erro" ocupadoTexto="Apagando…" disabled={emUso} acao={async () => { await repo.apagarSubstancia(alvo.id); setAlvo(null); toast({ tipo: 'info', titulo: 'Substância apagada', texto: alvo.nome }) }}>
            {emUso ? 'Apagar (indisponível em uso)' : 'Apagar'}
          </BotaoAcao>
          <button type="button" className="btn-texto" onClick={() => setAlvo(null)}>Cancelar</button>
        </Dialogo>
      )}
    </Tela>
  )
}

