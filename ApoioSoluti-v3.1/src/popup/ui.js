const $ = (id) => document.getElementById(id);

function gerarId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `macro-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ICONE_LAPIS =
  '<path d="M3 14.2V17h2.8l8.3-8.3-2.8-2.8L3 14.2zM17.7 6.1a.8.8 0 0 0 0-1.1l-1.7-1.7a.8.8 0 0 0-1.1 0l-1.4 1.4 2.8 2.8 1.4-1.4z"/>';

const ICONE_LIXEIRA =
  '<path d="M6.5 2.5h7v1.6h4v1.7h-15V4.1h4V2.5zM4.8 7.5h10.4l-.8 9.6a1.7 1.7 0 0 1-1.7 1.6H7.3a1.7 1.7 0 0 1-1.7-1.6l-.8-9.6zm3.1 2v7h1.6v-7H7.9zm3.3 0v7h1.6v-7h-1.6z"/>';

function criarBotaoIcone(classe, rotulo, caminho, aoClicar) {
  const botao = document.createElement("button");
  botao.className = `acao icone ${classe}`;
  botao.title = rotulo;
  botao.setAttribute("aria-label", rotulo);
  botao.innerHTML = `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">${caminho}</svg>`;
  botao.addEventListener("click", aoClicar);
  return botao;
}

function criarCabecalhoGrupo(texto) {
  const cabecalho = document.createElement("li");
  cabecalho.className = "grupo";
  cabecalho.textContent = texto;
  return cabecalho;
}

/* Aviso que aparece e some sozinho, usado pelas ferramentas ------- */

const avisoTimers = new WeakMap();

function mostrarAviso(elemento, texto, tipo) {
  elemento.textContent = texto;
  elemento.className = `ferramenta-aviso ${tipo || ""}`.trim();

  clearTimeout(avisoTimers.get(elemento));

  if (tipo === "ok") {
    const timer = setTimeout(() => {
      elemento.textContent = "";
      elemento.className = "ferramenta-aviso";
    }, 4000);
    avisoTimers.set(elemento, timer);
  }
}

/* Linhas "rotulo: valor" -------------------------------------------
   O formato de resultado das abas de consulta (S.Deal, Wings e
   Databricks mostram os tres a mesma coisa: um par por linha). Campo
   vazio nao vira linha em branco — some.
   ------------------------------------------------------------------ */

function preencherLinhasChaveValor(container, campos) {
  container.innerHTML = "";

  const visiveis = campos.filter(
    ({ valor }) => valor !== undefined && valor !== null && valor !== ""
  );

  if (!visiveis.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Sem informações disponíveis.";
    container.appendChild(vazio);
    return;
  }

  visiveis.forEach(({ rotulo, valor }) => {
    const linha = document.createElement("div");
    linha.className = "linha-cv";

    const r = document.createElement("span");
    r.className = "linha-cv-rotulo";
    r.textContent = rotulo;

    const v = document.createElement("span");
    v.className = "linha-cv-valor";
    // textContent, nao innerHTML: o valor vem de um sistema externo
    v.textContent = valor;

    linha.appendChild(r);
    linha.appendChild(v);
    container.appendChild(linha);
  });
}

/* Selecao de cartoes ------------------------------------------------
   Clicar no cartao marca/desmarca; o botao de copia dentro dele copia
   so aquele. O texto ja formatado vai junto no mapa de selecao, para o
   "Copiar selecionadas" continuar funcionando depois que a busca mudar
   e o cartao sair da tela.
   ------------------------------------------------------------------ */

const selecoes = {
  loja: new Map(),
  nacional: new Map(),
  intl: new Map()
};

const ICONE_COPIAR =
  '<path d="M7.2 2.5h7.3c.9 0 1.6.7 1.6 1.6v7.4h-1.7V4.2H7.2V2.5z"/>' +
  '<path d="M4 5.8h7.5c1 0 1.7.8 1.7 1.7v8.3c0 1-.8 1.7-1.7 1.7H4c-1 0-1.7-.8-1.7-1.7V7.5c0-1 .8-1.7 1.7-1.7zm0 1.7v8.3h7.5V7.5H4z"/>';

function piscarCopiado(item) {
  item.classList.add("copiado");

  const selo = document.createElement("span");
  selo.className = "selo-copiado";
  selo.textContent = "Copiado";
  item.appendChild(selo);

  setTimeout(() => {
    item.classList.remove("copiado");
    selo.remove();
  }, 900);
}

function criarBotaoCopiarCartao(item, texto) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "cartao-copiar";
  botao.title = "Copiar só este";
  botao.setAttribute("aria-label", "Copiar este cartão");
  botao.innerHTML =
    `<svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">${ICONE_COPIAR}</svg>`;

  botao.addEventListener("click", async (evento) => {
    // o clique no cartao alterna a selecao: aqui a acao e so copiar
    evento.stopPropagation();

    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      return;
    }

    piscarCopiado(item);
  });

  return botao;
}

function sincronizarSelecao(grupo) {
  if (grupo === "loja") sincronizarSelecaoLojas();
  else sincronizarSelecaoParceiros();
}

