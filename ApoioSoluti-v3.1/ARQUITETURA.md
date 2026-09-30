# Apoio Soluti — mapa do código

Ferramentas de atendimento do Suporte B2C, como extensão de navegador (MV3).
Desenvolvido por Vitor Azevedo (v1 e v2); reescrito e mantido por Vinícius
Zoccoli (v3 em diante).

Este arquivo responde a duas perguntas: **onde mexer** e **por que o código
está partido assim**. Os arquivos `.js` não têm cabeçalho: o que cada um faz
está na tabela aqui embaixo, e o porquê de cada decisão está em comentário,
junto da linha a que ele se refere.

---

## Os quatro processos

Uma extensão não é um programa só. São quatro ambientes separados, cada um
com o seu tempo de vida e as suas limitações — e é isso, mais do que
qualquer preferência de estilo, que decide o que mora onde.

| Processo | Vive enquanto | Enxerga | Não pode |
|---|---|---|---|
| **popup** | a janelinha está aberta | o próprio HTML | tocar na página do usuário |
| **background** (service worker) | um evento está sendo tratado | as APIs `chrome.*` | usar DOM, canvas, `window` |
| **content script** | a aba existe | o DOM da página | usar a maior parte das APIs `chrome.*` |
| **offscreen** | o background mantém vivo | DOM e canvas, sem tela | receber eventos do usuário |

O background **morre quando fica ocioso e acorda de novo a cada evento**.
Todo arquivo dele roda do começo, muitas vezes por dia. Nada ali pode
assumir que é a primeira vez — é por isso que o alarme das lojas só é criado
se ainda não existir.

Os quatro conversam por `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`.
Nenhum deles chama função do outro diretamente.

```
                        ┌─────────────┐
    Ctrl+M ────────────▶│             │──── recorta + OCR ───▶ offscreen
    Ctrl+Shift+S ──────▶│             │◀─── texto lido ───────
    botão direito ─────▶│ background  │
                        │             │──── desenha seleção ─▶ content
    popup ─────────────▶│             │──── avisa na tela ───▶ script
                        └─────────────┘
                               │
                               ├──▶ API busca-urls (abre a AR / a solicitação)
                               ├──▶ soluti.com.br/lojas/ (1x por dia)
                               ├──▶ Outlook Web (rascunho pronto)
                               └──▶ as quatro consultas de atendimento:
                                      Databricks, S.Deal, Gestão+, Wings
```

---

## As quatro consultas de atendimento

Databricks, S.Deal, Gestão+ e Wings respondem a mesma pergunta por quatro
caminhos diferentes: **o que esse cliente tem?** A busca inteira mora no
background, e não na tela, por três motivos que valem para as quatro:

1. o popup fecha ao perder o foco — uma busca começada nele morreria no meio;
2. o service worker consegue mandar requisição com os cookies e o token da
   sessão que o atendente já tem aberta, sem pedir senha nenhuma;
3. uma implementação só, que o popup e (no futuro) qualquer outra tela usam
   pela mesma mensagem.

O que muda de uma para a outra é só como cada sistema deixa entrar:

| Sistema | Como a extensão entra | Onde quebra quando quebrar |
|---|---|---|
| **Databricks** | Nenhum login: fala o protocolo do Streamlit por WebSocket | Os ids dos campos, se alguém editar o painel |
| **S.Deal** | Cookie de sessão (`credentials: "include"`) | A sequência de requisições, se a tela mudar |
| **GO** (Gestão+) | Token lido da aba logada, no `Authorization` | Os nomes dos campos da resposta |
| **Wings** | O mesmo token, em outra API (`billing.vaultid.com.br`) | O formato do `user-deep-detail` |

A lista da abertura do dia mistura duas origens: os sistemas de
`src/dados/sistemas.js`, que as abas de consulta também usam e por isso só
podem ser desmarcados, e os endereços acrescentados pelo atendente, que são
dele e saem quando quiser. A ordem é a do array salvo; um sistema novo na
tabela entra no fim, sem desmanchar a ordem já montada.

**A extensão não guarda senha de ninguém.** Ela se pendura na sessão que
você já tem aberta no navegador — cookie, ou token lido da aba logada. A
aba **Começar** abre os sistemas e diz em quais falta login; quem digita é
você, com o preenchimento do próprio navegador. Se um dia isso virar um
cofre de senhas, o ponto de entrada é um só: `precisaDeLogin()`, no
`abertura-dia.js` — e os sistemas marcados como `entra: "sso"` continuam
de fora, porque SSO não tem formulário para preencher.

