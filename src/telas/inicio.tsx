// T01 Boas-vindas com o aviso 18+, E02 Saída, T03 Instalar, M04 pedido de avisos (depois do 1º protocolo),
// N04 convite para instalar (depois do 1º registro), M05 pré-permissão, E01 bloqueado.
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { repo, useConfig } from '../dados/index.ts'
import { Dialogo, Nota, Tela } from '../ui/base.tsx'
import { useVoltar } from '../ui/navegar.ts'
import { IcoAlerta, IcoCalendario, IcoCelular, IcoCompartilhar, IcoEscudo, IcoSino, IcoVoltar } from '../ui/icones.tsx'
import { useInstalacao } from '../sistema/instalar.ts'
import { TEXTO_AVISO, pedirPermissao, suporteAviso } from '../sistema/avisos.ts'
import { useToast } from '../ui/toast.tsx'
import { temAcesso } from '../plano.ts'
import { hojeStr } from '../dominio/datas.ts'

export const VERSAO_AVISO = '1'

/**
 * T01 Boas-vindas + aviso 18+ numa tela só: o que o app é, o aceite (2 caixas; grava data e versão)
 * e "Começar" (vai direto ao 1º passo do protocolo). "Pular, ver o app primeiro" aceita e vai para a
 * Hoje vazia. "Não aceito" vai para a saída sem gravar nada.
 */
