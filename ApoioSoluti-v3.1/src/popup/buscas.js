// O que as quatro abas de consulta (Databricks, S.Deal, Gestão+ e Wings)
// dividem entre si: o aviso na aba, o ponto de sessão, o histórico do que
// já foi buscado e o cache das últimas buscas.
//
// Nada aqui sabe o que é um voucher ou um pedido: cada aba chama estas
// funções passando o próprio escopo.

/* Aviso de erro na aba ----------------------------------------------
   O aviso de erro fica dentro do painel, e o painel some quando o
   atendente troca de aba. O pontinho vermelho no icone sobrevive a essa
   troca — sem ele, "sua sessao expirou" passava despercebido. Some
   sozinho quando o atendente volta pra aba, ou quando a busca seguinte
   da certo.
   ------------------------------------------------------------------ */

const ABA_BADGE_ERRO = {
  databricks: "abaErroDatabricks",
  sdeal: "abaErroSdeal",
  gestao: "abaErroGestao",
  wings: "abaErroWings"
};

function marcarErroNaAba(nome) {
  const id = ABA_BADGE_ERRO[nome];
  if (id) $(id).classList.remove("hidden");
}

function limparErroNaAba(nome) {
  const id = ABA_BADGE_ERRO[nome];
  if (id) $(id).classList.add("hidden");
}

/* Ponto de sessão ----------------------------------------------------
   Verde quando ja ha sessao ativa naquele sistema, cinza quando nao ha
   (ou quando ainda nao se sabe). Quem responde e o background, olhando os
   cookies — asssim a resposta chega sem gastar uma busca de verdade. Cada
   busca depois disso corrige o ponto na hora: sucesso confirma a sessao,
   e um erro que fala em sessao/login apaga o verde.
   ------------------------------------------------------------------ */

const ABA_BADGE_SESSAO = {
  sdeal: "abaSessaoSdeal",
  gestao: "abaSessaoGestao",
  wings: "abaSessaoWings"
};

function marcarSessao(nome, ativa) {
  const id = ABA_BADGE_SESSAO[nome];
  if (!id) return;

  const ponto = $(id);
  ponto.classList.toggle("sessao-ok", Boolean(ativa));
  ponto.title = ativa
    ? "Sessão ativa"
    : "Sem sessão ativa (ou ainda não verificada)";
}

function erroPareceSessao(texto) {
  const t = (texto || "").toLowerCase();
  return t.includes("sessão") || t.includes("sessao") || t.includes("logado");
}

async function atualizarIndicadoresDeSessao() {
  try {
    const resultado = await chrome.runtime.sendMessage({ tipo: "verificarSessoes" });
    if (!resultado) return;

    Object.entries(resultado).forEach(([nome, ativa]) => marcarSessao(nome, ativa));
  } catch {
    // background reiniciando o service worker: os pontos ficam como estao
    // ate a proxima checagem, sem travar o resto do popup
  }
}

/* Histórico de buscas -----------------------------------------------
   As ultimas buscas que deram certo, por escopo. Em storage.local, e nao
   session, porque o valor de uma consulta costuma voltar no dia seguinte
   (o mesmo cliente ligando de novo) — e aqui fica so o que foi digitado,
   nunca o resultado.
   ------------------------------------------------------------------ */

const HISTORICO_CHAVE = "historicoBuscas";
const HISTORICO_LIMITE = 8;

// preenchido por registrarHistorico(): escopo -> onde desenhar e o que
// fazer ao clicar num item
const HISTORICO_CONFIG = {};

async function obterTodoHistorico() {
  try {
    const guardado = await chrome.storage.local.get(HISTORICO_CHAVE);
    return guardado[HISTORICO_CHAVE] || {};
  } catch {
    return {};
  }
}

// rotulo e opcional: quando existe (o nome do cliente, por exemplo), a
// pastilha mostra ele em vez do numero cru
async function salvarNoHistorico(escopo, valor, rotulo) {
  if (!valor) return;

  try {
    const tudo = await obterTodoHistorico();
    const lista = (tudo[escopo] || []).filter((item) => item.valor !== valor);

    lista.unshift({ valor, rotulo: rotulo || null, data: Date.now() });
    tudo[escopo] = lista.slice(0, HISTORICO_LIMITE);

    await chrome.storage.local.set({ [HISTORICO_CHAVE]: tudo });
    renderizarHistorico(escopo);
  } catch {
    // sem espaco ou storage indisponivel: a busca ja aconteceu, e perder o
    // historico e menos grave do que travar a tela por causa dele
  }
}

