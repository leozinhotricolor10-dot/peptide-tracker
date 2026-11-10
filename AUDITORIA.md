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

## Rodada de 09/11/2026 (teste do dono no celular)

| # | Gravidade | Achado | Correção | Coberto por |
|---|---|---|---|---|
| A25 | Alta | Depois de salvar um protocolo novo, o voltar/fechar reabria os passos do cadastro; insistindo no voltar/X, a tela ficava em "Carregando…" para sempre. Causa: cada passo entrava no histórico (push) e só o último era trocado pelo detalhe; um passo aberto sem rascunho criava um cadastro novo escondido; e, quando o voltar caía em outra entrada da mesma rota, a tela reaproveitada lembrava que "tinha rascunho ao abrir" e ficava esperando sem saída | Os passos trocam de tela com `replace` (o cadastro ocupa uma entrada só); salvar/descartar marca o rascunho como fechado (`rascunho.fechar`) em vez de apagá-lo no meio da troca; todo passo sem cadastro em andamento sai para a lista (ou para o protocolo salvo), com teto de tempo; editar volta para o detalhe já aberto, sem duplicar | `telas/rascunho.test.ts` + e2e passos 7 e 8 (voltar, avançar, F5, link antigo `#/novo/dose`, X) |
| A26 | Média | "Voltar"/"Fechar" (`nav(-1)`) não fazia nada quando a tela era a primeira aberta (link direto, aba nova) | `useVoltar`: volta pelo histórico se houver tela anterior do app, senão vai para uma tela segura (Hoje, Estoque, Peso…) | `telas/rascunho.test.ts` (`temTelaAnterior`) + navegador |
| A27 | Média | "Carregando…" não tinha teto em nenhuma tela (se o armazenamento travar, gira para sempre) | Depois de 8 s vira "Está demorando mais que o normal" com Recarregar e Ir para Hoje | revisão |
| A28 | Baixa | Restaurar backup em Configurações e salvar a reconstituição empilhavam telas (voltar caía de novo no Backup ou num Estoque repetido); o 1º passo aberto no fim do primeiro acesso sem rascunho dependia de um desvio escondido | Restaurar usa `replace`; reconstituição volta para a tela anterior; o primeiro acesso abre o cadastro por `/novo?saida=/hoje` (sair sem salvar vai para Hoje) | navegador |
| A29 | Baixa | Chip "UI" da unidade tinha 43 px de largura | `min-w-11` em todos os chips | navegador (medição dos alvos no passo 2) |
| A30 | Pedido | Passo 2 sem calculadora: o dono queria informar mg do frasco e água e ver as unidades | Calculadora da seringa no passo 2 (opcional), com as mesmas contas da Reconstituição (`calcularSeringa` em `dominio/calculos.ts`): concentração, unidades exatas, marca mais próxima com a dose que ela dá de verdade, rendimento; blend só volume; UI sem conversão; erros por campo ("1.000", zero, negativo, texto). Interruptor opcional "Guardar este frasco no Estoque" (reconstituído hoje, salvo junto com o protocolo e ligado a ele) | `dominio/seringa.test.ts` + e2e passo 6 (5 mg em 2 mL = 2,5 mg/mL, 250 mcg = 10 unidades, 20 doses; 10 mg em 3 mL = 7,5 unidades → marca 8; frasco aparece no Estoque) |

Conferido nesta rodada, no build servido como no Pages (390×844): o roteiro do relato (criar → voltar → X → voltar → F5), editar (Corrigir dose → voltar → salvar → voltar), primeiro acesso, sem erro no console, sem texto em inglês, alvos do passo 2 ≥ 44 px (o interruptor de 24 px fica dentro de uma linha clicável de 44 px, como o "Ciclo com pausa").
Limitação: o voltar do celular no meio do cadastro sai do assistente (volta para a tela de antes) em vez de voltar um passo; o que foi digitado fica guardado na sessão, mas "Novo" começa do zero. As setas da tela voltam um passo.

## Rodada de 09/11/2026 (tarde): "Estou clicando em apagar e nada acontece"

Relato do dono (Android, Chrome, app instalado): no frasco Retatrutida 60 mg, "Apagar frasco" → "Apagar" e nada acontecia.

