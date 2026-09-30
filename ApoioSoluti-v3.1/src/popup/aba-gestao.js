// Aba GO (o Gestão+, solutivd.gestao.plus): dois caminhos para a mesma
// tela de pedido.
//
//   CPF/CNPJ  -> parceiro -> lista de vendas dele -> detalhe do pedido
//   nº pedido -> lista de pedidos com aquele final -> detalhe do pedido
//
// Os dois desembocam em buscarDetalhePedido(), que é onde o atendimento
// realmente acontece.

/* Leitura do que vem da API ---------------------------------------- */

// O Gestão+ nao tem um contrato publicado: o mesmo dado aparece com nomes
// diferentes conforme o endpoint. Em vez de escolher um nome e quebrar
// quando ele muda, cada campo lista os nomes que ja foram vistos.
function primeiroValor(objeto, chaves) {
  for (const chave of chaves) {
    const valor = objeto?.[chave];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }

  return null;
}

// HAL: os objetos relacionados (parceiro, produto, unidade) vem aninhados
// em _embedded
function embutido(objeto, chave) {
  return objeto?._embedded?.[chave] || null;
}

function formatarMoeda(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return valor || "—";

  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// as datas vem como { date: "aaaa-mm-dd hh:mm:ss" } em UTC, sem o fuso
// escrito — dai o "Z" na hora de interpretar e o fuso de Sao Paulo na
// hora de mostrar
function formatarData(campoData) {
  const bruto = campoData?.date || campoData;
  if (!bruto) return "—";

  const data = new Date(String(bruto).replace(" ", "T") + "Z");
  if (Number.isNaN(data.getTime())) return String(bruto);

  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/* Lista de pedidos --------------------------------------------------- */

// Uma linha de pedido, clicavel. Serve as duas listas (a do parceiro e a
// da busca por numero); a diferenca e que a segunda mostra tambem de quem
// e o pedido, porque ali os pedidos podem ser de parceiros diferentes.
function criarLinhaPedido(mov, { mostrarParceiro } = {}) {
  const codigo = primeiroValor(mov, ["codigo", "code"]);
  const voucher = primeiroValor(mov, ["voucher", "numeroVoucher"]);
  const data = primeiroValor(mov, ["dataNegociacao", "dataFaturamento"]);
  const total = primeiroValor(mov, ["valorTotal"]);

  const linha = document.createElement("div");
  linha.className = "registro";
  linha.title = "Ver detalhes do pedido";
  linha.setAttribute("role", "button");
  linha.tabIndex = 0;

  const topo = document.createElement("div");
  topo.className = "registro-topo";

  const id = document.createElement("span");
  id.className = "registro-id";
  id.textContent = `#${mov.id}`;

  const detalhe = document.createElement("span");
  detalhe.className = "registro-detalhe";
  detalhe.textContent = [codigo, voucher].filter(Boolean).join(" · ") || "—";

  topo.appendChild(id);
  topo.appendChild(detalhe);
  linha.appendChild(topo);

  const meta = document.createElement("div");
  meta.className = "registro-meta";
  meta.textContent = [
    mostrarParceiro ? embutido(mov, "parceiro")?.nome : null,
    data ? formatarData(data) : null,
    total ? formatarMoeda(total) : null
  ]
    .filter(Boolean)
    .join("  ·  ");

  if (meta.textContent) linha.appendChild(meta);

  linha.addEventListener("click", () => buscarDetalhePedido(mov.id));
  linha.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    buscarDetalhePedido(mov.id);
  });

  return linha;
}

function preencherListaPedidos(container, movimentacoes, opcoes) {
  container.innerHTML = "";

  if (!movimentacoes.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Nenhuma movimentação/venda encontrada para esse parceiro.";
    container.appendChild(vazio);
    return;
  }

  movimentacoes.forEach((mov) => {
    container.appendChild(criarLinhaPedido(mov, opcoes));
  });
}

let ultimaBuscaGestao = null;
let ultimaListaBuscaPedido = null;

