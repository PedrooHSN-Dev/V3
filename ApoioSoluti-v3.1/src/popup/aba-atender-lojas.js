let lojasPreparado = false;
let indiceLojas = [];
let lojasFiltradas = [];

async function prepararLojas() {
  const primeiraVez = !lojasPreparado;
  lojasPreparado = true;

  const dados = await obterLojas();
  montarIndiceLojas(dados.lojas);

  if (!primeiraVez) {
    renderizarLojas();
    atualizarCarimboLojas(dados.atualizadoEm);
    return;
  }

  const ufs = [...new Set(indiceLojas.map((r) => r.uf).filter(Boolean))].sort();
  const select = $("filtroUfLoja");
  ufs.forEach((uf) => {
    const opcao = document.createElement("option");
    opcao.value = uf;
    opcao.textContent = uf;
    select.appendChild(opcao);
  });

  $("buscaLoja").addEventListener("input", renderizarLojas);
  $("filtroUfLoja").addEventListener("change", renderizarLojas);
  $("atualizarLojasBtn").addEventListener("click", atualizarLojasManual);

  // com cartoes marcados o botao copia so eles; sem nenhum, copia o resultado
  // inteiro da busca atual
  $("copiarTodasLojas").addEventListener("click", () => {
    const marcadas = [...selecoes.loja.values()];

    copiarTodas(
      marcadas.length ? marcadas : lojasFiltradas.map(textoLoja),
      $("copiarTodasLojas"),
      sincronizarSelecaoLojas
    );
  });

  $("limparSelecaoLojas").addEventListener("click", () => {
    selecoes.loja.clear();
    renderizarLojas();
  });

  renderizarLojas();
  atualizarCarimboLojas(dados.atualizadoEm);
}

async function obterLojas() {
  try {
    const guardado = await chrome.storage.local.get([
      "lojas",
      "lojasAtualizadoEm"
    ]);

    // usa o que o background baixou; se ainda nao baixou, o fallback embutido
    if (Array.isArray(guardado.lojas) && guardado.lojas.length) {
      return {
        lojas: guardado.lojas,
        atualizadoEm: guardado.lojasAtualizadoEm || null
      };
    }
  } catch {}

  return { lojas: window.LOJAS_SOLUTI || [], atualizadoEm: null };
}

function montarIndiceLojas(lista) {
  indiceLojas = (lista || []).map((r, i) => ({
    ...r,
    _id: `loja-${i}`,
    chave: semAcento(`${r.loja} ${r.regiao} ${r.uf} ${r.end} ${r.email}`)
  }));
}

// A raspagem do site da Soluti pode falhar em silencio e deixar a lista
// velha na tela sem ninguem notar. A data fica visivel ao lado do contador,
// com a idade em dias quando ja passou do esperado (a busca e diaria).
function atualizarCarimboLojas(quando) {
  const btn = $("atualizarLojasBtn");
  const carimbo = $("lojasCarimbo");

  if (!quando) {
    btn.title = "Buscar a lista mais recente no site da Soluti";
    carimbo.textContent = "lista embutida";
    return;
  }

  const d = new Date(quando);
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const dias = Math.floor((Date.now() - quando) / 86400000);

  btn.title = `Última atualização: ${data} ${hora}`;
  carimbo.textContent =
    dias >= 3 ? `atualizada em ${data} (${dias} dias)` : `atualizada em ${data}`;
}

async function atualizarLojasManual() {
  const btn = $("atualizarLojasBtn");
  const rotulo = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Atualizando...";

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "atualizarLojas"
    });

    if (!resposta || resposta.erro) {
      btn.textContent = "Falhou";
      btn.title = resposta?.erro || "Não foi possível atualizar.";
      setTimeout(() => (btn.textContent = rotulo), 2000);
    } else {
      const dados = await obterLojas();
      montarIndiceLojas(dados.lojas);
      // a lista mudou: as marcacoes antigas nao correspondem mais aos cartoes
      selecoes.loja.clear();
      renderizarLojas();
      atualizarCarimboLojas(dados.atualizadoEm);
      btn.textContent = "Atualizado";
      setTimeout(() => (btn.textContent = rotulo), 1600);
    }
  } catch (erro) {
    btn.textContent = "Falhou";
    btn.title = erro.message || "Erro ao atualizar.";
    setTimeout(() => (btn.textContent = rotulo), 2000);
  } finally {
    btn.disabled = false;
  }
}

