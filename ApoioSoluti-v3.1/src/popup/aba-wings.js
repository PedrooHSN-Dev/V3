// Aba Wings: assinatura, autenticações e o perfil do usuário.
//
// O que quase sempre responde a pergunta do atendimento (quantas
// assinaturas sobraram, quando vence) fica no topo, sempre aberto. O resto
// — usuário, validade, emissões, eventos — vem recolhido: é muita linha
// para uma janela de 580px, e na maioria dos atendimentos não se olha.

// as datas vem como { date: "aaaa-mm-dd hh:mm:ss.uuuuuu" }; aqui so
// interessa ate o minuto
function formatarDataWings(campoData) {
  const bruto = campoData?.date;
  if (!bruto) return null;

  const partes = bruto.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!partes) return bruto;

  const [, ano, mes, dia, hora, minuto] = partes;
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function simOuNao(valor) {
  if (valor === undefined || valor === null) return null;
  return valor ? "Sim" : "Não";
}

function recolherSecoesWings() {
  document.querySelectorAll(".wings-secao-cabecalho").forEach((botao) => {
    botao.setAttribute("aria-expanded", "false");
    $(botao.dataset.alvo)?.classList.add("hidden");
  });
}

document.querySelectorAll(".wings-secao-cabecalho").forEach((botao) => {
  botao.addEventListener("click", () => {
    const alvo = $(botao.dataset.alvo);
    if (!alvo) return;

    const abrindo = alvo.classList.contains("hidden");
    alvo.classList.toggle("hidden", !abrindo);
    botao.setAttribute("aria-expanded", String(abrindo));
  });
});

let ultimaBuscaWings = null;

