// Backup assistido: "Enviar backup para mim" (compartilhar do sistema, com volta para baixar o
// arquivo), o aviso de risco (dados só no aparelho; iPhone) e o estado do armazenamento.
// Usado na tela Backup e no cartão de lembrete do Hoje.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { repo } from '../dados/index.ts'
import { fmtBytes, montarBackup, nomeArquivoBackup, registrarBackupFeito } from '../dados/backup.ts'
import { mensagemDeErro } from '../dados/repo.ts'
import { compartilharArquivo, enviarArquivo, type NavegadorShare, type ResultadoEnvio } from '../sistema/compartilhar.ts'
import { baixarArquivo } from '../sistema/imagem.ts'
import { estadoArmazenamento, pedirArmazenamentoPersistente, type EstadoArmazenamento } from '../sistema/armazenamento.ts'
import { useInstalacao } from '../sistema/instalar.ts'
import { Dialogo } from '../ui/base.tsx'
import { IcoAlerta, IcoCheck, IcoCompartilhar } from '../ui/icones.tsx'
import { useToast } from '../ui/toast.tsx'

export const TEXTO_RISCO = 'Seus dados ficam só neste aparelho. Se trocar de celular, limpar o navegador ou desinstalar o app, só o backup traz tudo de volta.'
export const TEXTO_RISCO_IOS = 'No iPhone, o sistema pode apagar os dados de sites que ficam algumas semanas sem uso. Com o app instalado na Tela de Início, isso fica bem menos provável.'
export const TEXTO_INSTALAR_IOS = 'Este app ainda não está na Tela de Início. Instalar ajuda a proteger seus dados.'

/** Aviso de risco curto. No iPhone acrescenta o apagamento automático e, sem instalar, o pedido para instalar. */
export function AvisoRisco({ compacto }: { compacto?: boolean }) {
  const inst = useInstalacao()
  return (
    <div className={`flex flex-col gap-1.5 text-sm leading-relaxed ${compacto ? 'text-aviso-texto' : 'caixa-aviso px-4 py-3 font-semibold'}`}>
      <p className="m-0">{TEXTO_RISCO}</p>
      {inst.ios && <p className="m-0">{TEXTO_RISCO_IOS}</p>}
      {inst.ios && !inst.instalado && (
        <p className="m-0">
          {TEXTO_INSTALAR_IOS} <Link to="/instalar" className="link inline-flex text-aviso-texto underline">Como instalar</Link>
        </p>
      )}
    </div>
  )
}

/** "Armazenamento protegido" / "Não protegido" (ícone + texto), com o caso sem a API. */
export function EstadoDoArmazenamento() {
  const [estado, setEstado] = useState<EstadoArmazenamento | null>(null)
  useEffect(() => {
    let vivo = true
    void estadoArmazenamento().then((e) => vivo && setEstado(e))
    return () => {
      vivo = false
    }
  }, [])
  if (estado === null) return null
  if (estado === 'protegido') {
    return (
      <span className="flex items-start gap-2 text-sm font-semibold text-ok">
        <IcoCheck tam={18} className="mt-0.5 shrink-0" /> Armazenamento protegido: o navegador não apaga os dados do app para liberar espaço.
      </span>
    )
  }
  return (
    <span className="flex items-start gap-2 text-sm font-semibold text-aviso-texto">
      <IcoAlerta tam={18} className="mt-0.5 shrink-0 text-aviso" />
      {estado === 'nao-protegido'
        ? 'Não protegido: se faltar espaço, o navegador pode apagar os dados do app. Instalar o app e fazer backup ajudam.'
        : 'Este navegador não informa se os dados do app ficam protegidos. O backup é a garantia.'}
    </span>
  )
}

type Estado = null | { tipo: 'baixado'; nome: string } | { tipo: 'pronto'; arquivo: File } | { tipo: 'erro'; mensagem: string; arquivo?: File }

/**
 * Envia (ou baixa) o backup. Grava a data do último backup quando o arquivo foi entregue
 * (compartilhado ou baixado); cancelar não conta e não é erro.
 */
