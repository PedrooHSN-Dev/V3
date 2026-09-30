const MAX_RESULTADOS = 60;

// As duas listas sao .json no mesmo formato ({ meta, registros }) e so sao
// buscadas quando a aba de parceiros e aberta pela primeira vez. A nacional
// tem ~3.500 ARs (mais de um mega): como <script> ela era lida na abertura do
// popup, mesmo para quem so ia usar os macros.
const ARQUIVO_PARCEIROS_NACIONAIS = "../dados/parceiros-nacionais.json";
const ARQUIVO_PARCEIROS_INTL = "../dados/parceiros-internacionais.json";

let parceirosPromessa = null;
let parceirosCarregando = false;
let controlesParceirosLigados = false;
let indiceNacional = [];
let indiceIntl = [];
let parceirosFiltrados = [];
let formatadorParceiroAtual = null;

/* Campos do registro ----------------------------------------------- */

// A mesma AR aparece em varias unidades ("AR Carmo e Franco" tem dezenas):
// e a unidade que diz qual ponto e esse. Quando ela repete o nome da AR nao
// acrescenta nada e sai do cartao.
function unidadeVisivel(r) {
  return semAcento(r.unidade) === semAcento(r.ar) ? "" : r.unidade;
}

function bairroVisivel(r) {
  return r.bairro && r.bairro !== r.municipio ? r.bairro : "";
}

function linhaLocalNacional(r) {
  const bairro = bairroVisivel(r);
  return bairro ? `${r.municipio} — ${bairro}` : r.municipio;
}

// ha cidade que se repete no campo de regiao ("Braga, Braga")
function regiaoVisivel(r) {
  return r.regiao !== r.cidade ? r.regiao : "";
}

function linhaLocalIntl(r) {
  return [r.cidade, regiaoVisivel(r), r.bairro].filter(Boolean).join(" — ");
}

function linhaEnderecoNacional(r) {
  return r.cep ? `${r.endereco} — CEP ${r.cep}` : r.endereco;
}

// fora do Brasil o codigo postal nao e CEP e cada pais tem o seu formato:
// entra sem rotulo
function linhaEnderecoIntl(r) {
  return r.codigo_postal ? `${r.endereco} — ${r.codigo_postal}` : r.endereco;
}

/* Texto copiado de cada cartao ------------------------------------- */

// no cartao a posicao diz o que e cada coisa; o texto colado sai desse
// contexto, entao cada informacao vai rotulada. Campo vazio nao vira linha
// em branco: some.
function textoEtiquetado(pares) {
  return pares
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `${etiqueta}: ${valor}`)
    .join("\n");
}

function textoParceiroNacional(r) {
  return textoEtiquetado([
    ["AR", r.ar],
    ["Unidade", unidadeVisivel(r)],
    ["Cidade", `${r.municipio} (${r.uf})`],
    ["Bairro", bairroVisivel(r)],
    ["Endereço", r.endereco],
    ["CEP", r.cep],
    ["Telefone", formatarTelefone(r.telefone)],
    ["E-mail", r.email]
  ]);
}

function textoParceiroIntl(r) {
  return textoEtiquetado([
    ["AR", r.ar],
    ["Unidade", unidadeVisivel(r)],
    ["País", r.pais],
    ["Cidade", r.cidade],
    ["Região", regiaoVisivel(r)],
    ["Bairro", r.bairro],
    ["Endereço", r.endereco],
    ["Código postal", r.codigo_postal],
    ["Telefone", r.telefone],
    ["E-mail", r.email]
  ]);
}

/* Carregamento e controles ----------------------------------------- */

function prepararParceiros() {
  if (!parceirosPromessa) {
    parceirosPromessa = montarParceiros().catch((erro) => {
      // deixa a proxima visita a aba tentar de novo
      parceirosPromessa = null;
      throw erro;
    });
  }

  return parceirosPromessa;
}