function renderizarResultadoWings(userRetail, deepDetail, documento) {
  ultimaBuscaWings = { userRetail, deepDetail, documento };

  // busca nova comeca com tudo fechado: senao a secao que ficou aberta na
  // consulta anterior mostra os dados de outro cliente
  recolherSecoesWings();

  $("wingsUsuarioNome").textContent = userRetail.name
    ? `${userRetail.name} (#${userRetail.id})`
    : `Usuário #${userRetail.id}`;

  const regras = userRetail.billingLimits?.limitRules || {};
  preencherLinhasChaveValor($("wingsLinhas"), [
    { rotulo: "Documento", valor: userRetail.username },
    { rotulo: "E-mail", valor: userRetail.email },
    { rotulo: "Telefone", valor: userRetail.phoneNumber },
    { rotulo: "Tipo de usuário", valor: userRetail.userType },
    { rotulo: "Assinatura", valor: regras.signature },
    { rotulo: "Autenticações", valor: regras.login },
    { rotulo: "Vencimento", valor: formatarDataWings(regras.dueDate) }
  ]);

  const usuario = deepDetail?.user?.[0] || {};
  preencherLinhasChaveValor($("wingsUsuario"), [
    { rotulo: "ID", valor: usuario.id },
    { rotulo: "Usuário (login)", valor: usuario.username },
    { rotulo: "Nome", valor: usuario.name },
    { rotulo: "E-mail", valor: usuario.email },
    { rotulo: "Telefone", valor: usuario.phoneNumber },
    { rotulo: "Sincronização HSM", valor: formatarDataWings(usuario.dateHsmSync) },
    { rotulo: "Novo usuário", valor: simOuNao(usuario.isNew) }
  ]);

  const hsm = deepDetail?.hsmObject?.[0] || {};
  preencherLinhasChaveValor($("wingsValidade"), [
    { rotulo: "ID", valor: hsm.id },
    { rotulo: "Alias", valor: hsm.alias },
    { rotulo: "Criado em", valor: formatarDataWings(hsm.dateCreate) },
    { rotulo: "Expira em", valor: formatarDataWings(hsm.expireTime) },
    { rotulo: "Válido", valor: simOuNao(hsm.isValid) }
  ]);

  // Emissoes: um bloco por emissao. O filtro existe porque a API as vezes
  // devolve arrays vazios no meio da lista.
  const emissoes = (deepDetail?.emission || []).filter(
    (item) => item && typeof item === "object" && !Array.isArray(item)
  );

  const containerEmissoes = $("wingsEmissoes");
  containerEmissoes.innerHTML = "";
  $("wingsEmissoesContagem").textContent = emissoes.length ? ` (${emissoes.length})` : "";

  if (!emissoes.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Nenhuma emissão encontrada.";
    containerEmissoes.appendChild(vazio);
  } else {
    emissoes.forEach((emissao) => {
      const certificado = emissao.data?.certificado || {};
      const dadosEmissao = emissao.data?.emissao || {};

      const bloco = document.createElement("div");
      bloco.className = "wings-emissao linhas-cv";
      containerEmissoes.appendChild(bloco);

      preencherLinhasChaveValor(bloco, [
        { rotulo: "ID", valor: emissao.id },
        { rotulo: "Código", valor: emissao.code },
        { rotulo: "Status", valor: emissao.status },
        { rotulo: "Início", valor: formatarDataWings(emissao.dateStart) },
        { rotulo: "Fim", valor: formatarDataWings(emissao.dateEnd) },
        { rotulo: "Bloqueado", valor: emissao.locked ? "Sim" : "Não" },
        { rotulo: "Certificado", valor: certificado.nome },
        { rotulo: "Categoria", valor: certificado.categoria },
        { rotulo: "Perfil", valor: certificado.perfiliti },
        { rotulo: "Mídia", valor: certificado.midia },
        { rotulo: "Política", valor: certificado.politica },
        { rotulo: "Validade (meses)", valor: certificado.validade },
        { rotulo: "SKU", valor: certificado.sku },
        { rotulo: "Status da emissão", valor: dadosEmissao.status },
        { rotulo: "Observação", valor: dadosEmissao.obs },
        { rotulo: "Data/hora", valor: emissao.data?.datetime }
      ]);
    });
  }

  const eventos = deepDetail?.event || [];
  const listaEventos = $("wingsEventos");
  listaEventos.innerHTML = "";
  $("wingsEventosContagem").textContent = eventos.length ? ` (${eventos.length})` : "";

  if (!eventos.length) {
    const vazio = document.createElement("div");
    vazio.className = "resultado-vazio";
    vazio.textContent = "Nenhum evento recente encontrado.";
    listaEventos.appendChild(vazio);
  } else {
    eventos.forEach((evento) => {
      const linha = document.createElement("div");
      linha.className = "registro";

      const data = document.createElement("span");
      data.className = "registro-id";
      data.textContent = formatarDataWings(evento.dateStart) || "—";

      const detalhe = document.createElement("span");
      detalhe.className = "registro-detalhe";
      detalhe.textContent = evento.comments || `Código ${evento.code}`;

      linha.appendChild(data);
      linha.appendChild(detalhe);
      listaEventos.appendChild(linha);
    });
  }

  $("resultadoWings").classList.remove("hidden");
}

