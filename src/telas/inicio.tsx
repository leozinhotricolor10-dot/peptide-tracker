// T01 Boas-vindas, T02 Aviso 18+, E02 Saída, T03 Instalar, T04 Como lembrar, M05 pré-permissão, E01 bloqueado.
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { repo, useConfig } from '../dados/index.ts'
import { Dialogo, Nota, Tela } from '../ui/base.tsx'
import { useVoltar } from '../ui/navegar.ts'
import { IcoAlerta, IcoCalendario, IcoCelular, IcoCheck, IcoCompartilhar, IcoEscudo, IcoSino, IcoVoltar } from '../ui/icones.tsx'
import { useInstalacao } from '../sistema/instalar.ts'
import { TEXTO_AVISO, pedirPermissao, suporteAviso } from '../sistema/avisos.ts'
import { useToast } from '../ui/toast.tsx'
import { temAcesso } from '../plano.ts'
import { hojeStr } from '../dominio/datas.ts'

export const VERSAO_AVISO = '1'

export function BoasVindas() {
  return (
    <Tela className="min-h-dvh justify-between">
      <div className="flex flex-col gap-6 pt-10">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-selecionado text-acento">
          <IcoEscudo tam={34} />
        </span>
        <div className="flex flex-col gap-3">
          <h1 className="text-[34px] leading-tight font-extrabold tracking-tight">Seu diário de protocolos</h1>
          <p className="m-0 text-[17px] leading-relaxed text-suave">
            Registre o que você aplica, quando aplica e quanto resta no frasco. Tudo fica só neste aparelho.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0 text-base font-semibold">
          {['Lembrete das suas doses', 'Peso, medidas e fotos', 'Estoque e validade dos frascos'].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok-fundo text-ok"><IcoCheck tam={16} /></span>
              {t}
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm font-semibold text-fraco">O app não recomenda substâncias nem doses.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Link to="/aviso" className="btn-primario">Começar</Link>
        <Link to="/restaurar" className="btn-secundario">Já uso: restaurar backup</Link>
      </div>
    </Tela>
  )
}

export function Aviso() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [maior, setMaior] = useState(false)
  const [entendi, setEntendi] = useState(false)
  const onboarding = useConfig('onboarding')
  const aceitar = async () => {
    await repo.setConfig('aceite', { versao: VERSAO_AVISO, em: new Date().toISOString() })
    if (!(await repo.getConfig('primeiroUso'))) await repo.setConfig('primeiroUso', hojeStr())
    void navigator.storage?.persist?.().catch(() => false)
    nav(params.get('depois') === 'hoje' || onboarding.valor ? '/hoje' : '/instalar?primeiro=1', { replace: true })
  }
  return (
    <Tela className="min-h-dvh">
      <Link to="/boas-vindas" aria-label="Voltar" className="icone-btn -ml-2.5"><IcoVoltar /></Link>
      <h1 className="text-[30px] leading-tight font-extrabold">Antes de começar</h1>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-suave">
        <p className="m-0">
          Este app é <b className="text-texto">só um registro pessoal</b>. Ele não faz diagnóstico, não prescreve e não substitui a orientação de um profissional de saúde.
        </p>
        <p className="m-0">Substâncias, doses e datas são informadas por você. As decisões são suas.</p>
        <p className="m-0">Seus registros ficam só neste aparelho. Nada é enviado para servidor: não há conta nem login.</p>
      </div>
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
        <button type="button" className="btn-primario" disabled={!maior || !entendi} onClick={aceitar}>Aceitar e continuar</button>
        {(!maior || !entendi) && <span className="text-center text-[13px] text-fraco">Marque as duas opções</span>}
        <Link to="/saida" replace className="btn-texto text-suave">Não aceito</Link>
        <div className="flex justify-center gap-4 text-sm">
          <Link to="/termos" className="link">Termos de uso</Link>
          <Link to="/privacidade" className="link">Privacidade</Link>
        </div>
      </div>
    </Tela>
  )
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
  const nav = useNavigate()
  const voltarOu = useVoltar()
  const [params] = useSearchParams()
  const primeiro = params.get('primeiro') === '1'
  const inst = useInstalacao()
  const [aba, setAba] = useState<'ios' | 'android'>(inst.ios ? 'ios' : 'android')
  const toast = useToast()
  const seguir = () => (primeiro ? nav('/lembrar', { replace: true }) : voltarOu('/hoje'))

  return (
    <Tela className="min-h-dvh">
      {!primeiro && <button type="button" onClick={() => voltarOu('/hoje')} aria-label="Voltar" className="icone-btn -ml-2.5"><IcoVoltar /></button>}
      {primeiro && <span className="text-[13px] font-bold tracking-wide text-acento uppercase">Passo 2 de 3</span>}
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
              <p className="m-0 text-[15px] text-suave">A Apple não permite instalar com um botão. São 3 toques, só desta vez.</p>
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] font-semibold">
                <li className="flex gap-3"><b className="text-acento">1</b><span>No Safari, toque em Compartilhar <IcoCompartilhar tam={18} className="inline align-[-3px]" /> (quadrado com seta)</span></li>
                <li className="flex gap-3"><b className="text-acento">2</b><span>Escolha “Adicionar à Tela de Início”</span></li>
                <li className="flex gap-3"><b className="text-acento">3</b><span>Abra o app pelo novo ícone</span></li>
              </ol>
              <Nota tipo="aviso">No iPhone, os avisos de dose só funcionam com o app instalado, e o Safari pode apagar dados de sites que ficam muito tempo sem uso.</Nota>
            </div>
          ) : (
            <div className="card flex flex-col gap-3 p-4">
              <b className="text-base">Um toque e pronto</b>
              <p className="m-0 text-[15px] text-suave">Toque em “Instalar aplicativo”. O próprio aparelho pede a confirmação e coloca o ícone na tela inicial.</p>
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
      <ul className="m-0 flex flex-col gap-2 pl-5 text-[15px] leading-relaxed text-suave">
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
      <p className="m-0 text-[15px] leading-relaxed text-suave">
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

export function ComoLembrar() {
  const nav = useNavigate()
  const sup = suporteAviso()
  const notifPode = sup === 'ok' && temAcesso('notificacao')
  const [agenda, setAgenda] = useState(true)
  const [notif, setNotif] = useState(notifPode)
  const [dialogo, setDialogo] = useState<'pre' | 'bloq' | null>(null)
  const toast = useToast()

  const terminar = async () => {
    await repo.setConfig('onboarding', true)
    nav('/novo?saida=/hoje', { replace: true })
  }
  const continuar = async () => {
    await repo.setConfig('canais', { agenda, notificacao: false })
    if (notif) setDialogo('pre')
    else await terminar()
  }

  return (
    <Tela className="min-h-dvh">
      <span className="text-[13px] font-bold tracking-wide text-acento uppercase">Passo 3 de 3</span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-extrabold">Como quer ser lembrado?</h1>
        <p className="m-0 text-base text-suave">Dá para mudar depois em Configurações.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <label className="card flex items-start gap-3 p-4 opacity-100">
          <input type="checkbox" checked disabled className="mt-0.5 h-6 w-6 shrink-0" />
          <span className="flex flex-col gap-1"><b className="text-base">Dentro do app</b><span className="text-sm text-fraco">Sempre ligado. A tela Hoje mostra o que falta.</span></span>
        </label>
        <label className="card flex items-start gap-3 p-4">
          <input type="checkbox" checked={agenda} onChange={(e) => setAgenda(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0" />
          <span className="flex flex-col gap-1"><b className="text-base">Na agenda do celular</b><span className="text-sm text-fraco">Avisa mesmo com o app fechado e sem internet. O evento aparece só como “Lembrete”. Você gera o arquivo depois de criar o protocolo.</span></span>
        </label>
        <label className="card flex items-start gap-3 p-4">
          <input type="checkbox" checked={notif} disabled={!notifPode} onChange={(e) => setNotif(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0" />
          <span className="flex flex-col gap-1">
            <b className="text-base">Notificação no aparelho</b>
            <span className="text-sm text-fraco">
              {sup === 'ios-sem-instalar'
                ? 'Indisponível: no iPhone, instale o app na Tela de Início primeiro.'
                : sup === 'sem-suporte'
                  ? 'Indisponível neste navegador.'
                  : `O texto é só “${TEXTO_AVISO}”. Chega com o app aberto ou aberto há pouco (sem servidor).`}
            </span>
          </span>
        </label>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <button type="button" className="btn-primario" onClick={continuar}>Continuar</button>
        <button
          type="button"
          className="btn-texto"
          onClick={async () => {
            await repo.setConfig('onboarding', true)
            nav('/hoje', { replace: true })
          }}
        >
          Fazer isso depois
        </button>
      </div>
      {dialogo === 'pre' && (
        <PrePermissao
          aoFechar={() => void terminar()}
          aoTerminar={(r) => {
            if (r === 'ativado') {
              toast({ titulo: 'Avisos ativados', texto: 'Neste aparelho' })
              void terminar()
            } else setDialogo('bloq')
          }}
        />
      )}
      {dialogo === 'bloq' && <AvisosBloqueados aoFechar={() => void terminar()} />}
    </Tela>
  )
}