async function montarParceiros() {
  ligarControlesParceiros();

  parceirosCarregando = true;
  renderizarParceiros();

  let nacional = [];
  let intl = [];

  try {
    [nacional, intl] = await Promise.all([
      buscarRegistros(ARQUIVO_PARCEIROS_NACIONAIS),
      buscarRegistros(ARQUIVO_PARCEIROS_INTL)
    ]);
  } finally {
    parceirosCarregando = false;
  }

  // pre-normaliza uma vez: a busca depois e so um includes no campo "chave"
  indiceNacional = nacional.map((r, i) => ({
    ...r,
    _id: `nac-${i}`,
    chave: chaveBusca([
      r.ar, r.unidade, r.uf, r.municipio, r.bairro,
      r.endereco, r.cep, r.telefone, r.email
    ])
  }));

  indiceIntl = intl.map((r, i) => ({
    ...r,
    _id: `intl-${i}`,
    chave: chaveBusca([
      r.ar, r.unidade, r.pais, r.cidade, r.regiao,
      r.bairro, r.endereco, r.codigo_postal, r.telefone, r.email
    ])
  }));

  const ufs = [...new Set(nacional.map((r) => r.uf))].sort();
  const select = $("filtroUf");
  ufs.forEach((uf) => {
    const opcao = document.createElement("option");
    opcao.value = uf;
    opcao.textContent = uf;
    select.appendChild(opcao);
  });

  renderizarParceiros();
}

async function buscarRegistros(arquivo) {
  const resposta = await fetch(arquivo);
  if (!resposta.ok) throw new Error(`${arquivo} respondeu ${resposta.status}`);

  const conteudo = await resposta.json();
  return conteudo.registros;
}

// campos vazios vem null e virariam "null" dentro da chave. Telefone e CEP
// chegam formatados ("(66) 99954-2943"): a versao so-digitos entra junto,
// para quem busca digitando o numero corrido.
function chaveBusca(campos) {
  const digitos = campos
    .filter((campo) => campo && /\d/.test(campo))
    .map((campo) => campo.replace(/\D/g, ""));

  return semAcento([...campos, ...digitos].filter(Boolean).join(" "));
}

// ligados antes do fetch: quem abre a aba ja pode digitar e trocar de escopo
// enquanto a lista carrega
function ligarControlesParceiros() {
  if (controlesParceirosLigados) return;
  controlesParceirosLigados = true;

  $("buscaParceiro").addEventListener("input", renderizarParceiros);
  $("filtroUf").addEventListener("change", renderizarParceiros);

  $("copiarTodasParceiros").addEventListener("click", () => {
    const marcados = [...selecoes[grupoParceiroAtual()].values()];

    copiarTodas(
      marcados.length
        ? marcados
        : parceirosFiltrados.map((r) => formatadorParceiroAtual(r)),
      $("copiarTodasParceiros"),
      sincronizarSelecaoParceiros
    );
  });

  // limpa so o escopo aberto: nacional e internacional tem selecoes proprias
  $("limparSelecaoParceiros").addEventListener("click", () => {
    selecoes[grupoParceiroAtual()].clear();
    renderizarParceiros();
  });
}

function grupoParceiroAtual() {
  return escopoAtual === "internacional" ? "intl" : "nacional";
}

function sincronizarSelecaoParceiros() {
  const total = selecoes[grupoParceiroAtual()].size;
  const etiqueta = $("parceirosSelecao");
  const botao = $("copiarTodasParceiros");

  etiqueta.textContent = total
    ? `${total} selecionada${total === 1 ? "" : "s"}`
    : "";
  etiqueta.classList.toggle("hidden", !total);
  $("limparSelecaoParceiros").classList.toggle("hidden", !total);

  botao.textContent = total ? `Copiar selecionadas (${total})` : "Copiar todas";
  botao.disabled = total ? false : !parceirosFiltrados.length;
}

/* Lista e cartoes -------------------------------------------------- */

function renderizarParceiros() {
  if (escopoAtual === "nacional") {
    renderizarListaParceiros(indiceNacional, criarCartaoNacional, $("filtroUf").value);
  } else {
    renderizarListaParceiros(indiceIntl, criarCartaoIntl, "");
  }
}

