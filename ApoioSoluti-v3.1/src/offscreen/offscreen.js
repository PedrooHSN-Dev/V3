// Upscale do recorte do print. O print ja chega degradado (compressao do
// PNG + zoom do CSS), entao ampliar antes de binarizar ajuda o Tesseract.
const ESCALA = 3;

let workerPromise = null;

function obterWorker() {
  if (workerPromise) return workerPromise;

  workerPromise = Tesseract.createWorker("por", 1, {
    workerPath: chrome.runtime.getURL("lib/worker.min.js"),
    corePath: chrome.runtime.getURL("lib/"),
    langPath: chrome.runtime.getURL("lib/"),
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: false
  });

  return workerPromise;
}

async function recortar(dataUrl, rect, dpr) {
  const resposta = await fetch(dataUrl);
  const blob = await resposta.blob();
  const imagem = await createImageBitmap(blob);

  const x = Math.max(0, Math.round(rect.x * dpr));
  const y = Math.max(0, Math.round(rect.y * dpr));
  const largura = Math.min(Math.round(rect.width * dpr), imagem.width - x);
  const altura = Math.min(Math.round(rect.height * dpr), imagem.height - y);

  if (largura < 4 || altura < 4) {
    throw new Error("Área selecionada muito pequena.");
  }

  const canvas = new OffscreenCanvas(largura * ESCALA, altura * ESCALA);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    imagem,
    x,
    y,
    largura,
    altura,
    0,
    0,
    canvas.width,
    canvas.height
  );

  binarizar(ctx, canvas.width, canvas.height);

  return {
    blob: await canvas.convertToBlob({ type: "image/png" }),
    largura: canvas.width,
    altura: canvas.height
  };
}

// Tons de cinza + limiar de Otsu. Texto claro em fundo escuro tambem funciona,
// porque o Tesseract lida melhor com preto no branco: invertemos se preciso.
function binarizar(ctx, largura, altura) {
  const dados = ctx.getImageData(0, 0, largura, altura);
  const pixels = dados.data;
  const cinza = new Uint8Array(largura * altura);
  const histograma = new Array(256).fill(0);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    const v = Math.round(
      0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    );
    cinza[p] = v;
    histograma[v]++;
  }

  const total = cinza.length;
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * histograma[i];

  let somaFundo = 0;
  let pesoFundo = 0;
  let melhorVariancia = -1;
  let limiar = 128;

  for (let i = 0; i < 256; i++) {
    pesoFundo += histograma[i];
    if (!pesoFundo) continue;

    const pesoFrente = total - pesoFundo;
    if (!pesoFrente) break;

    somaFundo += i * histograma[i];

    const mediaFundo = somaFundo / pesoFundo;
    const mediaFrente = (soma - somaFundo) / pesoFrente;
    const variancia =
      pesoFundo * pesoFrente * (mediaFundo - mediaFrente) ** 2;

    if (variancia > melhorVariancia) {
      melhorVariancia = variancia;
      limiar = i;
    }
  }

  let escuros = 0;
  for (let p = 0; p < total; p++) if (cinza[p] <= limiar) escuros++;

  // se a maior parte for escura, o texto provavelmente e claro: inverte
  const inverter = escuros > total / 2;

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    let claro = cinza[p] > limiar;
    if (inverter) claro = !claro;

    const v = claro ? 255 : 0;
    pixels[i] = v;
    pixels[i + 1] = v;
    pixels[i + 2] = v;
    pixels[i + 3] = 255;
  }

  ctx.putImageData(dados, 0, 0);
}

// Uma area larga e baixa e quase sempre uma linha so (o caso de copiar um
// codigo). O modo 7 le a imagem como uma linha unica e acerta bem mais que
// o 6, que fica procurando um bloco de varias linhas.
function modoDeSegmentacao(largura, altura) {
  return largura / altura >= 8 ? "7" : "6";
}

async function reconhecer(fonte, largura, altura) {
  const worker = await obterWorker();

  await worker.setParameters({
    tessedit_pageseg_mode: modoDeSegmentacao(largura, altura),
    preserve_interword_spaces: "1"
  });

  const { data } = await worker.recognize(fonte);

  return (data.text || "").replace(/[ \t]+\n/g, "\n").trim();
}

async function executarOcr(dataUrl, rect, dpr) {
  const { blob, largura, altura } = await recortar(dataUrl, rect, dpr);
  return reconhecer(blob, largura, altura);
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.destino !== "offscreen") return;

  if (mensagem.tipo === "ocr") {
    executarOcr(mensagem.dataUrl, mensagem.rect, mensagem.dpr)
      .then((texto) => responder({ texto }))
      .catch((erro) => responder({ erro: erro.message || String(erro) }));

    return true;
  }

});


// carrega o worker assim que o documento offscreen existe, sem esperar
// a primeira captura: o carregamento do wasm/traineddata acontece em
// paralelo enquanto o usuario ainda esta selecionando a area na tela
obterWorker().catch(() => {});