Nenhum resultado dessas consultas toca o disco: o cache das últimas buscas
e o último pedido aberto ficam em `storage.session`, pela mesma razão do
`sessao.js` — são dados de cliente.

---

## As camadas, do mais básico ao mais específico

A dependência flui numa direção só. `dados` não conhece ninguém; `comum` só
conhece `dados`; as telas conhecem os dois; os entry points conhecem tudo.

```
lib/          terceiros (Tesseract, Apache Arrow) — não editar
src/dados/    tabelas fixas, zero lógica
src/comum/    gravação no storage, dividida entre popup e content script
src/popup/    a janelinha
src/content/  o que é injetado nas páginas
src/background/  o service worker
src/offscreen/   o OCR
```

---

## Arquivo por arquivo

### Raiz

| Arquivo | O que é |
|---|---|
| `manifest.json` | O que a extensão declara ao navegador: permissões, atalhos, quais scripts entram em quais páginas. Quem quiser saber o que roda onde, começa aqui. |

### `src/dados/` — tabelas fixas

Dados puros. Mudam por um motivo diferente do código (alguém atualizou a
planilha), então moram longe dele.

| Arquivo | O que é |
|---|---|
| `macros-equipe.js` | Os macros da equipe, iguais para todo mundo. `window.MACROS_EQUIPE` |
| `emails-equipe.js` | Os modelos de e-mail da equipe. `window.EMAILS_EQUIPE` |
| `lojas.js` | Fallback das lojas para a primeira abertura. Depois vale o storage. `window.LOJAS_SOLUTI` |
| `parceiros-internacionais.json` | 19 ARs fora do Brasil. Mesmo formato da lista nacional (`{ meta, registros }`) e buscada junto com ela. |
| `sistemas.js` | Os sistemas do atendimento: onde cada um mora, como checar a sessão dele e o que abrir no começo do dia. Carregado pelo popup **e** pelo background, por isso `const` solto em vez de `window.X` — no service worker não existe `window`. |
| `parceiros-nacionais.json` | 3.476 ARs do Brasil. É `.json`, não script, porque como `<script>` era lido em toda abertura do popup mesmo para quem só ia usar os macros. Cada registro traz grupo econômico, AR, unidade, endereço com CEP, telefone e e-mail. |

### `src/comum/` — dividido entre popup e content script

| Arquivo | O que é |
|---|---|
| `macros.js` | Onde os macros do atendente ficam guardados: sync (viaja entre máquinas, partido em pedaços de ~7KB por causa do limite de 8KB por item) com local como cópia completa e rede de segurança. Também tem a saudação por horário. `window.ApoioMacros` |
| `emails.js` | O mesmo, para os modelos de e-mail. `window.ApoioEmails` |
| `rotina-dia.js` | O que abre no começo do dia e em que ordem: a lista salva, misturada com a tabela de sistemas. Mesma divisão sync/local dos macros, sem partir em pedaços — a lista é pequena. Único arquivo desta pasta dividido entre popup e **background** (e não content script), daí funções soltas em vez de `window.ApoioX`. |

### `src/background/` — o service worker

`background.js` não tem lógica: é o índice que carrega os outros por
`importScripts`. São scripts clássicos dividindo um escopo global só, então
a ordem ali é só a de leitura — em execução, qualquer um enxerga qualquer um.

| Arquivo | O que é |
|---|---|
| `background.js` | O índice. Comece por aqui para saber tudo que a extensão faz fora das telas. |
| `comum.js` | Falar com a aba: injetar, mandar mensagem, avisar na tela, ler a seleção. Usado por quase todos os outros. |
| `captura-ocr.js` | Ctrl+M: seleção na tela → print → OCR no offscreen → texto na área de transferência. |
| `menu-contexto.js` | O menu de botão direito e o roteamento dos cliques dele. |
| `ar-solicitacao.js` | Código → API busca-urls → abre a AR ou a solicitação. Chegam aqui o atalho Ctrl+Shift+S, o menu e o popup. |
| `lojas-sync.js` | Raspa `soluti.com.br/lojas/` uma vez por dia. Ancorado em rótulos de texto — se o site mudar, quebra aqui. |
| `email-outlook.js` | Monta o rascunho no Outlook Web e tenta clicar em Enviar. O Cco vem pronto na mensagem: ele é do modelo, e quem escolheu o modelo foi a tela. |
| `sistemas-sessao.js` | Como a extensão entra nos sistemas que pedem login: lê o token da aba logada, renova quando dá 401, e responde ao popup se há sessão ativa em cada um. Usado pelo Gestão+ e pelo Wings. |
| `databricks.js` | Consulta as solicitações do cliente. Fala o protocolo do Streamlit na mão — os ids dos campos estão no alto do arquivo, e é neles que se mexe quando o painel muda. |
| `sdeal.js` | Busca de voucher. Sistema legado, sem API: quatro requisições em ordem, e a resposta vem como JavaScript, não JSON. |
| `gestao-plus.js` | Parceiro, pedidos e o detalhe do pedido. |
| `wings.js` | Assinatura, autenticações e o perfil do usuário. |
| `abertura-dia.js` | Põe os sistemas no ar de uma vez, na ordem da rotina. Três regras mandam nele: não duplica aba, não faz login, e não tenta de novo. O que conta como "já aberta" muda conforme a coisa: sistema da tabela é um **site** (qualquer aba dele serve, o que importa é a sessão); endereço acrescentado é uma **página** (só a própria serve, senão dois documentos do mesmo site brigam pela mesma aba). |