function renderizarResultadoGestao(parceiro, movimentacoes, documento) {
  ultimaBuscaGestao = { parceiro, movimentacoes, documento };

  const nome = primeiroValor(parceiro, ["nome", "razaoSocial", "nomeFantasia"]);
  $("gestaoParceiroNome").textContent = nome
    ? `${nome} (#${parceiro.id})`
    : `Parceiro #${parceiro.id}`;

  const email = primeiroValor(parceiro, ["email", "emailCadastro", "emailContato"]);
  $("gestaoParceiroEmail").textContent = email || "—";

  preencherListaPedidos($("gestaoMovimentacoes"), movimentacoes);

  $("detalhePedido").classList.add("hidden");
  $("resultadoGestao").classList.remove("hidden");
}

function renderizarListaBuscaPedido(movimentacoes) {
  ultimaListaBuscaPedido = { movimentacoes };

  preencherListaPedidos($("listaBuscaPedido"), movimentacoes, { mostrarParceiro: true });
  $("resultadoBuscaPedido").classList.remove("hidden");
}

/* Detalhe do pedido -------------------------------------------------- */

let ultimoPedidoGestao = null;

function renderizarDetalhePedido(pedido, itens, historico) {
  ultimoPedidoGestao = { pedido, itens, historico };

  const parceiro = embutido(pedido, "parceiro");
  const tipoDeNegociacao = embutido(pedido, "tipoDeNegociacao");

  $("pedidoTitulo").textContent = pedido.codigo
    ? `Pedido ${pedido.codigo} (#${pedido.id})`
    : `Pedido #${pedido.id}`;

  // as tres situacoes, so as que vieram preenchidas
  const badges = $("pedidoBadges");
  badges.innerHTML = "";

  [
    ["Financeiro", pedido.situacaoFinanceiro],
    ["NF", pedido.situacaoNf],
    ["Entrega", pedido.situacaoEntrega]
  ].forEach(([rotulo, valor]) => {
    if (!valor) return;

    const badge = document.createElement("span");
    badge.className = "gestao-pedido-badge";
    if (/cancel|revogad|estorn/i.test(valor)) badge.classList.add("alerta");
    badge.textContent = `${rotulo}: ${valor}`;
    badges.appendChild(badge);
  });

  preencherLinhasChaveValor($("pedidoDados"), [
    {
      rotulo: "Parceiro",
      valor: parceiro ? `${parceiro.nome || parceiro.razaoSocial || "—"} (#${parceiro.id})` : null
    },
    { rotulo: "E-mail", valor: parceiro?.email },
    { rotulo: "Forma de pagamento", valor: tipoDeNegociacao?.descricao },
    { rotulo: "Tipo de movimentação", valor: embutido(pedido, "tipoMovimentacao")?.descricao },
    { rotulo: "Unidade", valor: embutido(pedido, "unidade")?.descricao },
    { rotulo: "Vendedor", valor: embutido(pedido, "vendedor")?.nome },
    { rotulo: "Negociado em", valor: formatarData(pedido.dataNegociacao) },
    { rotulo: "Faturado em", valor: formatarData(pedido.dataFaturamento) },
    { rotulo: "Código externo", valor: pedido.codigoExterno }
  ]);

  // Itens
  const listaItens = $("pedidoItens");
  listaItens.innerHTML = "";

  if (!itens.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Nenhum item encontrado.";
    listaItens.appendChild(vazio);
  } else {
    itens.forEach((item) => {
      const linha = document.createElement("div");
      linha.className = "gestao-pedido-item";

      const nome = document.createElement("span");
      nome.className = "gestao-pedido-item-nome";
      nome.textContent = embutido(item, "produto")?.descricao || item.descricao || "Item";

      const quantidade = document.createElement("span");
      quantidade.className = "gestao-pedido-item-linha";
      quantidade.textContent =
        `Qtd: ${item.quantidade ?? "—"}  ·  Unitário: ${formatarMoeda(item.valorUnitario)}`;

      const subtotal = document.createElement("span");
      subtotal.className = "gestao-pedido-item-linha";
      const desconto = Number(item.valorDesconto || 0) > 0
        ? `  ·  Desconto: ${formatarMoeda(item.valorDesconto)}`
        : "";
      subtotal.textContent = `Subtotal: ${formatarMoeda(item.subTotal)}${desconto}`;

      linha.appendChild(nome);
      linha.appendChild(quantidade);
      linha.appendChild(subtotal);
      listaItens.appendChild(linha);
    });
  }

  $("pedidoDesconto").textContent = formatarMoeda(pedido.valorDesconto);
  $("pedidoFrete").textContent = formatarMoeda(pedido.valorFrete);
  $("pedidoRetido").textContent = formatarMoeda(pedido.valorRetido);
  $("pedidoTotal").textContent = formatarMoeda(pedido.valorTotal);

  // Historico: do mais antigo para o mais recente, que e como se conta a
  // historia do pedido. Entradas sem situacao nem descricao sao auditoria
  // interna ("alteracao de item") e so poluiriam a leitura.
  const listaHistorico = $("pedidoHistorico");
  listaHistorico.innerHTML = "";

  const relevante = (historico || [])
    .filter((h) => h.situacao || h.descricao)
    .sort((a, b) => new Date(a.data?.date || 0) - new Date(b.data?.date || 0));

  if (!relevante.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Nenhum histórico encontrado.";
    listaHistorico.appendChild(vazio);
  } else {
    relevante.forEach((h) => {
      const linha = document.createElement("div");
      linha.className = "gestao-pedido-historico-item";

      const cabecalho = document.createElement("div");
      cabecalho.className = "gestao-pedido-historico-cabecalho";

      const situacao = document.createElement("span");
      situacao.className = "gestao-pedido-historico-situacao";
      situacao.textContent = h.situacao || "Registro";
      cabecalho.appendChild(situacao);

      // o codigo da solicitacao e a ponte para a aba Consulta: e por ele
      // que se abre a solicitacao na AR
      if (h.codigo) {
        const codigo = document.createElement("span");
        codigo.className = "gestao-pedido-historico-codigo";
        codigo.textContent = `Cód. solicitação: ${h.codigo}`;
        cabecalho.appendChild(codigo);
      }

      const descricao = document.createElement("span");
      descricao.className = "gestao-pedido-historico-descricao";
      descricao.textContent = h.descricao || "—";

      const data = document.createElement("span");
      data.className = "gestao-pedido-historico-data";
      data.textContent = formatarData(h.data);

      linha.appendChild(cabecalho);
      linha.appendChild(descricao);
      linha.appendChild(data);
      listaHistorico.appendChild(linha);
    });
  }

  $("detalhePedido").classList.remove("hidden");
  $("detalhePedido").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function buscarDetalhePedido(movimentacaoId) {
  const aviso = $("avisoPedido");

  mostrarAviso(aviso, "Buscando dados do pedido...", "");
  $("detalhePedido").classList.add("hidden");

  function mostrarPedido({ pedido, itens, historico }, textoOk) {
    limparErroNaAba("gestao");
    renderizarDetalhePedido(pedido, itens || [], historico || []);
    guardarUltimoResultadoGestao();
    mostrarAviso(aviso, textoOk, "ok");
    if ($("copiarPedidoAoAbrir").checked) copiarDetalhePedido();
  }

  const emCache = await obterCache("gestaoPedido", String(movimentacaoId));
  if (emCache) {
    mostrarPedido(emCache, "Pedido da última busca (sem consultar de novo).");
    return;
  }

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "buscarPedidoGestaoPlus",
      movimentacaoId
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Não foi possível buscar o pedido.", "erro");
      marcarErroNaAba("gestao");
      if (erroPareceSessao(resposta?.erro)) marcarSessao("gestao", false);
      return;
    }

    marcarSessao("gestao", true);

    const pedido = {
      pedido: resposta.pedido,
      itens: resposta.itens || [],
      historico: resposta.historico || []
    };

    salvarCache("gestaoPedido", String(movimentacaoId), pedido);
    mostrarPedido(pedido, "Pedido carregado.");
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("gestao");
  }
}