async function buscarWings() {
  const campo = $("documentoWings");
  const botao = $("buscarWingsBtn");
  const aviso = $("avisoWings");
  const documento = campo.value.trim();

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ do usuário.", "erro");
    campo.focus();
    return;
  }

  $("resultadoWings").classList.add("hidden");

  const rotuloHistorico = (userRetail) =>
    userRetail?.name ? `${userRetail.name} — ${documento}` : documento;

  const emCache = await obterCache("wings", documento);
  if (emCache) {
    renderizarResultadoWings(emCache.userRetail, emCache.deepDetail, documento);
    mostrarAviso(aviso, "Resultado da última busca (sem consultar de novo).", "ok");
    salvarNoHistorico("wings", documento, rotuloHistorico(emCache.userRetail));
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no Wings...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "buscarWings",
      cpfCnpj: documento
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      marcarErroNaAba("wings");
      if (erroPareceSessao(resposta?.erro)) marcarSessao("wings", false);
      return;
    }

    renderizarResultadoWings(resposta.userRetail, resposta.deepDetail, documento);
    mostrarAviso(aviso, "Busca concluída.", "ok");

    salvarCache("wings", documento, {
      userRetail: resposta.userRetail,
      deepDetail: resposta.deepDetail
    });

    limparErroNaAba("wings");
    marcarSessao("wings", true);
    salvarNoHistorico("wings", documento, rotuloHistorico(resposta.userRetail));
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("wings");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function copiarResultadoWings() {
  if (!ultimaBuscaWings) return;

  const { userRetail, deepDetail, documento } = ultimaBuscaWings;
  const regras = userRetail.billingLimits?.limitRules || {};
  const usuario = deepDetail?.user?.[0] || {};
  const hsm = deepDetail?.hsmObject?.[0] || {};
  const emissoes = deepDetail?.emission || [];
  const eventos = deepDetail?.event || [];

  const linhas = [
    `Documento: ${documento}`,
    `Nome: ${userRetail.name || "—"} (#${userRetail.id})`,
    `E-mail: ${userRetail.email || "—"}`,
    `Telefone: ${userRetail.phoneNumber || "—"}`,
    `Assinatura: ${regras.signature ?? "—"}`,
    `Autenticações: ${regras.login ?? "—"}`,
    `Vencimento: ${formatarDataWings(regras.dueDate) || "—"}`,
    "",
    "Usuário:",
    `  ID: ${usuario.id ?? "—"}`,
    `  Login: ${usuario.username || "—"}`,
    `  Nome: ${usuario.name || "—"}`,
    `  E-mail: ${usuario.email || "—"}`,
    `  Telefone: ${usuario.phoneNumber || "—"}`,
    `  Sincronização HSM: ${formatarDataWings(usuario.dateHsmSync) || "—"}`,
    "",
    "Validade:",
    `  ID: ${hsm.id ?? "—"}`,
    `  Alias: ${hsm.alias || "—"}`,
    `  Criado em: ${formatarDataWings(hsm.dateCreate) || "—"}`,
    `  Expira em: ${formatarDataWings(hsm.expireTime) || "—"}`,
    `  Válido: ${simOuNao(hsm.isValid) || "—"}`,
    "",
    "Emissão:"
  ];

  if (!emissoes.length) {
    linhas.push("  Nenhuma emissão encontrada.");
  } else {
    emissoes.forEach((emissao, indice) => {
      const certificado = emissao.data?.certificado || {};
      const dadosEmissao = emissao.data?.emissao || {};

      linhas.push(
        `  [${indice + 1}] ${certificado.nome || "—"} — código ${emissao.code || "—"}`,
        `      Início: ${formatarDataWings(emissao.dateStart) || "—"} | Fim: ${formatarDataWings(emissao.dateEnd) || "—"}`,
        `      Status: ${emissao.status ?? "—"} | Status emissão: ${dadosEmissao.status ?? "—"} | Obs: ${dadosEmissao.obs || "—"}`
      );
    });
  }

  linhas.push("", "Eventos:");

  if (!eventos.length) {
    linhas.push("  Nenhum evento encontrado.");
  } else {
    eventos.forEach((evento) => {
      linhas.push(
        `  ${formatarDataWings(evento.dateStart) || "—"} — ${evento.comments || `Código ${evento.code}`}`
      );
    });
  }

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoWings"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoWings"), "Não foi possível copiar.", "erro"));
}

$("buscarWingsBtn").addEventListener("click", buscarWings);
$("copiarWingsBtn").addEventListener("click", copiarResultadoWings);

$("documentoWings").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarWings();
});

registrarHistorico("wings", {
  containerId: "historicoWings",
  campoId: "documentoWings",
  aoSelecionar: buscarWings
});
