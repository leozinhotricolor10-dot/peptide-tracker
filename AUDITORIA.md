# Auditoria do MVP (07/11/2026)

Revisão do código inteiro + jornada completa no navegador (Chrome, 390×844, 360×640, 768 e 1280 de largura),
no build de produção servido **como no GitHub Pages**, na subpasta `/peptide-tracker/` (`npm run pages`).
Cada correção tem teste automático (`npm test`, arquivos `src/**/auditoria.test.ts`) ou passo no teste de
ponta a ponta (`npm run e2e`, arquivo `e2e/fumaca.mjs`). Onde só deu para conferir no navegador, está dito.

**Resultado:** 23 achados corrigidos (6 altos, 8 médios, 9 baixos). Rodada final completa sem achados novos.

## Achados e correções

| # | Gravidade | Achado | Correção | Coberto por |
|---|---|---|---|---|
| A01 | Alta | Pausar e depois retomar um protocolo fazia os dias da pausa aparecerem no histórico como "nenhuma feita" | Pausas terminadas ficam guardadas (`pausas`) e esses dias não geram dose | `dominio/auditoria.test.ts` A01, `dados/auditoria.test.ts` A01 |
| A02 | Alta | Mudar o horário de um protocolo "apagava" do calendário as doses já feitas nos dias anteriores | Dia passado conta qualquer dose feita daquela linha naquele dia (`resumoDoDia`) | A02 |
| A04 | Alta | Dose "1.000" era lida como 1 (mil vezes menor), sem aviso | Número ambíguo é recusado com explicação ("use vírgula para decimais…"); `1e3`, `1,2,3` etc. também | A04 + e2e passo 4 |
| A08 | Alta | Backup corrompido, editado ou malicioso entrava no banco e podia deixar o app em tela branca para sempre | Cada registro é reconstruído só com campos conhecidos e tipos conferidos (`dados/validar.ts`); ids repetidos, datas/horas inválidas, foto que não é base64 recusam o arquivo inteiro; configs perigosas (ex.: aceite) são ignoradas; limite de 300 MB | A08 + navegador (arquivo corrompido mostra erro e nada muda) |
| A10 | Alta | Na subpasta do GitHub Pages: F5 e links internos dariam 404; manifest com `start_url`/`scope` = `/`; ícone e link da notificação apontando para a raiz do site; o service worker podia focar janelas de outros sites do mesmo `github.io` | `base` do Vite (`BASE_PATH`, padrão `/peptide-tracker/`), rotas com `#` (HashRouter), manifest/escopo da subpasta, `404.html` e conversão de `/peptide-tracker/estoque` para `#/estoque`, SW só usa janelas do próprio app | e2e passos 1, 6, 7, 9 |
| A11 | Alta | Qualquer erro ao desenhar uma tela (ex.: navegador bloqueando o armazenamento) virava tela branca | Tela "Algo deu errado" com Recarregar; aviso "Algo não deu certo" para falhas ao salvar que antes eram silenciosas | e2e passo 8 (sem tela branca); armazenamento bloqueado conferido só por revisão |
| A03 | Média | Protocolo cuja data de fim passou continuava "Ativo" na lista e nos lembretes | Passa a "Concluído" ("Terminou em…"), e dá para editar a duração para continuar | A03 |
| A06 | Média | Foto: rotação da câmera ignorada em alguns aparelhos; depois de um erro, escolher a mesma foto não fazia nada; foto gigante podia travar; erro ao guardar sem aviso | Abre com orientação da câmera e cai para `<img>` se preciso; limpa o campo; limite de 40 MB; mensagens de erro separadas | A06 + navegador (arquivo que não é imagem, foto 3000×2000 vira 1280×853) |
| A07 | Média | Não dava para apagar um protocolo criado por engano | "Apagar protocolo" no menu ⋯, apaga linhas e registros dele; frascos e substâncias ficam | A07 |
| A09 | Média | Restaurar com o aparelho sem espaço dava mensagem genérica | Mensagem específica (liberar espaço ou usar backup sem fotos) | A09 |
| A14 | Média | Abrir frasco, reconstituição, medição ou blend que não existe deixava "Carregando…" para sempre | Tela "não encontrado" com voltar | e2e passo 8 + navegador |
| A15 | Média | A folha "Registrar dose" ficava aberta por cima de outra tela ao usar o voltar do celular | Fecha ao mudar de tela | navegador |
| A16 | Média | Registro de dose aceitava horário no futuro; toque duplo podia salvar duas vezes (dose, frasco, blend, substância) | Bloqueio de horário futuro e de toque duplo | navegador |
| A17 | Média | Exportar backup sem tratamento de erro (sem aviso se falhar) | Aviso com sugestão de exportar sem fotos | revisão |
| A12 | Baixa | Depois de restaurar, o app dizia "Ainda sem backup" | Conta a data do arquivo como último backup | A12 |
| A13 | Baixa | Estoque mostrava "GLOW 70 mg · 70 mg" | Não repete a quantidade quando o nome já tem | A13 |
| A18 | Baixa | Erro de importação repetia "Nenhum dado seu foi alterado." | Texto único | navegador |
| A19 | Baixa | Estoque dizia "registros em UI" também para doses em mL antes de reconstituir | Texto correto | revisão |
| A20 | Baixa | Medição com data futura e "usar até" antes da data da mistura eram aceitas | Validação com mensagem | navegador (medição) / revisão |
| A21 | Baixa | Protocolo ou medida inexistente: tela sem título nem botão voltar | Mesma tela "não encontrado" | e2e passo 8 |
| A22 | Baixa | Diferenças com o desenho: Estoque (linha "Restante", destaque de alerta, datas "28/out"), Protocolos (barra de progresso, dose à direita; contagem nas abas apertava em 360 px), Backup (linha do tamanho, quadro de aviso, "O arquivo não abre?"), Peso (unidade e selo da variação) | Ajustado | navegador (comparação lado a lado) |
| A23 | Baixa | `npm ci` com aviso de pacote depreciado (`glob@11`) e 2 vulnerabilidades moderadas na ferramenta de build | `overrides` para `glob@14.0.4` | `npm ci` sem aviso |
| A24 | Baixa | Comentários e relatórios dentro de `app/` citavam documentos internos e o nome de outro negócio do dono | Removidos; mapa de telas e teste antigo foram para `docs/` (privado) | busca no código |

