// Aba S.Deal: um número de voucher, os dados dele.
//
// A tela só manda o número e mostra o que voltar; a sequência de
// requisições e a sessão logada ficam em src/background/sdeal.js.

// ordem e rotulos de exibicao. "situacaoVoucher" fica de fora: ela vai
// sozinha no cabecalho do cartao, porque e o que se olha primeiro.
const CAMPOS_SDEAL = [
  { chave: "nomeCLiente", rotulo: "Cliente" },
  { chave: "perfilVoucher", rotulo: "Perfil" },
  { chave: "habilitado", rotulo: "Habilitado" },
  { chave: "produto", rotulo: "Produto" },
  { chave: "negociacao", rotulo: "Negociação" },
  { chave: "empenho", rotulo: "Empenho" },
  { chave: "alocado", rotulo: "Alocado para" },
  { chave: "emitidoPara", rotulo: "Emitido para" },
  { chave: "sugestaoUso", rotulo: "Sugestão de uso" },
  { chave: "dataEmissao", rotulo: "Data de emissão" },
  { chave: "dataVencimento", rotulo: "Data de vencimento" },
  { chave: "global", rotulo: "Abrangência" }
];

// o background devolve data como { __data, ano, mes, dia } — ela chegou
// como "new Date(...)" na resposta do S.Deal e nao sobreviveria a viagem
// ate aqui como objeto Date
function formatarValorSDeal(valor) {
  if (valor && typeof valor === "object" && valor.__data) {
    const dia = String(valor.dia).padStart(2, "0");
    const mes = String(valor.mes).padStart(2, "0");
    return `${dia}/${mes}/${valor.ano}`;
  }

  return valor;
}

// voucher ja usado ou sem validade e a resposta que muda o atendimento:
// merece cor
function situacaoVoucherEhAlerta(texto) {
  const t = (texto || "").toLowerCase();
  return (
    t.includes("utilizado") ||
    t.includes("revogad") ||
    t.includes("expirad") ||
    t.includes("cancelad")
  );
}

let ultimaBuscaSDeal = null;

function renderizarResultadoSDeal(dados, voucher) {
  ultimaBuscaSDeal = { dados, voucher };

  const situacao = $("sdealSituacao");
  situacao.textContent = dados.situacaoVoucher || "Situação não informada";
  situacao.classList.toggle("alerta", situacaoVoucherEhAlerta(dados.situacaoVoucher));

  preencherLinhasChaveValor(
    $("sdealLinhas"),
    CAMPOS_SDEAL.map(({ chave, rotulo }) => ({
      rotulo,
      valor: formatarValorSDeal(dados[chave])
    }))
  );

  $("resultadoSDeal").classList.remove("hidden");
}

async function buscarVoucherSDeal() {
  const campo = $("codigoVoucherSDeal");
  const botao = $("buscarVoucherBtn");
  const aviso = $("avisoSDeal");
  const voucher = campo.value.trim();

  if (!voucher) {
    mostrarAviso(aviso, "Digite o número do voucher.", "erro");
    campo.focus();
    return;
  }

  $("resultadoSDeal").classList.add("hidden");

  // rotulo do historico: o numero sozinho nao diz de quem e o voucher
  const rotuloHistorico = (dados) =>
    dados?.nomeCLiente ? `${voucher} — ${dados.nomeCLiente}` : voucher;

  const emCache = await obterCache("sdeal", voucher);
  if (emCache) {
    renderizarResultadoSDeal(emCache.dados, voucher);
    mostrarAviso(aviso, "Resultado da última busca (sem consultar de novo).", "ok");
    salvarNoHistorico("sdeal", voucher, rotuloHistorico(emCache.dados));
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no S.Deal...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "buscarVoucherSDeal",
      voucher
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      marcarErroNaAba("sdeal");
      if (erroPareceSessao(resposta?.erro)) marcarSessao("sdeal", false);
      return;
    }

    renderizarResultadoSDeal(resposta.dados, voucher);
    mostrarAviso(aviso, "Busca concluída.", "ok");

    salvarCache("sdeal", voucher, { dados: resposta.dados });
    limparErroNaAba("sdeal");
    marcarSessao("sdeal", true);
    salvarNoHistorico("sdeal", voucher, rotuloHistorico(resposta.dados));
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("sdeal");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function copiarResultadoSDeal() {
  if (!ultimaBuscaSDeal) return;

  const { dados, voucher } = ultimaBuscaSDeal;
  const linhas = [
    `Voucher: ${voucher}`,
    `Situação: ${dados.situacaoVoucher || "—"}`
  ];

  CAMPOS_SDEAL.forEach(({ chave, rotulo }) => {
    const valor = formatarValorSDeal(dados[chave]);
    if (valor) linhas.push(`${rotulo}: ${valor}`);
  });

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoSDeal"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoSDeal"), "Não foi possível copiar.", "erro"));
}

$("buscarVoucherBtn").addEventListener("click", buscarVoucherSDeal);
$("copiarSDealBtn").addEventListener("click", copiarResultadoSDeal);

$("codigoVoucherSDeal").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarVoucherSDeal();
});

registrarHistorico("sdeal", {
  containerId: "historicoSDeal",
  campoId: "codigoVoucherSDeal",
  aoSelecionar: buscarVoucherSDeal
});
