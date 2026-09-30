// Aba Databricks: as solicitações do cliente, por CPF/CNPJ.
//
// Um cartão por solicitação, cada um com o próprio botão de copiar — o uso
// normal é achar uma solicitação no meio da lista e mandar só ela para o
// atendimento.

const CAMPOS_DATABRICKS = [
  { chave: "TITULAR", rotulo: "Titular" },
  { chave: "PRODUTO", rotulo: "Produto" },
  { chave: "AR_EMISSOR", rotulo: "AR emissora" },
  { chave: "DATA_SOLICITACAO", rotulo: "Data da solicitação" },
  { chave: "DATA_EMISSAO", rotulo: "Data de emissão" },
  { chave: "DATA_VENCIMENTO", rotulo: "Vencimento" }
];

function situacaoSolicitacaoEhAlerta(texto) {
  return /revogad|cancelad|expirad/i.test(texto || "");
}

function textoSolicitacaoDatabricks(item) {
  const linhas = [
    `Cód: ${item.COD_SOLICITACAO || "—"}`,
    `Situação: ${item.SITUACAO_DA_SOLICITACAO || "—"}`
  ];

  CAMPOS_DATABRICKS.forEach(({ chave, rotulo }) => {
    if (item[chave]) linhas.push(`${rotulo}: ${item[chave]}`);
  });

  return linhas.join("\n");
}

function criarCartaoSolicitacao(item) {
  const cartao = document.createElement("div");
  cartao.className = "cartao-resultado";

  const cabecalho = document.createElement("div");
  cabecalho.className = "resultado-cabecalho";

  const situacao = document.createElement("span");
  situacao.className = "resultado-titulo";
  situacao.classList.toggle(
    "alerta",
    situacaoSolicitacaoEhAlerta(item.SITUACAO_DA_SOLICITACAO)
  );
  situacao.textContent =
    `${item.COD_SOLICITACAO || "—"} — ${item.SITUACAO_DA_SOLICITACAO || "—"}`;

  const copiar = document.createElement("button");
  copiar.type = "button";
  copiar.className = "link-btn";
  copiar.textContent = "Copiar";
  copiar.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textoSolicitacaoDatabricks(item));
    } catch {
      return;
    }

    copiar.textContent = "Copiado";
    setTimeout(() => { copiar.textContent = "Copiar"; }, 1500);
  });

  cabecalho.appendChild(situacao);
  cabecalho.appendChild(copiar);
  cartao.appendChild(cabecalho);

  const linhas = document.createElement("div");
  linhas.className = "linhas-cv";
  preencherLinhasChaveValor(
    linhas,
    CAMPOS_DATABRICKS.map(({ chave, rotulo }) => ({ rotulo, valor: item[chave] }))
  );

  cartao.appendChild(linhas);
  return cartao;
}

function renderizarResultadoDatabricks(lista) {
  const container = $("resultadoDatabricks");
  container.innerHTML = "";

  if (!lista?.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Nenhuma solicitação encontrada para este documento.";
    container.appendChild(vazio);
  } else {
    lista.forEach((item) => container.appendChild(criarCartaoSolicitacao(item)));
  }

  container.classList.remove("hidden");
}

async function buscarDatabricks() {
  const campo = $("documentoDatabricks");
  const botao = $("buscarDatabricksBtn");
  const aviso = $("avisoDatabricks");

  // o painel busca por digito; a pontuacao que o atendente colou atrapalha
  const documento = campo.value.replace(/\D/g, "");

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ.", "erro");
    campo.focus();
    return;
  }

  $("resultadoDatabricks").classList.add("hidden");

  const emCache = await obterCache("databricks", documento);
  if (emCache) {
    renderizarResultadoDatabricks(emCache.lista);
    mostrarAviso(aviso, "Resultado da última busca (sem consultar de novo).", "ok");
    salvarNoHistorico("databricks", documento);
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Conectando ao Databricks...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "buscarDatabricks",
      cpfCnpj: documento
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      marcarErroNaAba("databricks");
      return;
    }

    renderizarResultadoDatabricks(resposta.dados);
    mostrarAviso(aviso, "Busca concluída.", "ok");

    salvarCache("databricks", documento, { lista: resposta.dados });
    limparErroNaAba("databricks");
    salvarNoHistorico("databricks", documento);
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("databricks");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

$("buscarDatabricksBtn").addEventListener("click", buscarDatabricks);

$("documentoDatabricks").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarDatabricks();
});

registrarHistorico("databricks", {
  containerId: "historicoDatabricks",
  campoId: "documentoDatabricks",
  aoSelecionar: buscarDatabricks
});