| # | Gravidade | Achado | Causa | Correção | Coberto por |
|---|---|---|---|---|---|
| A31 | Alta | Botão "Apagar" do diálogo do frasco ficava "morto": o diálogo não fechava, nada mudava, nenhum aviso | O botão esperava a gravação no banco sem nenhum retorno visual, sem teto de tempo e sem tratar erro. Quando o banco não responde na hora (reproduzido: o app aberto em outra janela/aba segurando uma gravação, caso comum com o app instalado + a aba antiga do Chrome), a tela ficava parada sem sinal; quando a gravação falhava, só aparecia um aviso genérico e o diálogo continuava igual. No laboratório (Chrome 390×844 e 360×560, toque, CPU 8× mais lenta, frasco sem dose, com dose ligada a protocolo, reconstituído, vencido, blend, aberto pela lista/F5/rolado) o apagar normal funcionou; o gatilho exato no aparelho do dono não foi provado, mas os dois modos de falha acima dão exatamente o sintoma relatado | Toda gravação tem teto de 10 s (`comTeto`/`gravando` em `dados/repo.ts`; backup 120 s, apagar tudo 60 s) e vira mensagem clara em pt-BR (`mensagemDeErro`). O botão mostra "Apagando…", não aceita toque duplo e mostra o erro logo abaixo (`ui/acao.tsx`, `BotaoAcao`/`useAcao`). Apagar frasco virou uma transação só que devolve o que mudou: as doses ficam no histórico sem apontar para o frasco (como o texto promete), a linha do protocolo também perde o vínculo, e o aviso "Frasco apagado" tem **Desfazer** (religa doses e linha). Id inexistente não dá erro ("Este frasco já tinha sido apagado"). A tela não vira "Novo frasco" depois de apagar; se o frasco some por fora, mostra "Frasco não encontrado" com Ir para Estoque | `dados/frasco.test.ts` (sem dose, com doses + protocolo, desfazer, id inexistente, falha simulada sem mexer em nada, banco mudo vira erro) + e2e passo 14 (criar frasco → ligar dose → apagar → some do Estoque, dose no histórico → Desfazer → apagar de novo, console limpo) |
| A32 | Média | Mesmo padrão (ação que grava sem retorno nem erro visível) em: apagar protocolo, encerrar, pausar, retomar, apagar registro de dose, "não fiz", apagar medição, apagar foto, Acabou/Descartar/Voltar a usar, descartar frasco vencido, arquivar/reativar/apagar substância, apagar tudo, lembrete por protocolo, canais de aviso, "Lembrar amanhã", escolher/criar substância, salvar reconstituição e salvar medição; o Desfazer do aviso falhava calado | Mesma causa | Todos usam `BotaoAcao`/`useAcao` ou `try/catch` com `mensagemDeErro`; Desfazer que falha mostra "Não deu para desfazer". O restante (onboarding) cai no aviso global, que agora diz o motivo, e nunca fica parado (teto de 10 s) | varredura em toque abaixo |
| A33 | Média | Criar substância e salvar blend: se a gravação falhasse, o botão ficava travado para sempre (a trava contra toque duplo não era liberada) | Trava (`ocupado`) sem `finally` | Libera a trava e mostra o erro | revisão + varredura |
| A34 | Baixa | Ir de um frasco direto para "Novo frasco" levava junto a substância e os números do frasco anterior | A mesma tela era reaproveitada entre as rotas | Uma tela nova por frasco (`key`) | navegador |

Varredura em toque (Pixel 7, 390×844, build servido como no Pages), todas de ponta a ponta com conferência no banco: Acabou + Desfazer, Descartar, Voltar a usar, apagar frasco com dose ligada a protocolo (+ Desfazer + apagar de novo; dose aparece no Histórico), sem dose, vencido, blend, Cancelar e tocar fora não apagam, apagar registro de dose + Desfazer, pausar, retomar, encerrar e apagar protocolo, salvar/apagar medição + Desfazer, adicionar/apagar foto, remover componente do blend, arquivar/reativar/apagar substância, exportar backup, apagar tudo, importar backup. 19/19 ok, nenhum alvo tocado menor que 44 px, console limpo. Modos de falha conferidos no build: banco ocupado por outra janela → "Apagando…" e, em 10 s, a mensagem "O aparelho está demorando para gravar…"; erro do banco → mensagem dentro do diálogo e o frasco continua lá.