function tornarSelecionavel(item, grupo, registro, texto) {
  const selecao = selecoes[grupo];

  item.classList.add("copiavel");
  item.title = "Clique para selecionar";

  // o cartao e um controle de verdade, nao so uma area clicavel: entra na
  // ordem de tabulacao e responde a Enter/Espaco como qualquer botao
  item.setAttribute("role", "button");
  item.tabIndex = 0;

  function refletir(marcado) {
    item.classList.toggle("selecionado", marcado);
    item.setAttribute("aria-pressed", marcado ? "true" : "false");
  }

  refletir(selecao.has(registro._id));

  function alternar() {
    const marcado = selecao.has(registro._id);

    if (marcado) selecao.delete(registro._id);
    else selecao.set(registro._id, texto);

    refletir(!marcado);
    sincronizarSelecao(grupo);
  }

  item.addEventListener("click", alternar);

  item.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    // sem isso o Espaco rolaria a lista junto
    evento.preventDefault();
    alternar();
  });
}

// monta o canto direito do cabecalho do cartao: copiar + a etiqueta
// (UF, pais ou situacao da loja)
function montarTopoCartao(topo, item, texto, etiqueta) {
  const acoes = document.createElement("div");
  acoes.className = "parceiro-topo-acoes";

  acoes.appendChild(criarBotaoCopiarCartao(item, texto));
  acoes.appendChild(etiqueta);

  topo.appendChild(acoes);
}

// acima disso a copia pede confirmacao: sem busca nem selecao, "Copiar
// todas" leva a lista inteira (milhares de parceiros) para a area de
// transferencia num clique so
const LIMITE_COPIA_SEM_AVISO = 50;

// copia varios itens de uma vez, separados por linha em branco.
// restaurar() recalcula o rotulo em vez de devolver o antigo: a selecao
// pode ter mudado durante o aviso de "Copiadas"
async function copiarTodas(textos, botao, restaurar) {
  if (!textos.length) return;

  if (
    textos.length > LIMITE_COPIA_SEM_AVISO &&
    !confirm(`Copiar ${textos.length} registros de uma vez?`)
  ) {
    return;
  }

  const rotulo = botao.textContent;
  const conteudo = textos.join("\n\n");

  try {
    await navigator.clipboard.writeText(conteudo);
    botao.textContent = `Copiadas (${textos.length})`;
  } catch {
    botao.textContent = "Falhou";
  }

  setTimeout(() => {
    if (restaurar) restaurar();
    else botao.textContent = rotulo;
  }, 1600);
}

/* Arrastar para reordenar -------------------------------------------
   Serve as duas listas que se reordenam: os cartoes da aba Comecar (na
   vertical) e as proprias abas da extensao (na horizontal).

   Usa o arrasto nativo do HTML (draggable + dragstart/dragover/dragend)
   em vez de mousedown/mousemove: o navegador cuida da imagem arrastada,
   do cancelamento com Esc e de nao brigar com o clique dos controles que
   existem DENTRO do item (a caixa de marcar, o botao de remover).

   Quem chama marca cada item com data-ordem=<id>; ao soltar, recebe a
   lista de ids na ordem nova. A reordenacao do DOM acontece durante o
   arrasto, para o item ser visto no lugar antes de ser solto.
   ------------------------------------------------------------------ */

function tornarReordenavel(container, { eixo = "y", aoReordenar }) {
  let arrastado = null;
  let mexeu = false;

  function itemDe(alvo) {
    return alvo?.closest?.("[data-ordem]") || null;
  }

  container.addEventListener("dragstart", (evento) => {
    const item = itemDe(evento.target);
    if (!item) return;

    arrastado = item;
    mexeu = false;
    item.classList.add("arrastando");
    evento.dataTransfer.effectAllowed = "move";

    // sem escrever nada aqui, alguns navegadores nem comecam o arrasto
    evento.dataTransfer.setData("text/plain", item.dataset.ordem);
  });

  container.addEventListener("dragover", (evento) => {
    if (!arrastado) return;

    // sem isto o navegador recusa o solte e o arrasto volta do nada
    evento.preventDefault();

    const alvo = itemDe(evento.target);
    if (!alvo || alvo === arrastado) return;

    // passou da metade do vizinho: entra depois dele. A metade (e nao a
    // borda) evita o item piscar entre duas posicoes no meio do caminho.
    const caixa = alvo.getBoundingClientRect();
    const depois =
      eixo === "x"
        ? evento.clientX > caixa.left + caixa.width / 2
        : evento.clientY > caixa.top + caixa.height / 2;

    container.insertBefore(arrastado, depois ? alvo.nextSibling : alvo);
    mexeu = true;
  });

  container.addEventListener("drop", (evento) => evento.preventDefault());

  container.addEventListener("dragend", () => {
    if (!arrastado) return;

    arrastado.classList.remove("arrastando");
    arrastado = null;

    if (!mexeu) return;

    aoReordenar(
      Array.from(container.querySelectorAll("[data-ordem]")).map(
        (item) => item.dataset.ordem
      )
    );
  });
}

/* Texto ------------------------------------------------------------ */

function semAcento(texto) {
  return (texto || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatarTelefone(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel || "";
}
