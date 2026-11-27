import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, Navigate, RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './sistema/instalar.ts' // captura beforeinstallprompt o quanto antes
import { ErroGeral, Inicio, NaoEncontrada, Raiz, avisarNovaVersao } from './app.tsx'
import { AvisoAntigo, BoasVindas, Instalar, Saida } from './telas/inicio.tsx'
import { Hoje } from './telas/hoje.tsx'
import { DetalheProtocolo, Historico, Protocolos } from './telas/protocolos.tsx'
import {
  CarregarRascunho,
  CriarSubstancia,
  EditorBlend,
  NovoProtocolo,
  PassoOQue,
  PassoQuando,
} from './telas/protocolo-novo.tsx'
import { CompararFotos, DetalheMedida, Fotos, NovaFoto, NovaMedicao, Peso } from './telas/corpo.tsx'
import { Estoque, FormFrasco, Reconstituicao } from './telas/estoque.tsx'
import { ligarTransicoes } from './ui/transicao.ts'
import { Agenda, Ajustes, ApagarTudo, Backup, Lembretes, Privacidade, RestaurarInicio, Sobre, Substancias, Termos } from './telas/ajustes.tsx'

// HashRouter (endereços como /peptide-tracker/#/hoje): o GitHub Pages só serve arquivos, então
// recarregar ou abrir um link interno nunca dá 404, e o app funciona em qualquer subpasta.
// Endereço sem # dentro da pasta (ex.: /peptide-tracker/estoque, link antigo ou digitado): com o app
// já instalado quem responde é o service worker, então a conversão para #/estoque acontece aqui.
const base = import.meta.env.BASE_URL
const resto = location.pathname.startsWith(base) ? location.pathname.slice(base.length).replace(/^index\.html$/, '').replace(/\/+$/, '') : ''
if (resto && !location.hash) location.replace(`${base}#/${resto}${location.search}`)

// Versões antigas guardavam aqui uma cópia da escolha de tema (Preto, Índigo, Claro, Automático).
// Hoje o app só tem o tema claro: a cópia sai (a do banco sai na versão 3 do banco, src/dados/db.ts).
try {
  localStorage.removeItem('pt-tema')
} catch {
  /* navegador sem armazenamento local: nada a limpar */
}

const router = createHashRouter([
  {
    path: '/',
    element: <Raiz />,
    errorElement: <ErroGeral />,
    children: [
      { index: true, element: <Inicio /> },
      { path: 'boas-vindas', element: <BoasVindas /> },
      { path: 'aviso', element: <AvisoAntigo /> },
      { path: 'saida', element: <Saida /> },
      { path: 'instalar', element: <Instalar /> },
      { path: 'lembrar', element: <Navigate to="/hoje" replace /> }, // passo antigo do primeiro acesso
      { path: 'restaurar', element: <RestaurarInicio /> },
      { path: 'privacidade', element: <Privacidade /> },
      { path: 'termos', element: <Termos /> },
      { path: 'sobre', element: <Sobre /> },

      { path: 'hoje', element: <Hoje /> },
      { path: 'protocolos', element: <Protocolos /> },
      { path: 'protocolos/:id', element: <DetalheProtocolo /> },
      { path: 'protocolos/:id/editar', element: <CarregarRascunho modo="editar" /> },
      { path: 'protocolos/:id/duplicar', element: <CarregarRascunho modo="duplicar" /> },
      { path: 'historico', element: <Historico /> },

      { path: 'novo', element: <NovoProtocolo /> },
      { path: 'novo/substancia', element: <PassoOQue /> },
      { path: 'novo/criar', element: <CriarSubstancia /> },
      { path: 'novo/blend', element: <EditorBlend /> },
      { path: 'novo/frequencia', element: <PassoQuando /> },
      // endereços dos passos antigos (dose, revisão): mesmo cadastro, nas 2 telas novas
      { path: 'novo/dose', element: <Navigate to="/novo/substancia" replace /> },
      { path: 'novo/revisao', element: <Navigate to="/novo/frequencia" replace /> },

      { path: 'peso', element: <Peso /> },
      { path: 'peso/medicao/nova', element: <NovaMedicao /> },
      { path: 'peso/medicao/:id', element: <NovaMedicao /> },
      { path: 'peso/medida/:campo', element: <DetalheMedida /> },
      { path: 'peso/fotos', element: <Fotos /> },
      { path: 'peso/fotos/nova', element: <NovaFoto /> },
      { path: 'peso/fotos/comparar', element: <CompararFotos /> },

      { path: 'estoque', element: <Estoque /> },
      { path: 'estoque/frasco/novo', element: <FormFrasco /> },
      { path: 'estoque/frasco/:id', element: <FormFrasco /> },
      { path: 'estoque/frasco/:id/reconstituir', element: <Reconstituicao /> },

      { path: 'ajustes', element: <Ajustes /> },
      { path: 'ajustes/lembretes', element: <Lembretes /> },
      { path: 'ajustes/agenda', element: <Agenda /> },
      { path: 'ajustes/backup', element: <Backup /> },
      { path: 'ajustes/substancias', element: <Substancias /> },
      { path: 'ajustes/apagar', element: <ApagarTudo /> },
      { path: '*', element: <NaoEncontrada /> },
    ],
  },
])

// Transição entre telas onde o navegador tem a View Transitions API (sem ela, troca direta).
ligarTransicoes(router)

const atualizarSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    avisarNovaVersao(() => void atualizarSW(true))
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