export function useEnviarBackup() {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  const [estado, setEstado] = useState<Estado>(null)

  const feito = useCallback(async () => {
    await registrarBackupFeito(repo)
    void pedirArmazenamentoPersistente()
  }, [])

  const tratar = useCallback(
    async (r: ResultadoEnvio, fotos: number) => {
      switch (r.tipo) {
        case 'compartilhado':
          await feito()
          setEstado(null)
          toast({ titulo: 'Backup enviado', texto: `${fotos} foto(s) no arquivo · guarde a mensagem ou o arquivo onde você mandou` })
          return
        case 'baixado':
          await feito()
          setEstado({ tipo: 'baixado', nome: r.nome })
          return
        case 'cancelado':
          setEstado(null)
          toast({ tipo: 'info', titulo: 'Envio cancelado', texto: 'Nada mudou. Dá para enviar quando quiser.' })
          return
        case 'precisa-toque':
          setEstado({ tipo: 'pronto', arquivo: r.arquivo })
          return
        case 'erro':
          setEstado({ tipo: 'erro', mensagem: r.mensagem, arquivo: r.arquivo })
      }
    },
    [feito, toast],
  )

  const enviar = useCallback(
    async (incluirFotos: boolean, soBaixar = false) => {
      if (ocupado) return
      setOcupado(true)
      try {
        let arq
        try {
          arq = await montarBackup(repo, incluirFotos)
        } catch {
          setEstado({ tipo: 'erro', mensagem: incluirFotos ? 'Não deu para montar o arquivo. Tente sem as fotos (arquivo menor).' : 'Não deu para montar o arquivo. Tente de novo.' })
          return
        }
        const blob = new Blob([JSON.stringify(arq)], { type: 'application/json' })
        const nome = nomeArquivoBackup()
        const r = soBaixar ? (baixarArquivo(blob, nome), { tipo: 'baixado' as const, nome }) : await enviarArquivo(blob, nome)
        await tratar(r, arq.fotos.length)
      } catch (e) {
        setEstado({ tipo: 'erro', mensagem: mensagemDeErro(e) })
      } finally {
        setOcupado(false)
      }
    },
    [ocupado, tratar],
  )

  const dialogos: ReactNode = (
    <>
      {estado?.tipo === 'baixado' && (
        <Dialogo titulo="Backup salvo no aparelho" aoFechar={() => setEstado(null)} icone={<IcoCheck className="text-ok" tam={28} />}>
          <p className="m-0 text-base leading-relaxed text-suave">
            Este navegador não abre o envio direto, então o arquivo <b className="break-all text-texto">{estado.nome}</b> foi baixado.
          </p>
          <p className="m-0 text-base leading-relaxed text-suave">
            Ele fica na pasta <b className="text-texto">Downloads</b> (no iPhone: app Arquivos › Downloads; no Android: app Arquivos ou Downloads; no computador: pasta de downloads do navegador). De lá, dá para mandar para você mesmo por WhatsApp, e-mail ou Drive.
          </p>
          <button type="button" className="btn-primario" onClick={() => setEstado(null)}>Entendi</button>
        </Dialogo>
      )}
      {estado?.tipo === 'pronto' && (
        <Dialogo titulo="Arquivo pronto" aoFechar={() => setEstado(null)} icone={<IcoCompartilhar className="text-fraco" tam={28} />}>
          <p className="m-0 text-base leading-relaxed text-suave">O arquivo demorou um pouco para ficar pronto. Toque em Enviar para escolher para onde mandar.</p>
          <button
            type="button"
            className="btn-primario"
            onClick={async () => {
              const r = await compartilharArquivo(navigator as NavegadorShare, estado.arquivo)
              await tratar(r.tipo === 'precisa-toque' ? { tipo: 'erro', mensagem: 'O navegador não liberou o envio.', arquivo: estado.arquivo } : r, 0)
            }}
          >
            <IcoCompartilhar tam={20} /> Enviar
          </button>
          <button type="button" className="btn-texto" onClick={() => setEstado(null)}>Cancelar</button>
        </Dialogo>
      )}
      {estado?.tipo === 'erro' && (
        <Dialogo titulo="Não deu para enviar" aoFechar={() => setEstado(null)} icone={<IcoAlerta className="text-aviso" tam={28} />}>
          <p className="m-0 text-base leading-relaxed text-suave">{estado.mensagem} Nenhum dado seu foi alterado.</p>
          {estado.arquivo && (
            <button
              type="button"
              className="btn-primario"
              onClick={async () => {
                const f = estado.arquivo!
                const nome = f.name.replace(/\.txt$/i, '.json')
                baixarArquivo(f, nome)
                await tratar({ tipo: 'baixado', nome }, 0)
              }}
            >
              Baixar o arquivo
            </button>
          )}
          <button type="button" className="btn-texto" onClick={() => setEstado(null)}>Fechar</button>
        </Dialogo>
      )}
    </>
  )

  return { enviar, ocupado, dialogos }
}

export { fmtBytes }
