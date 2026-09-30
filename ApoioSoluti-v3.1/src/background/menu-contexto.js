// Os dois grupos do menu de contexto. Nao da para ter duas entradas "Apoio
// Soluti" lado a lado: quando uma extensao cria mais de um item, o navegador
// junta todos num submenu unico e o rotulo dele vem do "name" do manifest.
// A separacao por assunto acontece entao um nivel abaixo.
const MENU_GRUPO_AR = "apoio-soluti-grupo-ar";
const MENU_GRUPO_BUSCAR = "apoio-soluti-buscar";

const MENU_SOLICITACAO = "apoio-soluti-abrir-solicitacao";
const MENU_AR = "apoio-soluti-abrir-ar";
const MENU_AMPLIAR = "apoio-soluti-ampliar-imagem";

// cada destino abre o popup ja na aba certa, com o texto selecionado no campo
const DESTINOS_BUSCA = {
  "apoio-soluti-buscar-loja": {
    titulo: "Loja Soluti",
    aba: "lojas",
    escopo: ""
  },
  "apoio-soluti-buscar-nacional": {
    titulo: "Parceiro nacional",
    aba: "parceiros",
    escopo: "nacional"
  },
  "apoio-soluti-buscar-intl": {
    titulo: "Parceiro internacional",
    aba: "parceiros",
    escopo: "internacional"
  }
};

// cria um item de menu tentando usar icone de imagem (contextMenus.icons so
// existe a partir do Chrome 133; em navegadores mais antigos create() lanca
// TypeError sincrono e cai pro fallback). Emoji so nos itens de primeiro
// nivel, que precisam se distinguir no meio do menu do proprio navegador:
// dentro do submenu o rotulo do pai ja da o contexto
function criarItemMenu(propriedades, icones) {
  if (!icones) {
    chrome.contextMenus.create(propriedades);
    return;
  }

  try {
    chrome.contextMenus.create({ ...propriedades, icons: icones });
  } catch {
    chrome.contextMenus.create(propriedades);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  // remove itens de execucoes anteriores: o service worker pode reiniciar
  // sem disparar onInstalled de novo, e um create() com id repetido falha
  chrome.contextMenus.removeAll(() => {
    /* Grupo 1: o codigo selecionado vira uma AR ou uma solicitacao */

    criarItemMenu({
      id: MENU_GRUPO_AR,
      title: "🔍 AR e código",
      contexts: ["selection"]
    });

    criarItemMenu(
      {
        id: MENU_SOLICITACAO,
        parentId: MENU_GRUPO_AR,
        title: "Abrir solicitação na AR",
        contexts: ["selection"]
      },
      {
        "16": "icons/icon-menu-solicitacao-16.png",
        "32": "icons/icon-menu-solicitacao-32.png"
      }
    );

    criarItemMenu(
      {
        id: MENU_AR,
        parentId: MENU_GRUPO_AR,
        title: "Abrir site da AR",
        contexts: ["selection"]
      },
      {
        "16": "icons/icon-menu-ar-16.png",
        "32": "icons/icon-menu-ar-32.png"
      }
    );

    /* Grupo 2: o texto selecionado vira uma busca de onde atender */

    criarItemMenu({
      id: MENU_GRUPO_BUSCAR,
      title: "📍 Localizar parceiro",
      contexts: ["selection"]
    });

    Object.entries(DESTINOS_BUSCA).forEach(([id, destino]) => {
      criarItemMenu({
        id,
        parentId: MENU_GRUPO_BUSCAR,
        title: destino.titulo,
        contexts: ["selection"]
      });
    });

    /* Fora dos grupos: aparece sobre imagem, nao sobre texto selecionado */

    // ampliar deixa a imagem legivel (giro, espelho, contraste) para a
    // leitura por selecao que vem depois, com o Ctrl+M
    criarItemMenu({
      id: MENU_AMPLIAR,
      title: "Ampliar imagem",
      contexts: ["image"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, aba) => {
  if (info.menuItemId === MENU_AMPLIAR) {
    ampliarImagem(info.srcUrl, aba);
    return;
  }

  const destino = DESTINOS_BUSCA[info.menuItemId];
  if (destino) {
    abrirBusca(destino, info.selectionText);
    return;
  }

  const codigo = limparCodigo(info.selectionText);

  // "codigo nao encontrado" so aparecia no popup: pelo menu, a acao falhava
  // sem dizer nada. O mesmo aviso do atalho resolve os dois caminhos.
  const relatarErro = (resposta) => {
    if (resposta?.erro) avisarNaAba(aba, resposta.erro);
  };

  if (info.menuItemId === MENU_SOLICITACAO) {
    abrirSolicitacao(codigo).then(relatarErro);
  } else if (info.menuItemId === MENU_AR) {
    abrirAR(codigo).then(relatarErro);
  }
});

// Leva o texto selecionado para a busca de lojas/parceiros. O pedido vai pelo
// storage de sessao porque o chrome.action.openPopup() nao aceita parametros;
// se ele nao existir (ou nao houver janela em foco), o mesmo popup abre como
// janelinha e ai os parametros vao na propria URL.
async function abrirBusca(destino, selecao) {
  const termo = (selecao || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!termo) return;

  const pedido = {
    aba: destino.aba,
    escopo: destino.escopo,
    termo,
    quando: Date.now()
  };

  try {
    await chrome.storage.session.set({ buscaPendente: pedido });

    await chrome.action.openPopup();
    return;
  } catch {
    // openPopup() so existe a partir do Chrome 127 e falha quando nenhuma
    // janela do navegador esta em foco
  }

  const parametros = new URLSearchParams({
    aba: pedido.aba,
    q: termo,
    destacada: "1"
  });
  if (pedido.escopo) parametros.set("escopo", pedido.escopo);

  await chrome.windows.create({
    url: chrome.runtime.getURL(`src/popup/popup.html?${parametros}`),
    type: "popup",
    width: 660,
    height: 700
  });
}

async function ampliarImagem(src, aba) {
  if (!src || !aba?.id) return;

  // o OCR costuma vir logo depois da ampliacao: aquece o worker agora
  garantirOffscreen().catch(() => {});

  try {
    await enviarParaAba(aba.id, { tipo: "abrirVisualizador", src });
  } catch (erro) {
    console.error("Apoio Soluti: não foi possível ampliar a imagem:", erro);
  }
}
