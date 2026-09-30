if (!window.__apoioSolutiCarregado) {
  window.__apoioSolutiCarregado = true;

  const TIPOS_TEXTO = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
    ""
  ]);

  const EQUIPE = window.MACROS_EQUIPE || [];

  let macros = [];
  let aplicando = false;

  function normalizar(lista, origem) {
    if (!Array.isArray(lista)) return [];

    return lista
      .filter((item) => item && item.comando && item.resposta)
      .map((item) => ({
        id: item.id || `${origem}-${item.comando}`,
        comando: String(item.comando),
        resposta: String(item.resposta),
        origem
      }));
  }

  function montarLista(macrosUsuario) {
    const usuario = normalizar(macrosUsuario, "usuario");
    const usados = new Set(usuario.map((item) => item.comando.toLowerCase()));

    // macro pessoal com o mesmo comando tem prioridade sobre o da equipe
    const equipe = normalizar(EQUIPE, "equipe").filter(
      (item) => !usados.has(item.comando.toLowerCase())
    );

    const lista = [...usuario, ...equipe];

    // garante que .ini exista mesmo se nao estiver na lista, para a saudacao
    // por horario sempre funcionar. Resposta vazia vira "Bom dia!/..." no
    // resolverResposta.
    const temIni = lista.some((m) => m.comando.toLowerCase() === ".ini");
    if (!temIni) {
      lista.push({
        id: "builtin-ini",
        comando: ".ini",
        resposta: "",
        origem: "equipe"
      });
    }

    return lista.sort((a, b) => b.comando.length - a.comando.length);
  }

  const { resolverResposta } = window.ApoioMacros;

  async function carregarMacros() {
    try {
      macros = montarLista(await window.ApoioMacros.ler());
    } catch (erro) {
      console.error("Apoio Soluti: erro ao carregar macros:", erro);
      macros = montarLista([]);
    }
  }

  window.ApoioMacros.aoMudar((lista) => {
    macros = montarLista(lista);
  });

  function ehLimite(caractere) {
    return caractere === undefined || /\s/.test(caractere);
  }

  function encontrarMacro(textoAntesDoCursor) {
    if (!textoAntesDoCursor) return null;

    const alvo = textoAntesDoCursor.toLowerCase();

    for (const macro of macros) {
      const comando = macro.comando.toLowerCase();

      if (!alvo.endsWith(comando)) continue;

      const anterior = alvo[alvo.length - comando.length - 1];
      if (ehLimite(anterior)) return macro;
    }

    return null;
  }

  function ehCampoTexto(elemento) {
    if (!elemento || elemento.nodeType !== Node.ELEMENT_NODE) return false;
    if (elemento.isContentEditable) return true;

    const tag = elemento.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;

    return TIPOS_TEXTO.has((elemento.type || "").toLowerCase());
  }

  function definirValorNativo(elemento, valor) {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(elemento),
      "value"
    )?.set;

    if (setter) {
      setter.call(elemento, valor);
    } else {
      elemento.value = valor;
    }

    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tratarCampoSimples(elemento) {
    const cursor = elemento.selectionStart;
    if (cursor === null || cursor !== elemento.selectionEnd) return;

    const antes = elemento.value.slice(0, cursor);
    const macro = encontrarMacro(antes);
    if (!macro) return;

    const inicio = cursor - macro.comando.length;

    elemento.setSelectionRange(inicio, cursor);

    const resposta = resolverResposta(macro);

    // execCommand mantem o historico de desfazer e avisa React/Vue corretamente
    const inserido = document.execCommand("insertText", false, resposta);

    if (!inserido) {
      const novoValor =
        elemento.value.slice(0, inicio) +
        resposta +
        elemento.value.slice(cursor);

      definirValorNativo(elemento, novoValor);

      const posicao = inicio + resposta.length;
      elemento.setSelectionRange(posicao, posicao);
    }
  }

  function obterSelecao(elemento) {
    const raiz = elemento.getRootNode();

    if (raiz && typeof raiz.getSelection === "function") {
      return raiz.getSelection();
    }

    return document.getSelection();
  }

  function tratarEditavel(elemento) {
    const selecao = obterSelecao(elemento);
    if (!selecao || !selecao.isCollapsed || selecao.rangeCount === 0) return;

    const range = selecao.getRangeAt(0);
    const no = range.startContainer;
    if (no.nodeType !== Node.TEXT_NODE) return;

    const antes = no.textContent.slice(0, range.startOffset);
    const macro = encontrarMacro(antes);
    if (!macro) return;

    const inicio = range.startOffset - macro.comando.length;
    if (inicio < 0) return;

    const selecaoComando = document.createRange();
    selecaoComando.setStart(no, inicio);
    selecaoComando.setEnd(no, range.startOffset);

    selecao.removeAllRanges();
    selecao.addRange(selecaoComando);

    // insertText passa pelo beforeinput, entao Lexical, ProseMirror,
    // Draft e Slate atualizam o proprio modelo interno
    document.execCommand("insertText", false, resolverResposta(macro));
  }

  document.addEventListener(
    "input",
    (evento) => {
      if (aplicando || !macros.length) return;

      const alvo = evento.composedPath?.()[0] || evento.target;
      if (!ehCampoTexto(alvo)) return;

      aplicando = true;

      try {
        if (alvo.isContentEditable) {
          tratarEditavel(alvo);
        } else {
          tratarCampoSimples(alvo);
        }
      } catch (erro) {
        console.error("Apoio Soluti: erro ao aplicar macro:", erro);
      } finally {
        aplicando = false;
      }
    },
    true
  );

  carregarMacros();


  /* ------------------------------------------------------------------
     Extrair texto da tela (Ctrl+M)
     ------------------------------------------------------------------ */

  const CAIXA_ID = "apoio-soluti-camada";
  const AVISO_ID = "apoio-soluti-aviso";

  const ESTILO_BASE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", Arial, sans-serif; }
  `;

  let camada = null;
  let aviso = null;
  let avisoTimer = null;

  // true entre o envio do pedido de captura e a confirmacao do print
  let esperandoPrint = false;

  function removerCamada() {
    camada?.remove();
    camada = null;
  }

  function finalizarSelecao() {
    removerCamada();
  }

  function fecharAviso() {
    clearTimeout(avisoTimer);
    avisoTimer = null;
    aviso?.remove();
    aviso = null;
  }

  // com um elemento em fullscreen nativo (comum em zoom/lightbox de imagem),
  // o navegador so renderiza o que estiver dentro dele: qualquer coisa fora
  // fica invisivel mesmo com z-index maximo. Por isso a camada precisa ser
  // anexada dentro do proprio elemento em fullscreen quando ele existir.
  function raizDeAnexo() {
    return document.fullscreenElement || document.documentElement;
  }

  function criarHost(id) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText =
      "all: initial; position: fixed; z-index: 2147483647;";
    raizDeAnexo().appendChild(host);
    return host.attachShadow({ mode: "open" });
  }

  function iniciarSelecao() {
    // uma selecao ja em andamento: o segundo pedido nao empilha outra camada
    if (camada) return;
    fecharAviso();

    const host = document.createElement("div");
    host.id = CAIXA_ID;
    host.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483647;";

    const raiz = host.attachShadow({ mode: "open" });
    raiz.innerHTML = `
      <style>
        ${ESTILO_BASE}
        .tela {
          position: fixed;
          inset: 0;
          cursor: crosshair;
          background: rgba(15, 23, 20, 0.28);
        }
        .dica {
          position: fixed;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 15px;
          color: white;
          background: rgba(17, 24, 21, 0.88);
          border-radius: 999px;
          font-size: 13px;
          white-space: nowrap;
        }
        .selecao {
          position: fixed;
          display: none;
          border: 2px solid #2bf14d;
          background: transparent;
          box-shadow: 0 0 0 9999px rgba(15, 23, 20, 0.28);
        }
      </style>
      <div class="tela"></div>
      <div class="dica">Arraste para selecionar a área. Esc cancela.</div>
      <div class="selecao"></div>
    `;

    raizDeAnexo().appendChild(host);
    camada = host;

    const tela = raiz.querySelector(".tela");
    const marcador = raiz.querySelector(".selecao");
    const dica = raiz.querySelector(".dica");

    let inicioX = 0;
    let inicioY = 0;
    let arrastando = false;

    function desenhar(evento) {
      const x = Math.min(inicioX, evento.clientX);
      const y = Math.min(inicioY, evento.clientY);
      const largura = Math.abs(evento.clientX - inicioX);
      const altura = Math.abs(evento.clientY - inicioY);

      marcador.style.display = "block";
      marcador.style.left = `${x}px`;
      marcador.style.top = `${y}px`;
      marcador.style.width = `${largura}px`;
      marcador.style.height = `${altura}px`;

      return { x, y, width: largura, height: altura };
    }

    function cancelar() {
      document.removeEventListener("keydown", aoTeclar, true);
      finalizarSelecao();
    }

    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopPropagation();
      cancelar();
    }

    tela.addEventListener("mousedown", (evento) => {
      if (evento.button !== 0) return;
      evento.preventDefault();
      arrastando = true;
      inicioX = evento.clientX;
      inicioY = evento.clientY;
      // a moldura some junto com a tela: o retangulo passa a dar o contraste
      tela.style.background = "transparent";
      desenhar(evento);
    });

    tela.addEventListener("mousemove", (evento) => {
      if (!arrastando) return;
      desenhar(evento);
    });

    tela.addEventListener("mouseup", async (evento) => {
      if (!arrastando) return;
      arrastando = false;

      const area = desenhar(evento);

      document.removeEventListener("keydown", aoTeclar, true);

      if (area.width < 8 || area.height < 8) {
        finalizarSelecao();
        return;
      }

      dica.textContent = "Lendo o texto...";
      marcador.style.display = "none";

      // a camada precisa sumir do print antes da captura
      camada.style.visibility = "hidden";
      await proximoQuadro();
      await proximoQuadro();

      await capturarArea(area);
    });

    document.addEventListener("keydown", aoTeclar, true);
  }

  // Pede o print ao background e trata o resultado. A camada de selecao so
  // pode sair depois que o background confirmar o print — senao o proprio
  // aviso "Lendo o texto..." entra na imagem e vira ruido pro OCR.
  async function capturarArea(rect) {
    esperandoPrint = true;

    try {
      const resposta = await chrome.runtime.sendMessage({
        tipo: "capturar",
        rect,
        dpr: window.devicePixelRatio || 1
      });

      esperandoPrint = false;
      finalizarSelecao();
      await tratarResposta(resposta);
    } catch (erro) {
      esperandoPrint = false;
      finalizarSelecao();
      mostrarAviso(erro.message || String(erro), "erro");
    }
  }

  function aoPrintPronto() {
    if (!esperandoPrint) return;
    esperandoPrint = false;

    finalizarSelecao();
    mostrarAviso("Lendo o texto...", "carregando");
  }

  function proximoQuadro() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  // O texto lido nao aparece na tela: vai direto para a area de transferencia
  // e o aviso diz so se deu certo. Quem le um codigo quer cola-lo em seguida,
  // e o cartao com o texto era um passo a mais no meio do caminho.
  async function tratarResposta(resposta) {
    if (!resposta) {
      mostrarAviso("Sem resposta da extensão.", "erro");
      return;
    }

    if (resposta.erro) {
      mostrarAviso(resposta.erro, "erro");
      return;
    }

    const texto = (resposta.texto || "").trim();

    if (!texto) {
      mostrarAviso("Nenhum texto reconhecido nessa área.", "erro");
      return;
    }

    if (await copiarTexto(texto)) {
      mostrarAviso("Texto copiado.", "ok");
    } else {
      mostrarAviso("O texto foi lido, mas não consegui copiar.", "erro");
    }
  }

  // tipo: "carregando" (neutro, fica ate a resposta chegar), "ok" (verde) ou
  // "erro" (vermelho) — os dois ultimos somem sozinhos
  function mostrarAviso(mensagem, tipo) {
    fecharAviso();

    const raiz = criarHost(AVISO_ID);
    aviso = raiz.host;
    aviso.style.cssText +=
      "right: 18px; bottom: 18px; max-width: calc(100vw - 36px);";

    raiz.innerHTML = `
      <style>
        ${ESTILO_BASE}
        .aviso {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 16px;
          color: white;
          border-radius: 10px;
          box-shadow: 0 12px 34px rgba(16, 24, 32, 0.22);
          font-size: 13px;
          font-weight: 600;
        }
        .carregando {
          color: #1a2027;
          background: white;
          border: 1px solid #d9e0e6;
          font-weight: 500;
        }
        .ok { background: #0f7a3f; }
        .erro { background: #b42318; }
        .marca {
          flex-shrink: 0;
          font-size: 14px;
          line-height: 1;
        }
      </style>

      <div class="aviso"></div>
    `;

    const caixa = raiz.querySelector(".aviso");
    caixa.classList.add(tipo);

    if (tipo !== "carregando") {
      const marca = document.createElement("span");
      marca.className = "marca";
      marca.textContent = tipo === "ok" ? "✓" : "✕";
      caixa.appendChild(marca);
    }

    const texto = document.createElement("span");
    texto.textContent = mensagem;
    caixa.appendChild(texto);

    // o erro fica mais tempo: costuma ser algo que o usuario precisa ler
    if (tipo !== "carregando") {
      avisoTimer = setTimeout(fecharAviso, tipo === "ok" ? 2200 : 4200);
    }
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // sem permissao de clipboard na pagina: cai para o metodo antigo, que
      // exige um campo de verdade selecionado para o execCommand copiar
    }

    try {
      const area = document.createElement("textarea");
      area.value = texto;
      // fora da tela, mas nao display:none — o que nao renderiza nao seleciona
      area.style.cssText =
        "position: fixed; top: 0; left: -9999px; opacity: 0;";

      (document.body || document.documentElement).appendChild(area);
      area.select();

      const copiou = document.execCommand("copy");
      area.remove();

      return copiou;
    } catch {
      return false;
    }
  }

  chrome.runtime.onMessage.addListener((mensagem) => {
    if (mensagem?.tipo === "iniciarSelecao") iniciarSelecao();
    if (mensagem?.tipo === "capturaPronta") aoPrintPronto();
    // recado de algo que comecou fora da pagina (atalho, menu de contexto)
    if (mensagem?.tipo === "aviso") {
      mostrarAviso(mensagem.texto, mensagem.estilo || "erro");
    }
  });

}