## Conferido sem achado

- Datas: virada de mês, horário de verão (São Paulo 2018 e Nova York 2026), horário inexistente (02:30), ciclo e progresso atravessando o verão (testes A05).
- Jornada no navegador: 1º acesso, recusa 18+ (nada gravado; `/hoje` sem aceite volta ao início), onboarding, protocolo da lista sem nome, fora da lista com nome e emoji, dias da semana, ciclo, 2 substâncias, blend com 3 componentes (soma 70 mg), dose atrasada, "outro horário", pular com motivo, desfazer, apagar + desfazer, frasco e reconstituição (2,5 mg/mL; 250 mcg = 10 unidades; 20 doses; R$ 0,85/dose), blend (10 unidades = 0,1 mL), peso/medidas/confirmação >10%, fotos e comparar, lembretes, agenda .ics (213 eventos, nenhum nome de substância), backup exportar → apagar tudo → restaurar (com fotos), F5 em 27 telas, offline, atualização do app ("Nova versão" → Atualizar), notificação negada, duas abas (a outra atualiza sozinha), tela larga (coluna de 480 px), Termos/Privacidade/Sobre abrem.
- Em 27 telas × 3 larguras (390, 360, 768): nenhum alvo de toque menor que 44 px, nenhuma rolagem lateral, nenhum texto com contraste abaixo de 4,5:1 (3:1 para texto grande), nenhum texto em inglês, nenhuma tela vazia. Status sempre com ícone + texto.
- Console: nenhum erro ou aviso do app em toda a jornada; nenhuma requisição com erro.

## Limitações conhecidas (não são bugs)

- **Aviso com o app fechado não é garantido**: sem servidor, a notificação é criada pelo aparelho e só chega com o app aberto ou aberto há pouco. A agenda do celular (.ics) avisa sempre. No iPhone, notificação só com o app instalado na Tela de Início (iOS 16.4+).
- **Texto jurídico**: as páginas abrem, mas ainda mostram "Texto provisório" e os marcadores `[NOME DO APP]`, `[NOME/EMPRESA]` e `[CONTATO]` (também no rodapé de Sobre). Não foi mexido por decisão do dono; precisa trocar pelo texto do advogado antes de divulgar.
- Mudar a **frequência** (não só o horário) de um protocolo muda quantas doses o calendário espera nos dias passados. Doses feitas nunca somem.
- O ciclo "X dias sim / Y não" conta pelo calendário desde o início, inclusive durante uma pausa manual.
- Com duas abas abertas, o aviso dentro do app aparece nas duas (a notificação do sistema é uma só).
- O relógio do aparelho manda: mudar o relógio muda o "hoje" do app.
- O arquivo de backup não é criptografado: quem tiver o arquivo vê os dados. Limites: arquivo até 300 MB, foto até 40 MB, até 2.000 fotos.
- Fotos HEIC dependem de o navegador conseguir abrir.
- 4 avisos de segurança "low" no `npm audit` (pacote `deepmerge`, usado só na ferramenta que gera o service worker; não vai para o app e não há correção publicada).
- Testado em Chrome de computador simulando celular; não testado em iPhone/Android reais nem a instalação real (o botão "Instalar" depende do navegador).
- O teste de ponta a ponta (`npm run e2e`) precisa do Google Chrome instalado e não roda no GitHub Actions; lá rodam `npm test` e o build.