export function BoasVindas() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [maior, setMaior] = useState(false)
  const [entendi, setEntendi] = useState(false)
  const [gravando, setGravando] = useState(false)
  const pode = maior && entendi && !gravando
  const aceitar = async (paraHoje: boolean) => {
    setGravando(true)
    await repo.setConfig('aceite', { versao: VERSAO_AVISO, em: new Date().toISOString() })
    if (!(await repo.getConfig('primeiroUso'))) await repo.setConfig('primeiroUso', hojeStr())
    // depois de restaurar um backup (depois=hoje) os protocolos já existem: vai direto para a Hoje
    nav(paraHoje || params.get('depois') === 'hoje' ? '/hoje' : '/novo?saida=/hoje', { replace: true })
  }
  return (
    <Tela className="min-h-dvh">
      <div className="flex flex-col gap-4 pt-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-selecionado text-acento">
          <IcoEscudo tam={30} />
        </span>
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Seu diário de protocolos</h1>
        <p className="m-0 text-lg leading-relaxed text-suave">
          Registre doses, horários e frascos. Tudo fica só neste aparelho, sem conta e sem login.
        </p>
      </div>
      <section aria-labelledby="t-aviso" className="flex flex-col gap-2 text-base leading-relaxed text-suave">
        <h2 id="t-aviso" className="text-lg font-bold text-texto">Antes de começar</h2>
        <p className="m-0">
          Este app é <b className="text-texto">só um registro pessoal</b>. Ele não faz diagnóstico, não prescreve e não substitui a orientação de um profissional de saúde.
        </p>
        <p className="m-0">Substâncias, doses e datas são informadas por você. As decisões são suas.</p>
        <p className="m-0">Nada é enviado para servidor.</p>
      </section>
      <div className="flex flex-col gap-2">
        {[
          { v: maior, s: setMaior, t: 'Tenho 18 anos ou mais' },
          { v: entendi, s: setEntendi, t: 'Entendi que o app é só um registro pessoal' },
        ].map((c) => (
          <label key={c.t} className="card flex min-h-14 items-center gap-3 px-4 text-base font-semibold">
            <input type="checkbox" checked={c.v} onChange={(e) => c.s(e.target.checked)} className="h-6 w-6 shrink-0" />
            {c.t}
          </label>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <button type="button" className="btn-primario" disabled={!pode} onClick={() => void aceitar(false)}>Começar</button>
        {!(maior && entendi) && <span className="text-center text-sm text-fraco">Marque as duas opções</span>}
        <button type="button" className="btn-texto" disabled={!pode} onClick={() => void aceitar(true)}>Pular, ver o app primeiro</button>
        <div className="flex flex-wrap justify-center gap-x-5">
          <Link to="/privacidade" className="link text-sm">Privacidade</Link>
          <Link to="/termos" className="link text-sm">Termos de uso</Link>
          <Link to="/saida" replace className="link text-sm text-suave">Não aceito</Link>
        </div>
        <Link to="/restaurar" className="btn-texto text-sm text-suave">Já uso: restaurar backup</Link>
      </div>
    </Tela>
  )
}

/** Endereço antigo do aviso (/aviso, /aviso?depois=hoje): agora é a mesma tela das boas-vindas. */
export function AvisoAntigo() {
  const { search } = useLocation()
  return <Navigate to={`/boas-vindas${search}`} replace />
}

export function Saida() {
  return (
    <Tela className="min-h-dvh justify-center text-center">
      <h1 className="text-[30px] font-extrabold">Tudo bem</h1>
      <p className="m-0 text-base leading-relaxed text-suave">Sem o aceite, o app não pode ser usado. Nada foi salvo neste aparelho.</p>
      <p className="m-0 text-sm text-fraco">Você já pode fechar esta janela.</p>
      <Link to="/boas-vindas" className="btn-texto">Voltar ao início</Link>
    </Tela>
  )
}

export function Instalar() {
  const voltarOu = useVoltar()
  const inst = useInstalacao()
  const [aba, setAba] = useState<'ios' | 'android'>(inst.ios ? 'ios' : 'android')
  const toast = useToast()
  const seguir = () => {
    void repo.setConfig('conviteInstalar', 'respondido')
    voltarOu('/hoje')
  }

  return (
    <Tela className="min-h-dvh">
      <button type="button" onClick={() => voltarOu('/hoje')} aria-label="Voltar" className="icone-btn -ml-2.5"><IcoVoltar /></button>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-extrabold">Coloque o app na tela inicial</h1>
        <p className="m-0 text-base leading-relaxed text-suave">Assim ele abre como um app, funciona sem internet e seus dados ficam mais protegidos.</p>
      </div>
      {inst.instalado ? (
        <Nota>O app já está instalado neste aparelho.</Nota>
      ) : (
        <>
          <div role="tablist" aria-label="Sistema" className="grid grid-cols-2 gap-2">
            {(['ios', 'android'] as const).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={aba === a} className="chip w-full" aria-pressed={aba === a} onClick={() => setAba(a)}>
                {a === 'ios' ? 'iPhone' : 'Android e PC'}
              </button>
            ))}
          </div>
          {aba === 'ios' ? (
            <div className="card flex flex-col gap-4 p-4">
              <p className="m-0 text-sm text-suave">A Apple não permite instalar com um botão. São 3 toques, só desta vez.</p>
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm font-semibold">
                <li className="flex gap-3"><b className="text-acento">1</b><span>No Safari, toque em Compartilhar <IcoCompartilhar tam={18} className="inline align-[-3px]" /> (quadrado com seta)</span></li>
                <li className="flex gap-3"><b className="text-acento">2</b><span>Escolha “Adicionar à Tela de Início”</span></li>
                <li className="flex gap-3"><b className="text-acento">3</b><span>Abra o app pelo novo ícone</span></li>
              </ol>
              <Nota tipo="aviso">No iPhone, os avisos de dose só funcionam com o app instalado, e o Safari pode apagar dados de sites que ficam muito tempo sem uso.</Nota>
            </div>
          ) : (
            <div className="card flex flex-col gap-3 p-4">
              <b className="text-base">Um toque e pronto</b>
              <p className="m-0 text-sm text-suave">Toque em “Instalar aplicativo”. O próprio aparelho pede a confirmação e coloca o ícone na tela inicial.</p>
              <p className="m-0 text-sm text-fraco">Se o botão não funcionar, abra o menu do navegador (3 pontos) e escolha “Instalar app” ou “Adicionar à tela inicial”.</p>
            </div>
          )}
        </>
      )}
      <div className="mt-auto flex flex-col gap-2">
        {!inst.instalado && aba === 'android' && (
          <button
            type="button"
            className="btn-primario"
            onClick={async () => {
              const r = await inst.instalar()
              if (r === 'indisponivel') toast({ tipo: 'info', titulo: 'Use o menu do navegador', texto: 'Menu (3 pontos) → Instalar app' })
              else if (r === 'aceito') seguir()
            }}
          >
            <IcoCelular tam={20} /> Instalar aplicativo
          </button>
        )}
        {(inst.instalado || aba === 'ios') && <button type="button" className="btn-primario" onClick={seguir}>{inst.instalado ? 'Continuar' : 'Já instalei'}</button>}
        {!inst.instalado && <button type="button" className="btn-texto" onClick={seguir}>Agora não</button>}
      </div>
    </Tela>
  )
}