function copiarDetalhePedido() {
  if (!ultimoPedidoGestao) return;

  const { pedido, itens, historico } = ultimoPedidoGestao;
  const parceiro = embutido(pedido, "parceiro");

  const linhas = [
    `Pedido: ${pedido.codigo || "—"} (#${pedido.id})`,
    `Parceiro: ${parceiro?.nome || "—"}${parceiro?.email ? ` <${parceiro.email}>` : ""}`,
    `Forma de pagamento: ${embutido(pedido, "tipoDeNegociacao")?.descricao || "—"}`,
    `Situação financeiro: ${pedido.situacaoFinanceiro || "—"}`,
    `Situação NF: ${pedido.situacaoNf || "—"}`,
    `Situação entrega: ${pedido.situacaoEntrega || "—"}`,
    `Negociado em: ${formatarData(pedido.dataNegociacao)}`,
    `Faturado em: ${formatarData(pedido.dataFaturamento)}`,
    "",
    "Itens:"
  ];

  itens.forEach((item) => {
    linhas.push(
      `- ${embutido(item, "produto")?.descricao || "Item"} | Qtd ${item.quantidade ?? "—"} | ` +
      `Unitário ${formatarMoeda(item.valorUnitario)} | Subtotal ${formatarMoeda(item.subTotal)}`
    );
  });

  linhas.push(
    "",
    `Desconto: ${formatarMoeda(pedido.valorDesconto)}`,
    `Frete: ${formatarMoeda(pedido.valorFrete)}`,
    `Total: ${formatarMoeda(pedido.valorTotal)}`,
    "",
    "Histórico:"
  );

  historico
    .filter((h) => h.situacao || h.descricao)
    .sort((a, b) => new Date(a.data?.date || 0) - new Date(b.data?.date || 0))
    .forEach((h) => {
      const codigo = h.codigo ? ` (cód. solicitação: ${h.codigo})` : "";
      linhas.push(
        `- [${formatarData(h.data)}] ${h.situacao || "Registro"}${codigo}: ${h.descricao || "—"}`
      );
    });

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoPedido"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoPedido"), "Não foi possível copiar.", "erro"));
}

