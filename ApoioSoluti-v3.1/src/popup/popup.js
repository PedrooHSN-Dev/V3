/* Tema ------------------------------------------------------------
   Sem escolha salva, o popup segue o navegador. O botao grava uma
   escolha explicita, que passa a ganhar do sistema.

   Por que localStorage e nao chrome.storage: a leitura precisa acontecer
   ANTES da primeira pintura, senao o popup pisca no tema errado a cada
   abertura. chrome.storage e assincrono; localStorage e sincrono, e quem
   aplica e o src/popup/tema.js, carregado no <head>.
   ------------------------------------------------------------------ */

function temaEfetivo() {
  const escolhido = document.documentElement.dataset.tema;
  if (escolhido) return escolhido;

  return matchMedia("(prefers-color-scheme: dark)").matches
    ? "escuro"
    : "claro";
}

$("temaBtn").addEventListener("click", () => {
  const novo = temaEfetivo() === "escuro" ? "claro" : "escuro";

  document.documentElement.dataset.tema = novo;

  try {
    localStorage.setItem("tema", novo);
  } catch {
    // modo privado ou armazenamento bloqueado: a escolha vale so nesta janela
  }
});

/* Abas ------------------------------------------------------------- */

const abas = document.querySelectorAll(".aba");
const paineis = {
  dia: $("painel-dia"),
  macros: $("painel-macros"),
  solicitacao: $("painel-solicitacao"),
  databricks: $("painel-databricks"),
  sdeal: $("painel-sdeal"),
  gestao: $("painel-gestao"),
  wings: $("painel-wings"),
  ocr: $("painel-ocr"),
  atender: $("painel-atender"),
  emails: $("painel-emails")
};

function trocarAba(nome) {
  abas.forEach((aba) => {
    const ativa = aba.dataset.aba === nome;
    aba.classList.toggle("ativa", ativa);
    aba.setAttribute("aria-selected", ativa ? "true" : "false");
  });

  // entrou na aba, viu o problema: o pontinho de erro no icone some
  limparErroNaAba(nome);

  Object.entries(paineis).forEach(([chave, painel]) => {
    painel.classList.toggle("hidden", chave !== nome);
  });

  const foco = {
    macros: "busca",
    solicitacao: "codigoSolicitacao",
    databricks: "documentoDatabricks",
    sdeal: "codigoVoucherSDeal",
    gestao: "documentoGestao",
    wings: "documentoWings",
    // em "atender" o campo depende do escopo aberto
    atender: escopoAtual === "lojas" ? "buscaLoja" : "buscaParceiro",
    emails: "destinatarioEmail"
  }[nome];

  const campo = foco && $(foco);
  if (campo) campo.focus();

  if (nome === "dia") montarPainelDoDia();
  if (nome === "ocr") carregarAtalho();
  if (nome === "solicitacao") carregarAtalhoSolicitacao();
  if (nome === "atender") prepararEscopoAtual();
}

abas.forEach((aba) => {
  aba.addEventListener("click", () => trocarAba(aba.dataset.aba));
});

/* Ordem das abas ----------------------------------------------------
   Arrastar a aba muda o lugar dela. Quem usa o dia inteiro quer as suas
   três primeiras à mão, e a ordem que serve para um não serve para outro.

   Vai para o sync, como os macros: é escolha da pessoa, e faz sentido
   ela encontrar a mesma barra no outro PC. O local guarda sempre, e é
   dele que se lê quando o sync não responde.
   ------------------------------------------------------------------ */

const ORDEM_ABAS_CHAVE = "ordemAbas";
const barraDeAbas = document.querySelector(".abas");

// as abas viram arrastáveis e ganham a marca que o tornarReordenavel lê
abas.forEach((aba) => {
  aba.draggable = true;
  aba.dataset.ordem = aba.dataset.aba;
});

async function salvarOrdemDasAbas(ordem) {
  try {
    await chrome.storage.local.set({ [ORDEM_ABAS_CHAVE]: ordem });
  } catch {
    return;
  }

  try {
    await chrome.storage.sync.set({ [ORDEM_ABAS_CHAVE]: ordem });
  } catch {
    // sync cheio ou desligado: a ordem vale nesta máquina, e só
  }
}

async function aplicarOrdemSalvaDasAbas() {
  let ordem = null;

  for (const area of ["sync", "local"]) {
    try {
      const guardado = await chrome.storage[area].get(ORDEM_ABAS_CHAVE);
      if (Array.isArray(guardado[ORDEM_ABAS_CHAVE])) {
        ordem = guardado[ORDEM_ABAS_CHAVE];
        break;
      }
    } catch {}
  }

  if (!ordem) return;

  // aba nova numa versão nova não está na ordem salva: fica onde já está,
  // em vez de sumir da barra
  ordem.forEach((nome) => {
    const aba = Array.from(abas).find((item) => item.dataset.aba === nome);
    if (aba) barraDeAbas.appendChild(aba);
  });
}

