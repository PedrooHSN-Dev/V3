const PAGINAS_BLOQUEADAS = /^(chrome|edge|about|devtools|view-source|chrome-extension|edge-extension|moz-extension):|^https:\/\/(chromewebstore\.google\.com|microsoftedge\.microsoft\.com)/i;

function podeUsar(url) {
  return Boolean(url) && !PAGINAS_BLOQUEADAS.test(url);
}

// mesma lista, na mesma ordem, do content_scripts do manifest.json:
// esta reinjecao existe para abas abertas antes do ultimo recarregamento
// da extensao, e precisa reproduzir a carga original
const ARQUIVOS_CONTENT = [
  "src/dados/macros-equipe.js",
  "src/comum/macros.js",
  "src/content/content.js",
  "src/content/visualizador.js"
];

// Sempre no frame principal: a camada de selecao e o visualizador precisam
// cobrir a janela inteira, e uma imagem dentro de um iframe pequeno deixaria
// os dois presos ao tamanho do iframe.
async function enviarParaAba(abaId, mensagem) {
  try {
    await chrome.tabs.sendMessage(abaId, mensagem, { frameId: 0 });
  } catch {
    // aba aberta antes da extensao ser (re)carregada: o content script antigo
    // fica orfao (perdeu a ligacao com a extensao) mas continua vivo na mesma
    // isolated world, entao os guards "window.__apoioSoluti*" continuam true.
    // Sem zera-los primeiro, a reinjecao abaixo pula a propria inicializacao
    // e o atalho fica sem ouvinte pra sempre.
    await chrome.scripting.executeScript({
      target: { tabId: abaId, frameIds: [0] },
      func: () => {
        window.__apoioSolutiCarregado = false;
        window.__apoioSolutiVisualizador = false;
      }
    });
    await chrome.scripting.executeScript({
      target: { tabId: abaId, frameIds: [0] },
      files: ARQUIVOS_CONTENT
    });
    await chrome.tabs.sendMessage(abaId, mensagem, { frameId: 0 });
  }
}

// Mostra o aviso do content script (o mesmo da leitura de texto) para algo
// que comecou fora da pagina. Falha em silencio de proposito: nem toda aba
// aceita content script, e o aviso e o acessorio, nao a acao.
async function avisarNaAba(aba, texto, estilo = "erro") {
  if (!aba?.id || !podeUsar(aba.url)) return;

  try {
    await enviarParaAba(aba.id, { tipo: "aviso", texto, estilo });
  } catch (erro) {
    console.warn("Apoio Soluti: sem aviso na página:", erro.message);
  }
}

// O evento do atalho nao traz o texto selecionado (so o menu de contexto
// traz), entao a selecao e lida direto da pagina. allFrames porque ela pode
// estar dentro de um iframe, e nesse caso o frame principal devolve vazio.
async function selecaoDaAba(abaId) {
  const resultados = await chrome.scripting.executeScript({
    target: { tabId: abaId, allFrames: true },
    func: () => (window.getSelection?.() || "").toString()
  });

  for (const { result } of resultados) {
    const texto = (result || "").trim();
    if (texto) return texto;
  }

  return "";
}

function limparCodigo(texto) {
  return (texto || "").trim().replace(/\s+/g, "");
}

// CPF/CNPJ vem da tela do jeito que o atendente colou (com ponto, barra,
// traco) e todas as APIs que o recebem querem so os digitos.
function limparDocumento(texto) {
  return (texto || "").replace(/\D+/g, "");
}