/* Buscas ------------------------------------------------------------- */

async function buscarPedidoPorNumero() {
  const campo = $("numeroPedidoGestao");
  const botao = $("buscarPedidoNumeroBtn");
  const aviso = $("avisoBuscaPedido");
  const numero = campo.value.trim();

  if (!numero) {
    mostrarAviso(aviso, "Digite o número do pedido.", "erro");
    campo.focus();
    return;
  }

  $("resultadoBuscaPedido").classList.add("hidden");
  $("detalhePedido").classList.add("hidden");

  // Um resultado so nao merece uma lista de um item: abre o pedido direto,
  // que e o que o atendente ia clicar em seguida de qualquer jeito.
  async function mostrar(movimentacoes, sufixo) {
    if (movimentacoes.length === 1) {
      mostrarAviso(aviso, `Pedido encontrado${sufixo}.`, "ok");
      salvarNoHistorico("gestaoPedido", numero, movimentacoes[0].codigo || numero);
      await buscarDetalhePedido(movimentacoes[0].id);
      return;
    }

    mostrarAviso(aviso, `${movimentacoes.length} pedidos encontrados${sufixo}. Escolha um.`, "ok");
    salvarNoHistorico("gestaoPedido", numero);
    renderizarListaBuscaPedido(movimentacoes);
    guardarUltimoResultadoGestao();
  }

  const emCache = await obterCache("gestaoBuscaPedido", numero);
  if (emCache) {
    await mostrar(emCache.movimentacoes, " (última busca)");
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando pedido...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "buscarPedidoPorCodigoGestaoPlus",
      codigo: numero
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum pedido encontrado.", "erro");
      marcarErroNaAba("gestao");
      if (erroPareceSessao(resposta?.erro)) marcarSessao("gestao", false);
      return;
    }

    limparErroNaAba("gestao");
    marcarSessao("gestao", true);

    const movimentacoes = resposta.movimentacoes || [];
    salvarCache("gestaoBuscaPedido", numero, { movimentacoes });

    await mostrar(movimentacoes, "");
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("gestao");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

async function buscarHistoricoGestao() {
  const campo = $("documentoGestao");
  const botao = $("buscarGestaoBtn");
  const aviso = $("avisoGestao");
  const documento = campo.value.trim();

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ do parceiro.", "erro");
    campo.focus();
    return;
  }

  $("resultadoGestao").classList.add("hidden");

  const rotuloHistorico = (parceiro) => {
    const nome = primeiroValor(parceiro, ["nome", "razaoSocial", "nomeFantasia"]);
    return nome ? `${nome} — ${documento}` : documento;
  };

  const emCache = await obterCache("gestaoDocumento", documento);
  if (emCache) {
    renderizarResultadoGestao(emCache.parceiro, emCache.movimentacoes, documento);
    mostrarAviso(aviso, "Resultado da última busca (sem consultar de novo).", "ok");
    guardarUltimoResultadoGestao();
    salvarNoHistorico("gestaoDocumento", documento, rotuloHistorico(emCache.parceiro));
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no GO...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "buscarHistoricoGestaoPlus",
      cpfCnpj: documento
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      marcarErroNaAba("gestao");
      if (erroPareceSessao(resposta?.erro)) marcarSessao("gestao", false);
      return;
    }

    const movimentacoes = resposta.movimentacoes || [];

    renderizarResultadoGestao(resposta.parceiro, movimentacoes, documento);
    mostrarAviso(aviso, "Busca concluída.", "ok");

    salvarCache("gestaoDocumento", documento, { parceiro: resposta.parceiro, movimentacoes });
    limparErroNaAba("gestao");
    marcarSessao("gestao", true);
    guardarUltimoResultadoGestao();
    salvarNoHistorico("gestaoDocumento", documento, rotuloHistorico(resposta.parceiro));
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("gestao");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function copiarResultadoGestao() {
  if (!ultimaBuscaGestao) return;

  const { parceiro, movimentacoes, documento } = ultimaBuscaGestao;

  const linhas = [
    `Documento: ${documento}`,
    `Parceiro: ${primeiroValor(parceiro, ["nome", "razaoSocial", "nomeFantasia"]) || "—"} (#${parceiro.id})`,
    `E-mail: ${primeiroValor(parceiro, ["email", "emailCadastro", "emailContato"]) || "—"}`,
    ""
  ];

  movimentacoes.forEach((mov) => {
    const codigo = primeiroValor(mov, ["codigo", "code"]);
    const voucher = primeiroValor(mov, ["voucher", "numeroVoucher"]);
    linhas.push(`#${mov.id} — ${[codigo, voucher].filter(Boolean).join(" · ") || "—"}`);
  });

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoGestao"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoGestao"), "Não foi possível copiar.", "erro"));
}

