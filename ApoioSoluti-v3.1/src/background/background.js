importScripts(
  // onde cada sistema mora, como checar a sessão dele e o que abrir no
  // começo do dia. Vem primeiro: quase todo o resto lê daqui.
  "../dados/sistemas.js",

  // o que abre no começo do dia e em que ordem: o popup edita, aqui se lê
  "../comum/rotina-dia.js",

  // Apache Arrow: le a tabela binaria que o Databricks devolve.
  // Terceiro, nao editar — vem antes de quem usa.
  "../../lib/arrow.js",

  // falar com a aba aberta: injetar, avisar, ler a seleção
  "comum.js",

  // Ctrl+M: seleção na tela -> print -> OCR no documento offscreen
  "captura-ocr.js",

  // o menu de botão direito e o roteamento dos cliques dele
  "menu-contexto.js",

  // código -> API busca-urls -> abre a AR ou a solicitação
  "ar-solicitacao.js",

  // raspagem diária de soluti.com.br/lojas/ para a aba Atender
  "lojas-sync.js",

  // monta o rascunho no Outlook Web e tenta clicar em Enviar
  "email-outlook.js",

  // token da aba logada e indicador de sessão — usado pelas três consultas
  // que dependem de login, logo abaixo
  "sistemas-sessao.js",

  // consultas de atendimento, uma por sistema
  "databricks.js",
  "sdeal.js",
  "gestao-plus.js",
  "wings.js",

  // põe os sistemas todos no ar de uma vez, no começo do expediente
  "abertura-dia.js"
);
