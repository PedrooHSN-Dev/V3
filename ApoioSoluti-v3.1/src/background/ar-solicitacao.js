const API_BUSCA_URLS = "https://arsoluti.acsoluti.com.br/pool/busca-urls";

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== "abrir-solicitacao") return;

  const [aba] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!aba || !podeUsar(aba.url)) return;

  let selecao = "";
  try {
    selecao = await selecaoDaAba(aba.id);
  } catch (erro) {
    console.warn("Apoio Soluti: não consegui ler a seleção:", erro.message);
  }

  const codigo = limparCodigo(selecao);

  if (!codigo) {
    avisarNaAba(aba, "Selecione o código da solicitação e use o atalho de novo.");
    return;
  }

  const resposta = await abrirSolicitacao(codigo);
  if (resposta?.erro) avisarNaAba(aba, resposta.erro);
});

async function consultarUrls(codigo) {
  const resposta = await fetch(
    `${API_BUSCA_URLS}?solicitacao=${encodeURIComponent(codigo)}`
  );

  if (!resposta.ok) {
    throw new Error(`A API respondeu ${resposta.status}.`);
  }

  return resposta.json();
}

async function abrirSolicitacao(codigo) {
  if (!codigo) {
    return { erro: "Nenhum código informado." };
  }

  try {
    // Mesma logica do v2: busca o ar_subdomain e abre o gridlocalizar.
    // O content script gridlocalizar.js (que roda em *.acsoluti.com.br)
    // le o idCDsolicitacao na aba logada e redireciona para o andamento.
    const json = await consultarUrls(codigo);
    const subdomain = json?.data?.ar_subdomain;

    if (!subdomain) {
      return { erro: "Subdomínio não encontrado para esse código." };
    }

    const filtros = encodeURIComponent(
      JSON.stringify({ codigo, idCDsolicitacao: "" })
    );

    const gridURL =
      `https://${subdomain}.acsoluti.com.br/certdig/gridlocalizar` +
      `?filtros=${filtros}`;

    await chrome.tabs.create({ url: gridURL, active: true });

    return { ok: true, quantidade: 1 };
  } catch (erro) {
    console.error("Apoio Soluti: erro ao abrir solicitação:", erro);
    return { erro: "Não foi possível abrir a solicitação. Verifique o código." };
  }
}

async function abrirAR(codigo) {
  if (!codigo) {
    return { erro: "Nenhum código informado." };
  }

  try {
    const json = await consultarUrls(codigo);

    if (json.status !== "success" || !json.data?.urls?.length) {
      return { erro: "Nenhum site de AR encontrado para esse código." };
    }

    const urls = [...new Set(json.data.urls)];

    // primeira aba ativa, o resto em segundo plano
    urls.forEach((url, indice) => {
      chrome.tabs.create({ url, active: indice === 0 });
    });

    return { ok: true, quantidade: urls.length };
  } catch (erro) {
    console.error("Apoio Soluti: erro ao abrir site da AR:", erro);
    return { erro: "Não foi possível abrir o site da AR. Verifique o código." };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "abrirSolicitacao") {
    abrirSolicitacao(limparCodigo(mensagem.codigo))
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }

  if (mensagem?.tipo === "abrirAR") {
    abrirAR(limparCodigo(mensagem.codigo))
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

