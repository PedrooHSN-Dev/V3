const EQUIPE = window.MACROS_EQUIPE || [];

let meusMacros = [];
let selecionado = null;

// a saudacao e a leitura/gravacao dos macros moram em src/comum/macros.js,
// compartilhadas com o content script
const { resolverResposta } = window.ApoioMacros;

function normalizarUsuario(lista) {
  let precisaSalvar = false;

  const normalizados = (Array.isArray(lista) ? lista : [])
    .filter((item) => item && item.comando && item.resposta)
    .map((item) => {
      if (!item.id) precisaSalvar = true;

      return {
        id: item.id || gerarId(),
        comando: String(item.comando),
        resposta: String(item.resposta),
        origem: "usuario"
      };
    });

  return { normalizados, precisaSalvar };
}

function macrosDaEquipe() {
  const usados = new Set(
    meusMacros.map((item) => item.comando.toLowerCase())
  );

  return EQUIPE.filter(
    (item) => item && item.comando && item.resposta
  )
    .map((item) => ({
      id: item.id || `equipe-${item.comando}`,
      comando: String(item.comando),
      resposta: String(item.resposta),
      origem: "equipe",
      // comando pessoal com o mesmo nome tem prioridade na digitacao
      substituido: usados.has(String(item.comando).toLowerCase())
    }))
    .sort((a, b) => a.comando.localeCompare(b.comando, "pt-BR"));
}

function todosOsMacros() {
  return [...meusMacros, ...macrosDaEquipe()];
}

async function carregarMacros() {
  // migrar: true so aqui — ver o comentario em src/comum/macros.js
  const guardados = await window.ApoioMacros.ler({ migrar: true });
  const { normalizados, precisaSalvar } = normalizarUsuario(guardados);

  meusMacros = normalizados;

  // recupera bases antigas gravadas sem id
  if (precisaSalvar) await salvarMacros();

  renderizarLista();
}

async function salvarMacros() {
  const sincronizou = await window.ApoioMacros.salvar(
    meusMacros.map(({ id, comando, resposta }) => ({ id, comando, resposta }))
  );

  // o aviso so aparece quando a gravacao no sync falha: os macros estao
  // salvos na maquina, mas nao vao acompanhar o usuario em outra
  $("avisoSync").classList.toggle("hidden", sincronizou !== false);
}

function abrirFormulario(macro = null) {
  $("formulario").classList.remove("hidden");

  $("macroId").value = macro?.id || "";
  $("comando").value = macro?.comando || "";
  $("resposta").value = macro?.resposta || "";

  $("comando").focus();
}

function fecharFormulario() {
  $("formulario").classList.add("hidden");
  $("macroId").value = "";
  $("comando").value = "";
  $("resposta").value = "";
}

async function salvarFormulario() {
  const id = $("macroId").value;
  const comando = $("comando").value.trim();
  const resposta = $("resposta").value.trim();

  if (!comando || !resposta) {
    alert("Preencha o comando e o resultado.");
    return;
  }

  const duplicado = meusMacros.some(
    (macro) =>
      macro.comando.toLowerCase() === comando.toLowerCase() &&
      macro.id !== id
  );

  if (duplicado) {
    alert("Você já tem um macro com esse comando.");
    return;
  }

  if (id) {
    const macro = meusMacros.find((item) => item.id === id);

    if (macro) {
      macro.comando = comando;
      macro.resposta = resposta;
    }
  } else {
    const novo = { id: gerarId(), comando, resposta, origem: "usuario" };
    meusMacros.push(novo);
    selecionado = novo.id;
  }

  await salvarMacros();

  fecharFormulario();
  renderizarLista();
}

async function excluirMacro(id) {
  const macro = meusMacros.find((item) => item.id === id);

  if (!macro) return;

  if (!confirm(`Excluir o macro "${macro.comando}"?`)) {
    return;
  }

  meusMacros = meusMacros.filter((item) => item.id !== id);

  if (selecionado === id) {
    selecionado = null;
  }

  await salvarMacros();
  renderizarLista();
}