tornarReordenavel(barraDeAbas, {
  eixo: "x",
  aoReordenar: salvarOrdemDasAbas
});

// version_name existe para isso: o manifest so aceita numeros em
// "version", entao o "beta" mora no nome. Sem nome, cai no numero.
const manifesto = chrome.runtime.getManifest();
$("versao").textContent = `v${manifesto.version_name || manifesto.version}`;

/* Destacar em janela ------------------------------------------------
   O popup fecha a cada clique fora, e nao ha como impedir: e o navegador
   que decide. A saida e nao ser um popup — a mesma pagina aberta como
   janela normal fica ate ser fechada.

   Nao e a mesma instancia: e uma segunda janela, com o estado restaurado
   de src/popup/sessao.js. Por isso o popup se fecha em seguida, para nao
   sobrarem duas telas dizendo coisas diferentes.
   ------------------------------------------------------------------ */

// quando a pagina JA e a janela destacada, o botao nao faz sentido
const ehJanelaDestacada = location.search.includes("destacada=1");

if (ehJanelaDestacada) {
  $("destacarBtn").classList.add("hidden");
} else {
  $("destacarBtn").addEventListener("click", async () => {
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL("src/popup/popup.html?destacada=1"),
        type: "popup",
        width: 660,
        height: 700
      });

      // o popup morre junto com esta chamada de qualquer forma; fechar
      // explicitamente evita o piscar de duas telas iguais
      window.close();
    } catch (erro) {
      console.error("Apoio Soluti: não consegui destacar a janela:", erro);
    }
  });
}

/* Busca vinda do menu de contexto ----------------------------------
   O background guarda o pedido no storage de sessao antes de abrir o
   popup (openPopup nao aceita parametros). Quando ele nao consegue abrir
   o popup, a mesma pagina vira uma janelinha e o pedido chega pela URL.
   ------------------------------------------------------------------ */

async function lerBuscaPendente() {
  // o pedido guardado e sempre descartado: se ficar para tras, reaparece
  // na proxima vez que o popup for aberto na mao
  let guardado = null;

  try {
    const dados = await chrome.storage.session.get("buscaPendente");
    guardado = dados.buscaPendente || null;
    await chrome.storage.session.remove("buscaPendente");
  } catch {}

  const parametros = new URLSearchParams(location.search);

  if (parametros.get("aba")) {
    return {
      aba: parametros.get("aba"),
      escopo: parametros.get("escopo") || "",
      termo: parametros.get("q") || ""
    };
  }

  // pedido velho: o popup foi aberto por conta propria bem depois
  if (guardado && Date.now() - guardado.quando < 60000) return guardado;

  return null;
}

async function aplicarBuscaPendente() {
  const pedido = await lerBuscaPendente();
  if (!pedido?.termo) return;

  // lojas e parceiros agora moram na mesma aba: o pedido escolhe o escopo.
  // O escopo vem antes da aba para nao carregar a lista errada no caminho.
  if (pedido.aba === "lojas") {
    // preenche antes: prepararLojas() renderiza lendo o campo
    $("buscaLoja").value = pedido.termo;
    trocarEscopo("lojas");
    trocarAba("atender");
    $("buscaLoja").select();
    return;
  }

  if (pedido.aba !== "parceiros") return;

  trocarEscopo(
    pedido.escopo === "internacional" ? "internacional" : "nacional"
  );
  trocarAba("atender");

  // o termo so pode ser aplicado depois que a lista existir
  try {
    await prepararParceiros();
  } catch {
    return;
  }

  // depois do trocarEscopo, que limpa o campo
  $("buscaParceiro").value = pedido.termo;
  $("buscaParceiro").select();
  renderizarParceiros();
}

/* Partida ----------------------------------------------------------
   Roda depois que todos os aba-*.js foram carregados: cada uma destas
   funcoes mora num arquivo diferente.
   ------------------------------------------------------------------ */

aplicarOrdemSalvaDasAbas();

carregarMacros();
carregarModelosEmail();
carregarAtalhoDoDia();
carregarPreferenciaCopiarAoAbrir();

// os pontos de sessao e o ultimo pedido aberto nao dependem um do outro
// nem do estado da tela: pedem logo e chegam quando chegarem
atualizarIndicadoresDeSessao();
restaurarUltimoResultadoGestao();

// A restauracao vem ANTES do pedido do menu de contexto, e nesta ordem: um
// pedido novo ("buscar esta loja") tem de vencer o estado velho, nao o
// contrario. Por isso o encadeamento, e nao duas chamadas soltas.
restaurarEstado().then(aplicarBuscaPendente);