Limitações: o gatilho exato no celular do dono não foi reproduzido (só os modos de falha que dão o mesmo sintoma); a instalação real (modo standalone) não dá para simular aqui. Se a gravação passar do teto e terminar depois, o app já avisou que demorou; a tela se corrige sozinha (o frasco some e aparece "Frasco não encontrado").

## Rodada de 09/11/2026 (noite): cor do protocolo, frasco sempre no Estoque, movimento

Pedidos do dono (celular, tela Protocolos): uma cor por protocolo; todo frasco no Estoque para acompanhar o saldo; animações leves nos cartões.

| # | Tipo | O que mudou | Coberto por |
|---|---|---|---|
| P01 | Pedido | Cada protocolo tem uma cor (paleta de 8 em `dominio/cores.ts`, todas com contraste ≥ 4,5:1 nos fundos do app e longe do turquesa e das cores de status). A cor aparece na borda esquerda do cartão (Protocolos, Hoje, Estoque, Histórico, detalhe) e numa bolinha ao lado do nome; o nome sempre aparece (a cor nunca é a única pista). Atribuição automática estável (primeira cor livre; com todas em uso, a menos usada). Troca na revisão do cadastro e no Editar (bolinhas de 44 px, a escolhida com ✓). Banco v2 dá cores diferentes aos protocolos que já existiam, na ordem de criação. Backup leva a cor; backup antigo (sem cor) ou com cor desconhecida importa e recebe cores automáticas distintas | `dominio/cores.test.ts`, `dados/cores-estoque.test.ts` (migração v1→v2, salvar, backup antigo e novo) + e2e passos 17 e 18 |
| P02 | Pedido | Todo frasco informado vai para o Estoque: o interruptor "Guardar este frasco no Estoque" saiu. Com os mg (e a água, se reconstituído) na calculadora do passo 2, o frasco é criado e ligado à linha do protocolo; só com os mg entra lacrado. Linha que já tem frasco usável ligado (editar) não duplica. Números inválidos na calculadora bloqueiam com mensagem (antes o frasco podia ficar de fora calado). Sem dados do frasco: aviso na revisão, selo "Sem frasco no estoque" (ícone + texto) no cartão, no detalhe e na Hoje, e o atalho "Adicione o frasco para acompanhar o estoque" abre o Novo frasco já ligado àquela linha. Cartão do protocolo mostra "Frasco: N doses restantes" (e "mais N frascos"); Estoque mostra "≈ N doses restantes" e o protocolo ligado. Protocolos antigos sem frasco: nada é inventado, só selo e atalho | `dominio/estoque.test.ts`, `dados/cores-estoque.test.ts`, `telas/rascunho.test.ts` + e2e passos 6, 15, 16, 17 |
| A35 | Média | Salvar protocolo com frasco da calculadora gravava o frasco e depois o protocolo, em duas gravações: se a segunda falhasse, sobrava um frasco solto no Estoque; o erro era genérico | Uma transação só (`salvarProtocolo(p, itens, frascosNovos)`); erro com `mensagemDeErro` | `dados/cores-estoque.test.ts` |
| A36 | Baixa | Ao registrar dose, o frasco pré-escolhido podia ser um vencido mesmo havendo outro bom; com vários frascos não havia regra clara | `escolherFrasco`: o ligado à linha (ou o último usado) se tem saldo e não venceu; senão o mais antigo não vencido (aberto antes do lacrado); vencido só se não houver outro (aí aparece o aviso de vencido) | `dominio/estoque.test.ts` |
| P03 | Pedido | Movimento leve só com CSS (`transform`/`opacity`, 120–250 ms, nada em loop, sem biblioteca): cartões entram subindo em cascata curta (até 6, 40 ms entre eles), toque encolhe 2% cartões e botões, fundo da aba escolhida desliza (Ativos/Pausados/Concluídos) e a lista reentra, folha sobe e desce, diálogo cresce e encolhe, aviso (toast) sobe, barra de progresso desliza até o valor. Com "reduzir movimento" no aparelho, tudo desliga (folha/diálogo fecham na hora) | e2e (toda a jornada com as animações ligadas) + navegador com e sem `prefers-reduced-motion` |