function filtrar(lista) {
  const termo = $("busca").value.trim().toLowerCase();

  if (!termo) return [...lista];

  return lista.filter(
    (macro) =>
      macro.comando.toLowerCase().includes(termo) ||
      macro.resposta.toLowerCase().includes(termo)
  );
}

function criarItem(macro) {
  const item = document.createElement("li");
  item.className = "item";

  if (macro.id === selecionado) {
    item.classList.add("ativo");
  }

  const nome = document.createElement("span");
  nome.className = "comando";
  nome.textContent = macro.comando;
  item.appendChild(nome);

  if (macro.origem === "usuario") {
    const botoes = document.createElement("div");
    botoes.className = "acoes";

    const editar = criarBotaoIcone("editar", "Editar", ICONE_LAPIS, (evento) => {
      evento.stopPropagation();
      abrirFormulario(macro);
    });

    const excluir = criarBotaoIcone(
      "excluir",
      "Excluir",
      ICONE_LIXEIRA,
      (evento) => {
        evento.stopPropagation();
        excluirMacro(macro.id);
      }
    );

    botoes.appendChild(editar);
    botoes.appendChild(excluir);
    item.appendChild(botoes);
  } else if (macro.substituido) {
    const aviso = document.createElement("span");
    aviso.className = "tag-substituido";
    aviso.textContent = "substituído";
    item.appendChild(aviso);
  }

  item.addEventListener("click", () => {
    selecionado = macro.id;
    renderizarLista();
  });

  return item;
}

function renderizarLista() {
  const lista = $("lista");
  lista.innerHTML = "";

  const meus = filtrar(meusMacros).sort((a, b) =>
    a.comando.localeCompare(b.comando, "pt-BR")
  );
  const equipe = filtrar(macrosDaEquipe());
  const total = meusMacros.length + macrosDaEquipe().length;

  $("contador").textContent =
    `${meus.length + equipe.length}/${total} comando` +
    (total === 1 ? "" : "s");

  if (!meus.length && !equipe.length) {
    const vazio = document.createElement("li");
    vazio.className = "lista-vazia";
    vazio.textContent = $("busca").value.trim()
      ? "Nenhum comando corresponde à busca."
      : "Nenhum comando cadastrado. Clique em Criar para começar.";
    lista.appendChild(vazio);
    renderizarDetalhe();
    return;
  }

  if (meus.length) {
    lista.appendChild(criarCabecalhoGrupo("Meus macros"));
    meus.forEach((macro) => lista.appendChild(criarItem(macro)));
  }

  if (equipe.length) {
    lista.appendChild(criarCabecalhoGrupo("Da equipe"));
    equipe.forEach((macro) => lista.appendChild(criarItem(macro)));
  }

  renderizarDetalhe();
}

function renderizarDetalhe() {
  const detalhe = $("detalhe");
  detalhe.innerHTML = "";

  // sem essa checagem, selecionado null casaria com macro sem id
  const macro = selecionado
    ? todosOsMacros().find((item) => item.id === selecionado)
    : null;

  if (!macro) {
    detalhe.classList.add("vazio");
    detalhe.textContent = "Selecione um comando para ver o resultado.";
    return;
  }

  detalhe.classList.remove("vazio");

  const topo = document.createElement("div");
  topo.className = "detalhe-topo";

  const titulo = document.createElement("div");
  titulo.className = "detalhe-titulo";

  const comando = document.createElement("strong");
  comando.textContent = macro.comando;
  titulo.appendChild(comando);

  if (macro.origem === "equipe") {
    const selo = document.createElement("span");
    selo.className = "selo";
    selo.textContent = "Da equipe";
    titulo.appendChild(selo);
  }

  const acoes = document.createElement("div");
  acoes.className = "detalhe-acoes";

  if (macro.origem === "equipe") {
    const copiarParaMim = document.createElement("button");
    copiarParaMim.textContent = "Editar cópia";
    copiarParaMim.className = "acao";
    copiarParaMim.addEventListener("click", () => {
      abrirFormulario({
        id: "",
        comando: macro.comando,
        resposta: macro.resposta
      });
    });
    acoes.appendChild(copiarParaMim);
  }

  const copiar = document.createElement("button");
  copiar.textContent = "Copiar";
  copiar.className = "acao copiar";

  copiar.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resolverResposta(macro));
      copiar.textContent = "Copiado";
      setTimeout(() => {
        copiar.textContent = "Copiar";
      }, 1200);
    } catch {
      alert("Não foi possível copiar. Selecione o texto e use Ctrl+C.");
    }
  });

  acoes.appendChild(copiar);

  topo.appendChild(titulo);
  topo.appendChild(acoes);

  const texto = document.createElement("div");
  texto.className = "resposta";
  texto.textContent = resolverResposta(macro);

  detalhe.appendChild(topo);
  detalhe.appendChild(texto);

  if (macro.origem === "equipe" && macro.substituido) {
    const nota = document.createElement("p");
    nota.className = "nota";
    nota.textContent =
      "Você tem um macro pessoal com esse mesmo comando. O seu é o que será inserido ao digitar.";
    detalhe.appendChild(nota);
  }
}