### `src/content/` — injetado nas páginas

| Arquivo | Onde entra | O que é |
|---|---|---|
| `content.js` | toda página | Macros nos campos de texto, a camada de seleção do Ctrl+M, e a tarja de aviso. |
| `visualizador.js` | toda página | "Ampliar imagem". A imagem ampliada é DOM de verdade, não UI do navegador — por isso entra no print e o OCR funciona por cima dela. |
| `gridlocalizar.js` | `*.acsoluti.com.br` | Quando a página é o JSON do gridlocalizar, manda a aba para o grid visual. |

### `src/offscreen/` — o OCR

| Arquivo | O que é |
|---|---|
| `offscreen.html` | Documento invisível. Existe só para dar DOM e canvas ao OCR, que o service worker não tem. |
| `offscreen.js` | Recorta, melhora a imagem e roda o Tesseract. Nada sai do navegador. |

### `src/popup/` — a janelinha

São scripts clássicos num escopo global só, carregados na ordem listada em
`popup.html`. **A ordem importa**: o que roda no topo de um arquivo só
enxerga o que já foi carregado. `popup.js` vem por último porque as chamadas
de partida no fim dele precisam que todas as abas já tenham se definido.

| Arquivo | O que é |
|---|---|
| `popup.html` | A tela. No fim dele está a lista de scripts, comentada com o porquê da ordem. |
| `popup.css` | O estilo, com as duas paletas (clara e escura). |
| `sessao.js` | Guarda o que está na tela e remonta ao reabrir — o popup fecha a cada clique fora. Só em `storage.session`: nada vai para o disco, porque são dados de cliente. |
| `tema.js` | Aplica o tema no `<head>`, antes da primeira pintura, para o popup não piscar. Por isso a escolha mora no `localStorage`, que é síncrono. |
| `ui.js` | Peças que mais de uma aba usa: `$()`, botões de ícone, o aviso, as linhas "rótulo: valor" dos resultados, o arrastar-para-reordenar e todo o mecanismo de cartão selecionável. Não conhece loja, parceiro nem e-mail. |
| `buscas.js` | O que as quatro abas de consulta dividem: o pontinho de erro no ícone, o ponto de sessão, o histórico do que já foi buscado e o cache das três últimas buscas por aba. Não sabe o que é voucher nem pedido. |
| `aba-macros.js` | Aba **Macros**: lista, detalhe, criar/editar/excluir, importar/exportar. |
| `aba-consulta-codigo.js` | Aba **Consulta**: um código, dois destinos — o site da AR ou a solicitação. |
| `aba-dia.js` | Aba **Começar**: monta a lista do que abre (ordem, marcar/desmarcar, acrescentar endereço), mostra onde já há sessão, e dispara a abertura. |
| `aba-databricks.js` | Aba **Databricks**: um cartão por solicitação do cliente. |
| `aba-sdeal.js` | Aba **S.Deal**: os dados de um voucher. |
| `aba-gestao.js` | Aba **Gestão+**: parceiro ou número do pedido, os dois levando ao detalhe do pedido. A maior das quatro. |
| `aba-wings.js` | Aba **Wings**: assinatura e autenticações no topo; o resto em seções recolhidas. |
| `aba-ocr.js` | Aba **Captura**: mostra o atalho e dispara a extração. |
| `aba-atender.js` | Aba **Atender**, a casca: qual dos três escopos está aberto. |
| `aba-atender-lojas.js` | Aba Atender, escopo **Lojas**. |
| `aba-atender-parceiros.js` | Aba Atender, escopos **Nacional** e **Internacional**. |
| `aba-emails.js` | Aba **E-mails**: montar e enviar, mais os modelos. Cada modelo tem o seu Cco, ou nenhum. |
| `backup.js` | Levar tudo para outro PC: um arquivo com macros, modelos de e-mail e a rotina. Os botões ficam no painel da aba Começar, mas o arquivo é separado porque mexe em três abas e não tem a ver com começar o dia. |
| `popup.js` | A casca e a partida: tema, troca de abas, versão no rodapé, a busca que chega do menu de contexto. **Carregado por último.** |