Conferido no build servido como no Pages (390×844, toque), com e sem "reduzir movimento": Protocolos, Hoje, detalhe com e sem frasco, Estoque, Histórico, passo 2 (calculadora), passo 4 (cor e frasco novo / sem frasco), Editar (troca de cor), folha Registrar dose, menu do protocolo. Nenhum alvo novo menor que 44 px (o único de 24 px é a caixa "Ciclo com pausa", dentro de uma linha clicável de 44 px, como antes), nenhum texto em inglês, sem rolagem lateral, console limpo, nenhuma animação ativa 700 ms depois de abrir cada tela (nada em loop); com "reduzir movimento", nenhuma animação.

Tamanho do build (gzip): CSS 5,54 → 6,27 KB; JS do app 58,45 → 61,76 KB (inclui cor, estoque e animações; as animações são só CSS + ~20 linhas de JS para a saída das folhas). React e bibliotecas sem mudança.

Limitações desta rodada:
- ~~Remover um item de uma lista não tem animação de saída~~ e ~~ações que fecham a folha por conta própria fecham na hora~~: resolvidos em M04 e M05 abaixo.
- Apagar protocolo: os frascos ligados continuam no Estoque, sem vínculo (como já era). O app não pergunta o que fazer com eles.
- Doses em UI não descontam mg (o app não converte UI); o saldo e as "doses restantes" desses frascos não mudam com elas.

## Rodada de 09/11/2026 (noite, 2): "sinto o app sem vida, sem fluidez"

Relato do dono (celular, detalhe do protocolo, logo depois de registrar uma dose): "Quando eu registro a dose poderia aparecer uma animaçãozinha né? Aparece esse card branco de dose registrada, mas sinto o app sem vida, sem fluidez".