/** M05: explica o aviso antes do pedido do sistema. */
export function PrePermissao({ aoFechar, aoTerminar }: { aoFechar: () => void; aoTerminar: (r: 'ativado' | 'negado' | 'indisponivel') => void }) {
  const [pedindo, setPedindo] = useState(false)
  return (
    <Dialogo titulo="Avisos na hora da dose" aoFechar={aoFechar}>
      <div className="flex flex-col gap-1.5 rounded-xl bg-sup2 p-4">
        <span className="text-xs font-bold tracking-wide text-fraco uppercase">Exemplo do que aparece</span>
        <span className="flex items-center gap-2 text-base font-bold"><IcoSino tam={18} className="text-acento" /> {TEXTO_AVISO}</span>
      </div>
      <ul className="m-0 flex flex-col gap-2 pl-5 text-sm leading-relaxed text-suave">
        <li>O aviso nunca mostra o nome da substância nem a dose.</li>
        <li>Sem servidor e sem conta: o próprio aparelho cria o aviso.</li>
        <li><b className="text-aviso-texto">Limite:</b> o aviso chega com o app aberto ou aberto há pouco. Com o app fechado, use também a agenda do celular.</li>
        <li>Em seguida o aparelho pergunta se pode mostrar notificações. Toque em Permitir.</li>
      </ul>
      <button
        type="button"
        className="btn-primario"
        disabled={pedindo}
        onClick={async () => {
          setPedindo(true)
          if (suporteAviso() !== 'ok') return aoTerminar('indisponivel')
          const r = await pedirPermissao()
          if (r === 'granted') {
            const canais = (await repo.getConfig('canais')) ?? { agenda: false, notificacao: false }
            await repo.setConfig('canais', { ...canais, notificacao: true })
            await repo.delConfig('reativarAvisos')
            aoTerminar('ativado')
          } else aoTerminar(r === 'indisponivel' ? 'indisponivel' : 'negado')
        }}
      >
        Ativar avisos
      </button>
      <button type="button" className="btn-texto" onClick={aoFechar}>Agora não</button>
    </Dialogo>
  )
}

/** E01: avisos bloqueados ou indisponíveis. */
export function AvisosBloqueados({ aoFechar }: { aoFechar: () => void }) {
  const nav = useNavigate()
  const sup = suporteAviso()
  return (
    <Dialogo titulo={sup === 'ios-sem-instalar' ? 'No iPhone, instale o app primeiro' : 'Os avisos do aparelho estão desligados'} aoFechar={aoFechar} icone={<IcoAlerta className="text-aviso" tam={28} />}>
      <p className="m-0 text-base leading-relaxed text-suave">
        {sup === 'ios-sem-instalar'
          ? 'No iPhone, o Safari só mostra avisos de apps adicionados à Tela de Início.'
          : sup === 'sem-suporte'
            ? 'Este navegador não mostra avisos de apps da web.'
            : 'O app não consegue pedir de novo. Para religar: Ajustes do aparelho → navegador ou app → Notificações.'}{' '}
        Você ainda pode ser lembrado pela agenda do celular, que funciona sem internet.
      </p>
      {sup === 'ios-sem-instalar' && <button type="button" className="link" onClick={() => nav('/instalar')}>Ver como instalar</button>}
      <button type="button" className="btn-primario" onClick={() => nav('/ajustes/agenda')}><IcoCalendario tam={20} /> Usar a agenda do celular</button>
      <button type="button" className="btn-texto" onClick={aoFechar}>Agora não</button>
    </Dialogo>
  )
}

/**
 * M04: logo depois de salvar o primeiro protocolo, uma vez só. "Sim" pede a permissão do aparelho
 * (no mesmo toque, como o sistema exige); sem permissão ou sem suporte, leva à agenda do celular (.ics).
 * As duas respostas gravam "respondido": não repete. Continua em Configurações > Lembretes.
 */