async function removerDoHistorico(escopo, valor) {
  try {
    const tudo = await obterTodoHistorico();
    tudo[escopo] = (tudo[escopo] || []).filter((item) => item.valor !== valor);

    await chrome.storage.local.set({ [HISTORICO_CHAVE]: tudo });
    renderizarHistorico(escopo);
  } catch {}
}

async function renderizarHistorico(escopo) {
  const config = HISTORICO_CONFIG[escopo];
  if (!config) return;

  const container = $(config.containerId);
  if (!container) return;

  const tudo = await obterTodoHistorico();
  const lista = tudo[escopo] || [];

  container.innerHTML = "";

  if (!lista.length) {
    container.classList.add("hidden");
    return;
  }

  const titulo = document.createElement("span");
  titulo.className = "historico-rotulo";
  titulo.textContent = "Recentes:";
  container.appendChild(titulo);

  lista.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "historico-chip";

    const valor = document.createElement("button");
    valor.type = "button";
    valor.className = "historico-chip-valor";
    valor.textContent = item.rotulo || item.valor;
    valor.title = "Buscar de novo";
    valor.addEventListener("click", () => {
      const campo = $(config.campoId);
      if (campo) campo.value = item.valor;
      config.aoSelecionar?.(item.valor);
    });

    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "historico-chip-remover";
    remover.textContent = "×";
    remover.title = "Remover do histórico";
    remover.addEventListener("click", () => removerDoHistorico(escopo, item.valor));

    chip.appendChild(valor);
    chip.appendChild(remover);
    container.appendChild(chip);
  });

  container.classList.remove("hidden");
}

// chamada uma vez por aba, na carga do arquivo dela
function registrarHistorico(escopo, { containerId, campoId, aoSelecionar }) {
  HISTORICO_CONFIG[escopo] = { containerId, campoId, aoSelecionar };
  renderizarHistorico(escopo);
}

/* Cache das últimas buscas -------------------------------------------
   Buscar de novo o mesmo documento e o caso comum: o atendente troca de
   aba, volta, clica num recente. Uma consulta custa segundos (o S.Deal
   sao quatro requisicoes; o Databricks e um WebSocket inteiro), entao as
   tres ultimas por escopo ficam guardadas.

   Em storage.session, e NAO local: aqui fica o resultado, que e dado de
   cliente. Some quando o navegador fecha e nunca toca o disco — a mesma
   regra do sessao.js.
   ------------------------------------------------------------------ */

const CACHE_CHAVE = "cacheBuscas";
const CACHE_POR_ESCOPO = 3;

async function obterCache(escopo, termo) {
  if (!chrome.storage.session) return null;

  try {
    const guardado = await chrome.storage.session.get(CACHE_CHAVE);
    const cache = guardado[CACHE_CHAVE] || {};
    const lista = cache[escopo] || [];

    const posicao = lista.findIndex((item) => item.termo === termo);
    if (posicao === -1) return null;

    const item = lista[posicao];

    // acertou: volta pro topo, pra nao ser o proximo a ser descartado
    if (posicao > 0) {
      lista.splice(posicao, 1);
      lista.unshift(item);
      cache[escopo] = lista;
      await chrome.storage.session.set({ [CACHE_CHAVE]: cache });
    }

    return item.dados;
  } catch {
    return null;
  }
}

async function salvarCache(escopo, termo, dados) {
  if (!chrome.storage.session) return;

  try {
    const guardado = await chrome.storage.session.get(CACHE_CHAVE);
    const cache = guardado[CACHE_CHAVE] || {};

    const lista = (cache[escopo] || []).filter((item) => item.termo !== termo);
    lista.unshift({ termo, dados });

    cache[escopo] = lista.slice(0, CACHE_POR_ESCOPO);
    await chrome.storage.session.set({ [CACHE_CHAVE]: cache });
  } catch {
    // sem espaco: segue sem cache, a proxima busca so vai demorar o normal
  }
}