/* O que fica na tela entre uma abertura e outra ----------------------
   O popup fecha a cada clique fora e recarrega do zero. As outras abas
   perdem so o que estava digitado, e o sessao.js devolve; aqui o que se
   perdia era o pedido inteiro, que custou uma busca para chegar ali.

   Mesma regra do sessao.js: storage.session, porque isto e dado de
   cliente e nao tem por que tocar o disco.
   ------------------------------------------------------------------ */

const ULTIMO_RESULTADO_GESTAO = "ultimoResultadoGestao";

// grava o que estiver visivel, na ordem do mais especifico para o mais
// geral — e o pedido aberto que interessa guardar, nao a lista atras dele
async function guardarUltimoResultadoGestao() {
  if (!chrome.storage.session) return;

  const visivel = (id) => !$(id).classList.contains("hidden");

  let estado = null;
  if (visivel("detalhePedido") && ultimoPedidoGestao) {
    estado = { tipo: "pedido", dados: ultimoPedidoGestao };
  } else if (visivel("resultadoGestao") && ultimaBuscaGestao) {
    estado = { tipo: "parceiro", dados: ultimaBuscaGestao };
  } else if (visivel("resultadoBuscaPedido") && ultimaListaBuscaPedido) {
    estado = { tipo: "lista", dados: ultimaListaBuscaPedido };
  }

  if (!estado) return;

  try {
    await chrome.storage.session.set({ [ULTIMO_RESULTADO_GESTAO]: estado });
  } catch {
    // sem espaco: na proxima abertura o painel volta vazio, so isso
  }
}