export function PedidoAvisos() {
  const pedido = useConfig('pedidoAvisos')
  const { pathname } = useLocation()
  const toast = useToast()
  const [etapa, setEtapa] = useState<'pergunta' | 'bloq' | null>('pergunta')
  const [pedindo, setPedindo] = useState(false)
  // não aparece no meio do cadastro nem nas telas sem aceite
  if (pedido.valor !== 'pendente' || pathname.startsWith('/novo') || etapa === null) return null
  const responder = () => repo.setConfig('pedidoAvisos', 'respondido')
  if (etapa === 'bloq') return <AvisosBloqueados aoFechar={() => { setEtapa(null); void responder() }} />
  const sim = async () => {
    setPedindo(true)
    const pode = suporteAviso() === 'ok' && temAcesso('notificacao')
    const r = pode ? await pedirPermissao() : 'indisponivel'
    if (r === 'granted') {
      const canais = (await repo.getConfig('canais')) ?? { agenda: false, notificacao: false }
      await repo.setConfig('canais', { ...canais, notificacao: true })
      await responder()
      toast({ titulo: 'Avisos ativados', texto: 'Neste aparelho' })
      setEtapa(null)
    } else {
      // negado ou indisponível: explica e oferece a agenda do celular (grava "respondido" ao fechar)
      setEtapa('bloq')
    }
  }
  return (
    <Dialogo titulo="Quer ser avisado na hora da dose?" aoFechar={() => { setEtapa(null); void responder() }} icone={<IcoSino tam={28} className="text-acento" />}>
      <div className="flex flex-col gap-1.5 rounded-xl bg-sup2 p-4">
        <span className="text-xs font-bold tracking-wide text-fraco uppercase">Exemplo do que aparece</span>
        <span className="text-base font-bold">{TEXTO_AVISO}</span>
      </div>
      <ul className="m-0 flex flex-col gap-2 pl-5 text-sm leading-relaxed text-suave">
        <li>O aviso nunca mostra o nome da substância nem a dose.</li>
        <li>Chega com o app aberto ou aberto há pouco. Com o app fechado, quem avisa é a agenda do celular.</li>
        <li>Em seguida o aparelho pede a permissão.</li>
      </ul>
      <button type="button" className="btn-primario" disabled={pedindo} onClick={() => void sim()}>Sim</button>
      <button type="button" className="btn-texto" disabled={pedindo} onClick={() => { setEtapa(null); void responder() }}>Agora não</button>
      <span className="text-center text-sm text-fraco">Dá para mudar depois em Configurações.</span>
    </Dialogo>
  )
}

/**
 * N04: convite para instalar, depois do primeiro registro de dose. Cartão na Hoje, não bloqueia.
 * Android/PC: botão do próprio navegador. iPhone: os 3 passos do Safari. "Agora não" não repete
 * (continua em Configurações > Instalar na tela inicial).
 */
export function ConviteInstalar() {
  const inst = useInstalacao()
  const responder = () => repo.setConfig('conviteInstalar', 'respondido')
  return (
    <section aria-labelledby="t-instalar" data-convite-instalar="" className="card anima-entrada flex flex-col gap-3 p-4">
      <span className="flex items-start gap-2.5">
        <IcoCelular tam={22} className="mt-0.5 shrink-0 text-acento" />
        <span className="flex flex-col gap-0.5">
          <b id="t-instalar" className="text-base">Coloque o app na tela inicial</b>
          <span className="text-sm leading-relaxed text-suave">Abre como um app, funciona sem internet e seus dados ficam mais protegidos.</span>
        </span>
      </span>
      {inst.ios ? (
        <>
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-sm font-semibold">
            <li className="flex gap-3"><b className="text-acento">1</b><span>No Safari, toque em Compartilhar <IcoCompartilhar tam={18} className="inline align-[-3px]" /></span></li>
            <li className="flex gap-3"><b className="text-acento">2</b><span>Escolha “Adicionar à Tela de Início”</span></li>
            <li className="flex gap-3"><b className="text-acento">3</b><span>Abra o app pelo novo ícone</span></li>
          </ol>
          <div className="flex gap-2">
            <button type="button" className="btn-texto flex-1" onClick={() => void responder()}>Agora não</button>
            <button type="button" className="btn-primario h-11 flex-1" onClick={() => void responder()}>Já instalei</button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn-texto flex-1" onClick={() => void responder()}>Agora não</button>
          {inst.podeInstalar ? (
            <button
              type="button"
              className="btn-primario h-11 flex-1"
              onClick={async () => {
                const r = await inst.instalar()
                if (r === 'aceito') void responder()
              }}
            >
              Instalar
            </button>
          ) : (
            <Link to="/instalar" className="btn-primario h-11 flex-1">Ver como</Link>
          )}
        </div>
      )}
    </section>
  )
}
