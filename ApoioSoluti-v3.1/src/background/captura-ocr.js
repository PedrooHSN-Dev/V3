async function iniciarSelecao(aba) {
  await enviarParaAba(aba.id, { tipo: "iniciarSelecao" });
}

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== "extrair-texto") return;

  const [aba] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!aba || !podeUsar(aba.url)) {
    console.warn("Apoio Soluti: esta página não permite captura.");
    return;
  }

  // dispara em paralelo: o worker de OCR carrega enquanto o usuario
  // ainda esta arrastando a selecao na tela, entao chega pronto
  garantirOffscreen().catch((erro) =>
    console.warn("Apoio Soluti: falha ao aquecer o OCR:", erro.message)
  );

  try {
    await iniciarSelecao(aba);
  } catch (erro) {
    console.error("Apoio Soluti: não foi possível iniciar a seleção:", erro);
  }
});

let offscreenPromise = null;

function garantirOffscreen() {
  if (offscreenPromise) return offscreenPromise;

  offscreenPromise = chrome.offscreen.hasDocument().then((existe) => {
    if (existe) return;

    return chrome.offscreen.createDocument({
      url: "src/offscreen/offscreen.html",
      reasons: ["WORKERS"],
      justification: "Executa o OCR local sobre o recorte da tela."
    });
  });

  return offscreenPromise;
}

// aquece o OCR assim que o navegador/extensao inicia, para a primeira
// captura da sessao nao esperar o carregamento do wasm/traineddata
chrome.runtime.onInstalled.addListener(() => {
  garantirOffscreen().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  garantirOffscreen().catch(() => {});
});

async function reconhecer(captura) {
  await garantirOffscreen();

  const resposta = await chrome.runtime.sendMessage({
    tipo: "ocr",
    destino: "offscreen",
    dataUrl: captura.dataUrl,
    rect: captura.rect,
    dpr: captura.dpr
  });

  if (!resposta) throw new Error("Sem resposta do leitor de texto.");
  if (resposta.erro) throw new Error(resposta.erro);

  return { texto: resposta.texto };
}

async function capturar(mensagem, remetente) {
  const abaId = remetente?.tab?.id;
  const janelaId = remetente?.tab?.windowId;

  const dataUrl = await chrome.tabs.captureVisibleTab(janelaId, {
    format: "png"
  });

  // print tirado: a aba ja pode voltar a desenhar a propria interface
  // (o aviso "Lendo o texto...") sem sujar a imagem
  if (abaId !== undefined) {
    chrome.tabs
      .sendMessage(abaId, { tipo: "capturaPronta" }, { frameId: 0 })
      .catch(() => {});
  }

  return reconhecer({ dataUrl, rect: mensagem.rect, dpr: mensagem.dpr });
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.destino === "offscreen") return;

  if (mensagem?.tipo === "capturar") {
    capturar(mensagem, remetente)
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }

  if (mensagem?.tipo === "iniciarOcr") {
    iniciarOcrNaAbaAtiva()
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

async function iniciarOcrNaAbaAtiva() {
  const [aba] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!aba || !podeUsar(aba.url)) {
    return { erro: "Esta página não permite captura de tela." };
  }

  garantirOffscreen().catch((erro) =>
    console.warn("Apoio Soluti: falha ao aquecer o OCR:", erro.message)
  );

  await iniciarSelecao(aba);
  return { ok: true };
}