function renderizarListaParceiros(indice, criarCartao, uf) {
  const termo = semAcento($("buscaParceiro").value.trim());
  const lista = $("listaParceiros");
  const contador = $("parceirosContador");

  const termos = termo.split(/\s+/).filter(Boolean);

  const achados = indice.filter((r) => {
    if (uf && r.uf !== uf) return false;
    return termos.every((t) => r.chave.includes(t));
  });

  // guarda para o "Copiar todas" (todos os filtrados, nao so os exibidos)
  parceirosFiltrados = achados;
  formatadorParceiroAtual =
    escopoAtual === "nacional" ? textoParceiroNacional : textoParceiroIntl;
  sincronizarSelecaoParceiros();

  const total = achados.length;
  const mostrados = achados.slice(0, MAX_RESULTADOS);

  lista.innerHTML = "";

  if (!total) {
    const vazio = document.createElement("li");
    vazio.className = "parceiro-vazio";

    if (parceirosCarregando) {
      contador.textContent = "Carregando parceiros...";
      vazio.textContent = "Um instante.";
    } else {
      contador.textContent = "Nenhuma AR encontrada.";
      vazio.textContent = "Ajuste a busca ou o filtro.";
    }

    lista.appendChild(vazio);
    return;
  }

  contador.textContent =
    total > MAX_RESULTADOS
      ? `${total} ARs — mostrando as ${MAX_RESULTADOS} primeiras`
      : `${total} ${total === 1 ? "AR encontrada" : "ARs encontradas"}`;

  const fragmento = document.createDocumentFragment();
  mostrados.forEach((r) => fragmento.appendChild(criarCartao(r)));

  if (total > MAX_RESULTADOS) {
    const mais = document.createElement("li");
    mais.className = "parceiro-mais";
    mais.textContent = "Refine a busca para ver as demais.";
    fragmento.appendChild(mais);
  }

  lista.appendChild(fragmento);
}

function criarCartaoNacional(r) {
  const item = document.createElement("li");
  item.className = "parceiro";

  const texto = textoParceiroNacional(r);

  const topo = document.createElement("div");
  topo.className = "parceiro-topo";

  const nome = document.createElement("span");
  nome.className = "parceiro-nome";
  nome.textContent = r.ar;

  const uf = document.createElement("span");
  uf.className = "parceiro-uf";
  uf.textContent = r.uf;

  topo.appendChild(nome);
  montarTopoCartao(topo, item, texto, uf);
  item.appendChild(topo);

  adicionarUnidade(item, r);
  adicionarLocalEndereco(item, linhaLocalNacional(r), linhaEnderecoNacional(r));
  adicionarRodape(item, formatarTelefone(r.telefone), r.email);

  tornarSelecionavel(item, "nacional", r, texto);
  return item;
}

function criarCartaoIntl(r) {
  const item = document.createElement("li");
  item.className = "parceiro";

  const texto = textoParceiroIntl(r);

  const topo = document.createElement("div");
  topo.className = "parceiro-topo";

  const nome = document.createElement("span");
  nome.className = "parceiro-nome";
  nome.textContent = r.ar;

  const pais = document.createElement("span");
  pais.className = "parceiro-pais";
  pais.textContent = r.pais;

  topo.appendChild(nome);
  montarTopoCartao(topo, item, texto, pais);
  item.appendChild(topo);

  adicionarUnidade(item, r);
  adicionarLocalEndereco(item, linhaLocalIntl(r), linhaEnderecoIntl(r));
  adicionarRodape(item, r.telefone, r.email);

  tornarSelecionavel(item, "intl", r, texto);
  return item;
}

function adicionarUnidade(item, r) {
  const unidade = unidadeVisivel(r);
  if (!unidade) return;

  const linha = document.createElement("div");
  linha.className = "parceiro-unidade";
  linha.textContent = unidade;
  item.appendChild(linha);
}

function adicionarLocalEndereco(item, local, endereco) {
  const linhaLocal = document.createElement("div");
  linhaLocal.className = "parceiro-local";
  linhaLocal.textContent = local;
  item.appendChild(linhaLocal);

  const linhaEndereco = document.createElement("div");
  linhaEndereco.className = "parceiro-end";
  linhaEndereco.textContent = endereco;
  item.appendChild(linhaEndereco);
}

// e-mail em faixa propria, como no cartao de loja: e longo e precisa da
// elipse de .cartao-email
function adicionarRodape(item, telefone, email) {
  const rodape = document.createElement("div");
  rodape.className = "parceiro-rodape";

  const tel = document.createElement("span");
  tel.className = "parceiro-tel";
  tel.textContent = telefone || "Sem telefone";
  rodape.appendChild(tel);

  item.appendChild(rodape);

  if (!email) return;

  const faixaEmail = document.createElement("div");
  faixaEmail.className = "parceiro-rodape cartao-email";

  const endereco = document.createElement("span");
  endereco.className = "parceiro-tel";
  endereco.textContent = email;
  faixaEmail.appendChild(endereco);

  item.appendChild(faixaEmail);
}