function renderizarLojas() {
  const termo = semAcento($("buscaLoja").value.trim());
  const uf = $("filtroUfLoja").value;
  const lista = $("listaLojas");
  const contador = $("lojasContador");

  const termos = termo.split(/\s+/).filter(Boolean);

  const achados = indiceLojas.filter((r) => {
    if (uf && r.uf !== uf) return false;
    return termos.every((t) => r.chave.includes(t));
  });

  lojasFiltradas = achados;
  sincronizarSelecaoLojas();

  lista.innerHTML = "";

  if (!achados.length) {
    contador.textContent = "Nenhuma loja encontrada.";
    const vazio = document.createElement("li");
    vazio.className = "parceiro-vazio";
    vazio.textContent = "Ajuste a busca ou o filtro de UF.";
    lista.appendChild(vazio);
    return;
  }

  const total = indiceLojas.length;
  contador.textContent =
    achados.length === total
      ? `${total} lojas Soluti`
      : `${achados.length} de ${total} lojas`;

  const fragmento = document.createDocumentFragment();
  achados.forEach((r) => fragmento.appendChild(criarCartaoLoja(r)));
  lista.appendChild(fragmento);
}


/* Cartao de loja --------------------------------------------------- */

function textoLoja(r) {
  const linhas = [r.loja];
  if (r.regiao) linhas.push(r.regiao + (r.uf ? ` - ${r.uf}` : ""));
  if (r.end) linhas.push(r.end);
  if (r.fechado) linhas.push("Temporariamente fechada");
  if (r.func) linhas.push(`Funcionamento: ${r.func}`);
  if (r.almoco) linhas.push(`Almoço: ${r.almoco}`);
  if (r.email) linhas.push(r.email);
  return linhas.join("\n");
}

function sincronizarSelecaoLojas() {
  const total = selecoes.loja.size;
  const etiqueta = $("lojasSelecao");
  const botao = $("copiarTodasLojas");

  etiqueta.textContent = total
    ? `${total} selecionada${total === 1 ? "" : "s"}`
    : "";
  etiqueta.classList.toggle("hidden", !total);
  $("limparSelecaoLojas").classList.toggle("hidden", !total);

  botao.textContent = total ? `Copiar selecionadas (${total})` : "Copiar todas";
  botao.disabled = total ? false : !lojasFiltradas.length;
}

function criarCartaoLoja(r) {
  const item = document.createElement("li");
  item.className = "parceiro";

  const texto = textoLoja(r);

  const topo = document.createElement("div");
  topo.className = "parceiro-topo";

  const nome = document.createElement("span");
  nome.className = "parceiro-nome";
  nome.textContent = r.loja;

  const status = document.createElement("span");
  status.className = `loja-status ${r.fechado ? "fechada" : "aberta"}`;
  status.textContent = r.fechado ? "Fechada" : r.uf || "Loja";

  topo.appendChild(nome);
  montarTopoCartao(topo, item, texto, status);
  item.appendChild(topo);

  const local = document.createElement("div");
  local.className = "parceiro-local";
  local.textContent = r.regiao;
  item.appendChild(local);

  const end = document.createElement("div");
  end.className = "parceiro-end";
  end.textContent = r.end;
  item.appendChild(end);

  if (r.fechado) {
    const aviso = document.createElement("div");
    aviso.className = "parceiro-end";
    aviso.style.color = "#b42318";
    aviso.style.marginTop = "5px";
    aviso.textContent = "Temporariamente fechada";
    item.appendChild(aviso);
  }

  const horarios = document.createElement("div");
  horarios.className = "loja-horarios";

  if (r.func) {
    const f = document.createElement("span");
    f.innerHTML = "<b>Funcionamento:</b> ";
    f.appendChild(document.createTextNode(r.func));
    horarios.appendChild(f);
  }

  if (r.almoco) {
    const a = document.createElement("span");
    a.innerHTML = "<b>Almoço:</b> ";
    a.appendChild(document.createTextNode(r.almoco));
    horarios.appendChild(a);
  }

  if (horarios.children.length) item.appendChild(horarios);

  if (r.email) {
    const rodape = document.createElement("div");
    rodape.className = "parceiro-rodape cartao-email";

    const email = document.createElement("span");
    email.className = "parceiro-tel";
    email.textContent = r.email;
    rodape.appendChild(email);

    item.appendChild(rodape);
  }

  tornarSelecionavel(item, "loja", r, texto);
  return item;
}

