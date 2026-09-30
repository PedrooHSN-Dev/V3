/* Solicitacao ------------------------------------------------------
   Um campo, dois destinos. Eram duas abas com o mesmo placeholder, e o
   servico por tras e o mesmo que o menu de contexto usa: em vez de
   refazer o fetch e o window.open aqui, os botoes mandam a mensagem para
   o background (uma implementacao so, e as abas abrem por
   chrome.tabs.create, mais confiavel que window.open a partir de um
   popup que esta prestes a fechar).
   ------------------------------------------------------------------ */

async function pedirAberturaAoBackground(tipo, idBotao, textos) {
  const campo = $("codigoSolicitacao");
  const botao = $(idBotao);
  const aviso = $("avisoSolicitacao");

  const codigo = campo.value.trim();

  if (!codigo) {
    mostrarAviso(aviso, "Digite o código da solicitação.", "erro");
    campo.focus();
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Abrindo...";
  mostrarAviso(aviso, textos.buscando, "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo, codigo });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      return;
    }

    mostrarAviso(aviso, textos.pronto(resposta.quantidade || 1), "ok");
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function abrirSiteDaAr() {
  return pedirAberturaAoBackground("abrirAR", "abrirArBtn", {
    buscando: "Buscando...",
    pronto: (n) =>
      n > 1 ? `Aberto em ${n} novas abas.` : "Aberto em nova aba."
  });
}

function abrirSolicitacaoNaAr() {
  return pedirAberturaAoBackground("abrirSolicitacao", "abrirSolicitacaoBtn", {
    buscando: "Abrindo solicitação...",
    pronto: () => "Aguarde o carregamento..."
  });
}

$("abrirArBtn").addEventListener("click", abrirSiteDaAr);
$("abrirSolicitacaoBtn").addEventListener("click", abrirSolicitacaoNaAr);

// o atalho pode ter sido trocado ou apagado pelo usuario na tela do
// navegador: a dica mostra o que esta valendo agora, nao o sugerido
async function carregarAtalhoSolicitacao() {
  const alvo = $("atalhoSolicitacao");

  try {
    const comandos = await chrome.commands.getAll();
    const atalho = comandos.find((c) => c.name === "abrir-solicitacao");

    if (atalho?.shortcut) {
      alvo.textContent = atalho.shortcut;
      alvo.className = "atalho-inline";
      return;
    }
  } catch {}

  alvo.textContent = "o atalho (não definido)";
}

// Enter vai para o primeiro botao
$("codigoSolicitacao").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") $("abrirArBtn").click();
});
