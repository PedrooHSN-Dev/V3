// Acesso aos sistemas que exigem login (S.Deal, Gestão+ e Wings).
//
// A extensao nao guarda senha nem faz login: ela se pendura na sessao que o
// atendente ja tem aberta no navegador. Sao dois jeitos, e os dois moram
// aqui porque Gestão+ e Wings usam exatamente o mesmo mecanismo:
//
//   - cookie de sessao (S.Deal): basta o fetch levar credentials: "include"
//   - token no storage da pagina (Gestão+, Wings): precisa ser lido de uma
//     aba do sistema e mandado no cabecalho Authorization

/* Token da aba logada ----------------------------------------------- */

function aguardarAbaPronta(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let terminou = false;

    const timer = setTimeout(() => {
      if (terminou) return;
      terminou = true;
      chrome.tabs.onUpdated.removeListener(ouvinte);
      reject(new Error("A página demorou demais para carregar."));
    }, timeoutMs);

    function paginaValida(aba) {
      return Boolean(
        aba &&
        aba.status === "complete" &&
        aba.url &&
        !aba.url.startsWith("about:") &&
        !aba.url.startsWith("chrome:") &&
        !aba.url.startsWith("chrome-error:")
      );
    }

    function finalizar() {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(ouvinte);

      // "complete" e o fim do HTML, nao o fim do app: as telas do Gestão+ e
      // do Wings gravam o token logo depois de montar. A folga evita ler o
      // storage no instante em que ele ainda esta vazio.
      setTimeout(resolve, 400);
    }

    function ouvinte(id, info, aba) {
      if (id === tabId && info.status === "complete" && paginaValida(aba)) {
        finalizar();
      }
    }

    chrome.tabs.onUpdated.addListener(ouvinte);

    // a aba pode ter terminado de carregar antes do ouvinte entrar
    chrome.tabs.get(tabId).then((aba) => {
      if (paginaValida(aba)) finalizar();
    }).catch(() => {});
  });
}

// Roda DENTRO da aba do sistema (chrome.scripting), entao nao pode usar
// nada daqui de fora. Procura o token por formato e por nome de chave, em
// vez de um caminho fixo: cada sistema guarda o seu de um jeito, e os dois
// ja mudaram de lugar pelo menos uma vez.
function extrairTokenDoStorage() {
  const candidatos = [];
  const reTokenCru = /^[a-f0-9]{30,64}$/i;

  function procurarEmObjeto(obj, profundidade) {
    if (!obj || typeof obj !== "object" || profundidade > 4) return;

    for (const chave of Object.keys(obj)) {
      const valor = obj[chave];

      if (typeof valor === "string" && /token/i.test(chave) && valor.length > 15) {
        candidatos.push(valor);
      } else if (valor && typeof valor === "object") {
        procurarEmObjeto(valor, profundidade + 1);
      }
    }
  }

  function vasculhar(valorBruto) {
    if (typeof valorBruto !== "string" || !valorBruto) return;
    if (reTokenCru.test(valorBruto)) return candidatos.push(valorBruto);

    try {
      procurarEmObjeto(JSON.parse(valorBruto), 0);
    } catch {
      // valor que nao e JSON: nao ha o que vasculhar
    }
  }

  for (const armazenamento of [localStorage, sessionStorage]) {
    for (let i = 0; i < armazenamento.length; i++) {
      vasculhar(armazenamento.getItem(armazenamento.key(i)));
    }
  }

  return candidatos[0] || null;
}

async function lerTokenDaAba(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extrairTokenDoStorage
  });

  return result || null;
}

// Tres tentativas, da mais barata para a mais cara: memoria, aba que o
// atendente ja tem aberta, e por ultimo uma aba em segundo plano — que so
// costuma acontecer uma vez por sessao do navegador.
async function obterToken(sistema) {
  const cache = await chrome.storage.session.get(sistema.chave);
  if (cache[sistema.chave]) return cache[sistema.chave];

  const abertas = await chrome.tabs.query({ url: `${sistema.origem}/*` });

  if (abertas.length > 0) {
    const token = await lerTokenDaAba(abertas[0].id);
    if (token) {
      await chrome.storage.session.set({ [sistema.chave]: token });
      return token;
    }
  }

  const novaAba = await chrome.tabs.create({ url: sistema.urlInicial, active: false });
  await aguardarAbaPronta(novaAba.id);

  const token = await lerTokenDaAba(novaAba.id);
  chrome.tabs.remove(novaAba.id).catch(() => {});

  if (token) {
    await chrome.storage.session.set({ [sistema.chave]: token });
    return token;
  }

  return null;
}

// Quem chama trata TOKEN_NAO_ENCONTRADO como "faca login no site": e a
// unica falha aqui que o atendente consegue resolver.
async function fetchComToken(sistema, url) {
  let token = await obterToken(sistema);
  if (!token) throw new Error("TOKEN_NAO_ENCONTRADO");

  const headers = {
    accept: "application/json, text/plain, */*",
    authorization: `Bearer ${token}`
  };

  let resposta = await fetch(url, { headers, credentials: "include" });

  // 401 com token em maos = token velho na memoria. Descarta e le de novo
  // da aba; so entao desiste.
  if (resposta.status === 401) {
    await chrome.storage.session.remove(sistema.chave);

    token = await obterToken(sistema);
    if (!token) throw new Error("TOKEN_NAO_ENCONTRADO");

    headers.authorization = `Bearer ${token}`;
    resposta = await fetch(url, { headers, credentials: "include" });
  }

  return resposta;
}

// Gestão+ e Wings respondem ora um array puro, ora HAL (_embedded), ora um
// envelope com nome proprio. Uma funcao so cobre os tres.
function extrairLista(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];

  if (json._embedded && typeof json._embedded === "object") {
    for (const chave of Object.keys(json._embedded)) {
      if (Array.isArray(json._embedded[chave])) return json._embedded[chave];
    }
  }

  return json.data || json.items || json.rows || json.result || json.records || [];
}

/* Indicador de sessao ------------------------------------------------
   O ponto verde na aba. Olhar o cookie responde "ha sessao?" sem gastar
   uma busca de verdade — e sem abrir aba nenhuma.
   ------------------------------------------------------------------ */

// Quem tem cookie na tabela pode ser checado; o resto nem aparece na
// resposta, e quem pergunta trata a ausencia como "nao sei".
async function verificarSessoes() {
  const entradas = await Promise.all(
    SISTEMAS.filter((sistema) => sistema.cookie).map(async (sistema) => {
      // um sistema pode atender por mais de um domínio (o Outlook atende
      // por quatro): basta UM deles ter cookie para haver sessão
      const dominios = [].concat(sistema.cookie);

      try {
        for (const dominio of dominios) {
          const cookies = await chrome.cookies.getAll({ domain: dominio });
          if (cookies.length > 0) return [sistema.id, true];
        }
        return [sistema.id, false];
      } catch {
        return [sistema.id, false];
      }
    })
  );

  return Object.fromEntries(entradas);
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "verificarSessoes") {
    verificarSessoes().then(responder).catch(() => responder({}));
    return true;
  }
});