| # | Tipo | O que mudou | Coberto por |
|---|---|---|---|
| M01 | Pedido | **Momento "dose registrada"** (~800 ms, otimista): no toque em Salvar, vibração curta (onde existe), o aviso aparece com um círculo que estala, um check que se desenha e uma onda verde que se expande uma vez; a linha nova em "Últimos registros", no Histórico e nos registros avulsos de Hoje entra deslizando com um brilho verde que esmaece; "Frasco: N doses restantes", o saldo do Estoque, o "N de M" de Hoje e o peso rolam do valor antigo ao novo (`useNumeroAnimado`, termina exatamente no valor final); em Hoje, o cartão da dose troca de estado com animação (círculo vazio → check desenhado com onda) e o cartão de destaque troca para a próxima dose com uma leve mola. A gravação começa na hora; a animação não espera nada. Se a gravação falhar, o aviso vira "Não deu para registrar a dose", a folha continua aberta com o motivo e o destaque não aparece (`comOtimismo`) | `ui/movimento.test.ts` (contagem, otimismo, destaque) + e2e passos 19, 22 |
| M02 | Pedido | **Tudo feito hoje**: quando todas as doses previstas do dia foram tomadas (pular não conta), Hoje mostra o cartão "Tudo feito hoje" com check grande, duas ondas e a próxima dose (amanhã). A celebração maior só toca quando acabou de acontecer (abrir o app com tudo feito mostra o cartão parado). Desfazer volta para a dose pendente com animação | `resumoHoje` em `ui/movimento.test.ts` + e2e passo 23 |
| M03 | Pedido | **Aviso (toast) novo, um componente para todos os avisos**: fundo escuro do tema (`sup2`) com borda, check animado (sucesso), ícone de informação ou de alerta (erro), botão Desfazer turquesa sobre fundo escuro (contraste 9,3:1; título 14,2:1; texto 9,0:1), entrada de baixo com mola, barrinha que mostra quanto falta para sumir (6 s; pausa com o dedo em cima), arrastar para o lado dispensa, saída descendo. Antes era um cartão branco que destoava do tema | `ui/movimento.test.ts` (relógio com pausa, arraste) + e2e passos 19–21 (cor, contraste, tempo, Desfazer) |
| M04 | Pedido | **Saída de folhas e diálogos em qualquer fechamento** (antes só X, tocar fora e Esc): salvar, apagar, cancelar, trocar de folha e trocar de tela também animam. Técnica: a camada sai da tela na hora e uma cópia inerte (sem toque, sem leitor de tela) faz a saída por cima por 180 ms ("fantasma"); o véu escuro esmaece separado do painel. Nada espera a animação | e2e passos 19, 21 (cópia removida, nenhuma folha sobrando) |
| M05 | Pedido | **Saída de itens de lista**: registro desfeito/apagado desliza e some (~200 ms) em "Últimos registros", Histórico e registros avulsos de Hoje (`useListaComSaida` / `mesclarSaida`) | `ui/movimento.test.ts` (lista com saída) + e2e passo 20 |
| M06 | Pedido | **Transição entre telas** com a View Transitions API: abrir uma tela entra da direita, voltar (botão do app ou do celular) entra da esquerda, troca de aba e troca no mesmo lugar só esmaecem (160 ms). A barra de baixo e o aviso ficam parados. A camada da transição não segura toque. Sem a API no navegador, a troca continua direta | `ui/movimento.test.ts` (direção) + e2e passo 24 |
| M07 | Pedido | **Barra de baixo**: um fundo só que desliza de uma aba para a outra com mola curta | e2e passo 24 |
| M08 | Pedido | **Toque**: todo botão e link tem estado de pressionado (botões grandes e chips encolhem 3%, ícones 10%, links de texto esmaecem, o resto esmaece de leve) | navegador |
| M09 | Pedido | **Carregando**: em vez do texto seco, nada nos primeiros 150 ms (carregar rápido não pisca) e depois blocos de esqueleto parados (sem brilho em loop); para leitor de tela continua "Carregando…" e o teto de 8 s continua | e2e passo 7 + revisão |
| M10 | Pedido | **Gráfico de peso**: a linha se desenha ao abrir e ao trocar o período (700 ms), os pontos aparecem logo depois. Barra de saldo do Estoque passou a usar `transform` (antes `width`) e desliza ao mudar | navegador |
| M11 | Técnica | Curvas e durações viraram tokens CSS em `:root` (`--curva-saida`, `--curva-mola`, `--curva-sair`; `--dur-toque` 120 ms … `--dur-longa` 340 ms, `--dur-festa` 800 ms). Só `transform`/`opacity` (e `stroke-dashoffset` nos checks e na linha do gráfico); nada em loop; sem blur, sem sombra animada; sem biblioteca nova. Histórico longo usa `content-visibility: auto` | revisão + e2e (nenhuma animação rodando 1,2 s depois, exceto a barrinha de tempo do aviso) |
| M12 | Técnica | "Reduzir movimento" no aparelho: tudo desliga (inclusive a transição entre telas e a cópia de saída); registrar, desfazer e trocar de tela continuam funcionando, sem nenhuma animação | e2e passo 25 |

Conferido no build servido como no Pages, Chrome 390×844 com toque e CPU 4× mais lenta, com capturas em sequência (0 a 1,4 s) do registro no detalhe do protocolo, do Desfazer e da última dose do dia em Hoje: a celebração roda e termina (nenhuma animação ativa 1,4 s depois, exceto a barrinha do aviso), a folha desce opaca com o véu esmaecendo, a linha nova aparece com o brilho, o contador do frasco rola 10 → 9 e volta 9 → 10 ao desfazer. Trocas rápidas de aba e voltar/avançar 4× seguidos terminam na tela certa, sem piscar nem travar. Hoje, Protocolos, Peso, Estoque e Histórico: nenhum alvo menor que 44 px, nenhum texto em inglês, console limpo.

Tamanho do build (gzip): CSS 6,27 → 7,49 KB; JS do app 61,77 → 65,41 KB (+3,6 KB: aviso novo, celebração, contagem, lista com saída, transição entre telas). React e bibliotecas sem mudança (sem biblioteca nova).