async function restaurarUltimoResultadoGestao() {
  if (!chrome.storage.session) return;

  try {
    const guardado = await chrome.storage.session.get(ULTIMO_RESULTADO_GESTAO);
    const estado = guardado[ULTIMO_RESULTADO_GESTAO];
    if (!estado) return;

    if (estado.tipo === "pedido") {
      const { pedido, itens, historico } = estado.dados;
      renderizarDetalhePedido(pedido, itens, historico);
    } else if (estado.tipo === "parceiro") {
      const { parceiro, movimentacoes, documento } = estado.dados;
      renderizarResultadoGestao(parceiro, movimentacoes, documento);
    } else if (estado.tipo === "lista") {
      renderizarListaBuscaPedido(estado.dados.movimentacoes);
    }
  } catch {
    // nada guardado: o painel comeca vazio, como na primeira vez
  }
}

/* Preferência "copiar ao abrir" -------------------------------------
   Quem trabalha registrando o atendimento cola o pedido inteiro toda
   vez. Ligada, a copia acontece junto com a abertura do pedido.
   storage.local (e nao session) porque isto e preferencia de quem usa,
   nao dado de cliente.
   ------------------------------------------------------------------ */

const COPIAR_AO_ABRIR_CHAVE = "copiarPedidoAoAbrir";

async function carregarPreferenciaCopiarAoAbrir() {
  try {
    const guardado = await chrome.storage.local.get(COPIAR_AO_ABRIR_CHAVE);
    $("copiarPedidoAoAbrir").checked = Boolean(guardado[COPIAR_AO_ABRIR_CHAVE]);
  } catch {
    // sem storage: fica desligado, sem travar o resto do popup
  }
}

$("copiarPedidoAoAbrir").addEventListener("change", (evento) => {
  chrome.storage.local
    .set({ [COPIAR_AO_ABRIR_CHAVE]: evento.target.checked })
    .catch(() => {});
});

/* Controles ---------------------------------------------------------- */

$("buscarGestaoBtn").addEventListener("click", buscarHistoricoGestao);
$("copiarGestaoBtn").addEventListener("click", copiarResultadoGestao);
$("buscarPedidoNumeroBtn").addEventListener("click", buscarPedidoPorNumero);
$("copiarPedidoBtn").addEventListener("click", copiarDetalhePedido);

$("fecharPedidoBtn").addEventListener("click", () => {
  $("detalhePedido").classList.add("hidden");

  // fechou de proposito: esse pedido nao deve reaparecer sozinho na
  // proxima abertura do popup
  chrome.storage.session?.remove(ULTIMO_RESULTADO_GESTAO).catch(() => {});
});

$("documentoGestao").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarHistoricoGestao();
});

$("numeroPedidoGestao").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarPedidoPorNumero();
});

registrarHistorico("gestaoDocumento", {
  containerId: "historicoGestaoDocumento",
  campoId: "documentoGestao",
  aoSelecionar: buscarHistoricoGestao
});

registrarHistorico("gestaoPedido", {
  containerId: "historicoGestaoPedido",
  campoId: "numeroPedidoGestao",
  aoSelecionar: buscarPedidoPorNumero
});