$("novoBtn").addEventListener("click", () => {
  abrirFormulario();
});

$("cancelarBtn").addEventListener("click", () => {
  fecharFormulario();
});

$("salvarBtn").addEventListener("click", salvarFormulario);

$("busca").addEventListener("input", () => {
  renderizarLista();
});

/* Importar / exportar macros ---------------------------------------- */

function exportarMacros() {
  if (!meusMacros.length) {
    alert("Você ainda não tem macros para exportar.");
    return;
  }

  const dados = {
    versao: chrome.runtime.getManifest().version,
    exportadoEm: new Date().toISOString(),
    macros: meusMacros.map(({ comando, resposta }) => ({ comando, resposta }))
  };

  const blob = new Blob([JSON.stringify(dados, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `apoio-soluti-macros-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function extrairMacrosImportados(json) {
  const lista = Array.isArray(json) ? json : json?.macros;
  if (!Array.isArray(lista)) return null;

  return lista.filter(
    (item) =>
      item &&
      typeof item.comando === "string" &&
      item.comando.trim() &&
      typeof item.resposta === "string" &&
      item.resposta.trim()
  );
}

async function importarMacros(arquivo) {
  let texto;
  try {
    texto = await arquivo.text();
  } catch {
    alert("Não foi possível ler o arquivo.");
    return;
  }

  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    alert("Arquivo inválido: não é um JSON válido.");
    return;
  }

  const importados = extrairMacrosImportados(json);

  if (!importados) {
    alert("Arquivo inválido: formato de macros não reconhecido.");
    return;
  }

  if (!importados.length) {
    alert("Nenhum macro válido encontrado no arquivo.");
    return;
  }

  let novos = 0;
  let atualizados = 0;

  importados.forEach((item) => {
    const comando = item.comando.trim();
    const resposta = item.resposta.trim();

    // importados sempre entram como macro pessoal, mesmo que tenham vindo
    // de um macro "da equipe" exportado por outra pessoa
    const existente = meusMacros.find(
      (macro) => macro.comando.toLowerCase() === comando.toLowerCase()
    );

    if (existente) {
      existente.resposta = resposta;
      atualizados += 1;
    } else {
      meusMacros.push({ id: gerarId(), comando, resposta, origem: "usuario" });
      novos += 1;
    }
  });

  await salvarMacros();
  renderizarLista();

  alert(`Importação concluída: ${novos} novo(s), ${atualizados} atualizado(s).`);
}

$("exportarMacrosBtn").addEventListener("click", exportarMacros);

$("importarMacrosBtn").addEventListener("click", () => {
  $("importarMacrosInput").click();
});

$("importarMacrosInput").addEventListener("change", async (evento) => {
  const [arquivo] = evento.target.files;
  evento.target.value = "";
  if (arquivo) await importarMacros(arquivo);
});

// outra janela do popup, outro dispositivo pelo sync, ou o proprio content
// script: qualquer mudanca redesenha a lista
window.ApoioMacros.aoMudar((lista) => {
  const { normalizados } = normalizarUsuario(lista);
  meusMacros = normalizados;
  renderizarLista();
});
