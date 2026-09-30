// endereco da tela de atalhos, conforme o navegador
function urlAtalhos() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge://extensions/shortcuts";
  if (/OPR\//.test(ua)) return "opera://settings/keyboardShortcuts";
  return "chrome://extensions/shortcuts";
}

async function carregarAtalho() {
  const valor = $("atalhoValor");

  try {
    const comandos = await chrome.commands.getAll();
    const ocr = comandos.find((c) => c.name === "extrair-texto");

    if (ocr && ocr.shortcut) {
      valor.textContent = ocr.shortcut;
      valor.classList.remove("vazio");
    } else {
      valor.textContent = "Nenhum atalho definido";
      valor.classList.add("vazio");
    }
  } catch {
    valor.textContent = "Não foi possível ler o atalho";
    valor.classList.add("vazio");
  }
}

$("capturarAgoraBtn").addEventListener("click", async () => {
  const aviso = $("avisoOcr");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "iniciarOcr" });

    if (resposta?.erro) {
      mostrarAviso(aviso, resposta.erro, "erro");
      return;
    }
  } catch {
    mostrarAviso(aviso, "Não foi possível iniciar a captura.", "erro");
    return;
  }

  // o popup precisa sair da frente: a selecao acontece na pagina, e o
  // primeiro clique nela seria gasto so para fechar este popup
  window.close();
});

$("trocarAtalhoBtn").addEventListener("click", async () => {
  const endereco = urlAtalhos();
  const aviso = $("avisoOcr");

  try {
    await navigator.clipboard.writeText(endereco);
    mostrarAviso(
      aviso,
      `Endereço copiado: ${endereco} — cole na barra de endereços.`,
      "ok"
    );
  } catch {
    mostrarAviso(aviso, `Acesse ${endereco} na barra de endereços.`, "");
  }
});

