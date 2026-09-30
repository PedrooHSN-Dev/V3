// tres posicoes: "lojas" | "nacional" | "internacional". As duas ultimas
// compartilham a lista de parceiros; a primeira tem lista propria.
let escopoAtual = "lojas";

// carrega a lista do escopo aberto. Lojas e parceiros tem preparacoes
// independentes e so a do escopo visivel precisa acontecer.
function prepararEscopoAtual() {
  if (escopoAtual === "lojas") {
    prepararLojas();
    return;
  }

  prepararParceiros().catch((erro) => {
    $("parceirosContador").textContent =
      "Não foi possível carregar a lista de parceiros.";
    console.error("Apoio Soluti: parceiros:", erro);
  });
}

/* Os tres botoes de escopo sao ligados aqui, e NAO junto com o resto dos
   controles de parceiros (ligarControlesParceiros). Ficando la, eles so
   ganhavam ouvinte depois que a lista de parceiros carregasse — e ela so
   carrega quando o escopo ja saiu de "lojas", que e o escopo inicial.
   Resultado: os botoes de nacional/internacional nao respondiam ao clique,
   e nao havia como sair de "lojas". */
$("escopoLojas").addEventListener("click", () => trocarEscopo("lojas"));
$("escopoNacional").addEventListener("click", () => trocarEscopo("nacional"));
$("escopoInternacional").addEventListener("click", () =>
  trocarEscopo("internacional")
);

function trocarEscopo(escopo) {
  if (escopo === escopoAtual) return;
  escopoAtual = escopo;

  const ehLojas = escopo === "lojas";
  const nacional = escopo === "nacional";

  $("escopoLojas").classList.toggle("ativo", ehLojas);
  $("escopoNacional").classList.toggle("ativo", nacional);
  $("escopoInternacional").classList.toggle("ativo", escopo === "internacional");

  $("bloco-lojas").classList.toggle("hidden", !ehLojas);
  $("bloco-parceiros").classList.toggle("hidden", ehLojas);

  if (ehLojas) {
    prepararLojas();
    $("buscaLoja").focus();
    return;
  }

  // UF so faz sentido no nacional
  $("filtroUf").style.display = nacional ? "" : "none";
  if (!nacional) $("filtroUf").value = "";

  // tem de bater com os campos que entram na chave de busca (chaveBusca, em
  // aba-atender-parceiros.js): prometer um campo que nao e indexado faz a
  // busca parecer quebrada. "responsavel" saiu daqui quando a lista nova
  // deixou de ter esse campo.
  $("buscaParceiro").placeholder = nacional
    ? "Buscar AR, unidade, município, bairro, telefone..."
    : "Buscar AR, unidade, país, cidade, telefone...";

  $("buscaParceiro").value = "";
  $("buscaParceiro").focus();

  prepararEscopoAtual();
  renderizarParceiros();
}