Limitações desta rodada:
- A transição entre telas depende da View Transitions API (Chrome/Edge/Android recentes e Safari 18+). Sem ela (Firefox, iPhone antigo), a troca é direta, como antes. Ao abrir o app por um link direto e usar o voltar do celular para uma tela nunca visitada nesta sessão, essa primeira volta pode não animar.
- Na tela de detalhe (sem barra de abas) o aviso fica perto da borda de baixo e cobre o botão "Registrar dose agora" pelos 6 s (dá para arrastar para o lado). Assim a linha nova de "Últimos registros" fica visível.
- A vibração só existe em Android; iPhone não vibra por site.
- Saída animada nas listas cobre registros de dose (Hoje, detalhe, Histórico). Frascos, medidas, fotos e substâncias apagados ainda somem na hora (a tela costuma mudar junto).
- Testado em Chrome de computador simulando celular (toque e CPU lenta); não testado em aparelho Android/iPhone real.

## Rodada de 09/11/2026 (noite, 3): Hoje como painel

Pedido do dono: "seria legal na pagina inicial [...] ter um gerencial dele, resumo da semana com proximas doses".

| # | Tipo | O que mudou | Coberto por |
|---|---|---|---|
| H01 | Pedido | **Sua semana** (seg a dom) abaixo das doses de hoje: 7 dias com pontinhos na cor dos protocolos e estado com ícone + número (previstas, feitas/previstas), hoje destacado; "X de Y doses tomadas nesta semana"; selo "Tudo feito nos últimos N dias de dose" só quando N > 1 | `dominio/painel.test.ts` (semana vazia, só semanal, pausa no meio, fim e encerrado na semana, virada de ano, horário de verão, sequência) + e2e passos 26, 27, 31 |
| H02 | Pedido | **Doses de um dia** (tocar num dia): folha com o estado de cada dose; dia passado registra pelo fluxo de dose atrasada (a folha M32 agora diz "prevista ontem às …" quando a dose é de outro dia); dia futuro só mostra | e2e passos 28, 29 |
| H03 | Pedido | **Atenção**: só aparece com algo a resolver; cada cartão é a ação (dose de ontem sem registro, frasco vencido/vencendo, frasco acabando com 2 doses ou menos e nenhum outro da substância, sem frasco, protocolo terminando em 7 dias, backup antigo) | `dominio/painel.test.ts` (dose atrasada, frasco acabando/vencido, sem frasco, terminando) + e2e passos 29, 30, 31 |
| H04 | Pedido | **Próximas doses** (5, a partir de amanhã, agrupadas por dia, com a cor) e **Peso e estoque** (último peso e diferença desde o primeiro, sem julgar; frascos em uso e o mais perto de acabar) | `dominio/painel.test.ts` + e2e passo 26 |
| H05 | Técnica | Contas puras em `dominio/painel.ts`; a tela faz uma conta só (`useMemo`) por mudança de dados ou a cada 30 s do relógio; registros indexados por dia previsto uma vez por conta. A lista "Doses de hoje" passou a usar a mesma conta (`dosesDoDia`), então os números de cima e da semana nunca divergem | revisão + e2e passo 27 |
| H06 | Baixa | O aviso "frasco passou da data" aparecia também para frasco já vazio pelos registros (junto com "sem frasco"). Agora só frasco com saldo gera aviso de data | `dominio/painel.test.ts` |

Conferido no build servido como no Pages (toque, 390×844 e 360×640): sem protocolos (painel não aparece, "Criar protocolo"), 1 protocolo semanal, 3 protocolos (diário, 2×/semana, blend) com todos os tipos de aviso, e com "reduzir movimento" (nenhuma animação na tela nem na folha do dia). Console limpo, nenhum alvo < 44 px (dia da semana com 46 px em 360), sem rolagem lateral, sem texto em inglês. Em 390×844 com 3 protocolos, a faixa da semana termina logo acima da barra de abas; em 360×640 ela fica logo abaixo da dobra.

Tamanho do build (gzip): JS do app 65,41 → 69,66 KB; CSS 7,49 → 7,59 KB. Sem biblioteca nova.

Limitações desta rodada:
- Mudar a frequência de um protocolo muda os dias passados da semana também (o app não guarda o histórico da frequência; mesma limitação do Histórico).
- Registro com horário antigo (o horário mudou depois) conta para o dia nos dias passados; hoje ele aparece à parte, como antes.
- "Ver tudo" leva a Protocolos: o app ainda não tem uma agenda das doses futuras.

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