### `lib/` — terceiros

Tesseract (worker, wasm, `por.traineddata`). Não editar; trocar só por uma
versão nova inteira.

---

## O que viaja entre máquinas

Três coisas são do atendente, e não da extensão: os macros, os modelos de
e-mail e a lista da abertura do dia. As três seguem a mesma regra.

| | Onde |
|---|---|
| **sync** | viaja sozinho entre máquinas logadas no mesmo navegador |
| **local** | cópia completa, sempre gravada; é dela que se lê quando o sync não responde |
| **arquivo** | aba Começar > Exportar tudo, para quando o sync não serve |

O sync só entrega se a pessoa estiver logada com a mesma conta do navegador
nos dois lados. Máquina nova ainda sem login, outro navegador, ou perfil
corporativo que não permite entrar com conta: nesses casos nada viaja
sozinho, e o arquivo é o único caminho. Por isso ele existe, mesmo com o
sync funcionando.

Quando o sync recusa uma gravação (cota, sync desligado, sem conta), cada
módulo **para de insistir** e apaga as próprias chaves de lá — insistir
esbarraria no limite de gravações por minuto, e uma versão parcial no sync
sobrescreveria a boa do local na leitura seguinte.

O resto (histórico de buscas, cache, o último pedido aberto, o que estava
digitado) é de máquina ou de sessão, e não viaja de propósito.

---

## Onde mexer, por tarefa

| Quero... | Vou em |
|---|---|
| acrescentar um macro da equipe | `src/dados/macros-equipe.js` |
| acrescentar um modelo de e-mail da equipe | `src/dados/emails-equipe.js` (`cco` é opcional em cada um) |
| mudar quem recebe cópia oculta de um tipo de e-mail | aba E-mails > Modelos, campo **Cco** do modelo |
| mudar o que aparece no cartão de loja | `src/popup/aba-atender-lojas.js` |
| mudar um item do menu de botão direito | `src/background/menu-contexto.js` |
| consertar a leitura das lojas depois de o site mudar | `src/background/lojas-sync.js` |
| mexer no visual | `src/popup/popup.css` |
| consertar o Databricks depois de o painel mudar | `DATABRICKS_WIDGETS`, em `src/background/databricks.js` |
| acrescentar um campo a uma consulta | a lista `CAMPOS_*` da aba, em `src/popup/aba-<sistema>.js` |
| mudar quantas buscas ficam em cache | `CACHE_POR_ESCOPO`, em `src/popup/buscas.js` |
| guardar mais alguma coisa entre aberturas | `CAMPOS_GUARDADOS`, em `src/popup/sessao.js` |
| mudar um atalho de teclado | `manifest.json`, bloco `commands` |
| trocar a URL de um sistema, ou acrescentar um | `src/dados/sistemas.js` |
| acrescentar um endereço só para mim | aba **Começar** > **Acrescentar** (fica no storage, não no código) |
| levar a minha configuração para outro PC | aba **Começar** > **Exportar tudo** / **Importar** |
| mudar a ordem das abas do popup | arrastar a aba na própria barra (fica salva, e viaja pelo sync) |
| mudar a ordem do que abre de manhã | arrastar o cartão na aba **Começar** (ou Alt + setas) |
| um sistema que abre de novo mesmo já aberto | `origens` dele, em `src/dados/sistemas.js` |
| mudar o nome ou a cor do grupo de abas | `GRUPO_ABERTURA`, em `src/background/abertura-dia.js` |
| acrescentar uma aba nova ao popup | painel em `popup.html`, arquivo `aba-*.js` novo, `<script>` na lista, e a aba em `paineis` no `popup.js` |

---

## Como testar

Não há build: os arquivos são carregados como estão.

1. `edge://extensions` (ou `chrome://extensions`) → **Modo do desenvolvedor**
2. **Carregar sem compactação** → escolher a pasta que tem o `manifest.json`
3. Depois de qualquer alteração, o botão de **recarregar** no cartão da extensão
4. Abas que já estavam abertas continuam com o content script velho — o
   background reinjeta ao usar, mas recarregar a aba é mais previsível
