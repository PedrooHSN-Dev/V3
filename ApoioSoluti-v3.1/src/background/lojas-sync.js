const URL_LOJAS = "https://soluti.com.br/lojas/";
const ALARME_LOJAS = "atualizar-lojas";

const UF_POR_REGIAO = {
  "goiânia": "GO", "aparecida de goiânia": "GO", "inhumas": "GO", "goiás": "GO",
  "sergipe": "SE", "mato grosso do sul": "MS", "brasília": "DF", "ceará": "CE",
  "salvador": "BA", "bahia": "BA", "pernambuco": "PE", "rio grande do norte": "RN",
  "piauí": "PI", "pará": "PA", "amazonas": "AM", "são paulo": "SP",
  "rio de janeiro": "RJ", "curitiba": "PR", "paraná": "PR",
  "belo horizonte": "MG", "contagem": "MG", "minas gerais": "MG"
};

function ufDaRegiao(regiao) {
  return UF_POR_REGIAO[(regiao || "").trim().toLowerCase()] || "";
}

function decodificarHtml(texto) {
  return (texto || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .replace(/&ordm;/g, "º")
    .replace(/&ordf;/g, "ª")
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú").replace(/&atilde;/g, "ã")
    .replace(/&otilde;/g, "õ").replace(/&ccedil;/g, "ç")
    .replace(/&acirc;/g, "â").replace(/&ecirc;/g, "ê")
    .replace(/&ocirc;/g, "ô").replace(/&agrave;/g, "à")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extrai as lojas do HTML. A pagina lista cada loja como um cartao com o
// nome num <h2>, seguido de endereco, rotulos de horario e link do Maps.
function extrairLojas(html) {
  const lojas = [];

  // remove blocos de estilo e script: o CSS inline do Elementor tem <h2>
  // no seletor e estava sendo confundido com cartao de loja
  const limpo = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");

  // isola o miolo da pagina (evita cabecalho/rodape) pelo titulo da secao
  const inicio = limpo.indexOf("sempre perto");
  const fim = limpo.lastIndexOf("Últimos dias");
  const trecho =
    inicio >= 0 ? limpo.slice(inicio, fim > inicio ? fim : undefined) : limpo;

  // cada loja tem um <h2> com o nome; parte o texto por esses marcadores.
  // partes[i] e o texto que vem ANTES do <h2> do bloco i: e la que mora a
  // regiao, por isso guardamos a divisao inteira em vez de so os blocos.
  const partes = trecho.split(/<h2[^>]*>/i);
  const blocos = partes.slice(1);

  for (let i = 0; i < blocos.length; i++) {
    const bruto = blocos[i];

    // o nome vai ate o fim do h2. Blocos sem nome nunca viram loja; os
    // demais sao peneirados no final, pela exigencia de link do Maps +
    // rotulo de horario
    const nome = decodificarHtml(bruto.split(/<\/h2>/i)[0]);
    if (!nome) continue;

    const corpo = bruto.slice(bruto.indexOf("</h2>") + 5);

    // texto limpo do corpo, preservando quebras por paragrafo
    const paragrafos = corpo
      .split(/<\/?(?:p|div|span|br|a)[^>]*>/i)
      .map((p) => decodificarHtml(p))
      .filter(Boolean);

    const maps =
      (corpo.match(
        /https?:\/\/(?:goo\.gl\/maps|maps\.app\.goo\.gl|share\.google)\/[^\s"'<)]+/i
      ) || [])[0] || "";

    const email =
      (corpo.match(/[a-z0-9._%+-]+@soluti\.com\.br/i) || [])[0] || "";

    const fechado = /temporariamente fechado/i.test(corpo);

    // endereco = primeiros paragrafos ate "Horário de funcionamento"
    const idxFunc = paragrafos.findIndex((p) =>
      /horário de funcionamento/i.test(p)
    );
    const idxAlmoco = paragrafos.findIndex((p) =>
      /horário de almoço/i.test(p)
    );

    const endParts =
      idxFunc > 0 ? paragrafos.slice(0, idxFunc) : paragrafos.slice(0, 1);
    const end = endParts
      .filter((p) => !/^loja|localização/i.test(p))
      .join(" ")
      .trim();

    let func = "";
    if (idxFunc >= 0) {
      const ate = idxAlmoco > idxFunc ? idxAlmoco : paragrafos.length;
      for (const p of paragrafos.slice(idxFunc + 1, ate)) {
        if (/temporariamente fechado/i.test(p)) continue;
        if (/\d|não fecha/i.test(p)) {
          func = p;
          break;
        }
        break;
      }
    }

    let almoco = "";
    if (idxAlmoco >= 0) {
      // pega apenas o primeiro paragrafo apos "Horário de almoço":
      // e o valor do horario. Os seguintes ja pertencem ao proximo bloco
      // ou sao email/localizacao.
      for (const p of paragrafos.slice(idxAlmoco + 1)) {
        if (/@soluti|localização|temporariamente/i.test(p)) continue;
        // um horario tem digitos ou "não fecha"; regiao/nome nao
        if (/\d|não fecha/i.test(p)) {
          almoco = p;
          break;
        }
        // se chegou num texto sem digito (proxima regiao), para
        break;
      }
    }

    // regiao: no HTML ela aparece logo antes do <h2>, ou seja, no fim de
    // partes[i]. E o ultimo texto curto daquele trecho.
    const limpos = (partes[i] || "")
      .split(/<\/?(?:p|div|span|br|a|h3)[^>]*>/i)
      .map((p) => decodificarHtml(p))
      .filter(Boolean);
    const regiao =
      [...limpos].reverse().find((t) => t.length > 1 && t.length < 40) || "";

    lojas.push({
      loja: nome,
      regiao,
      uf: ufDaRegiao(regiao),
      end,
      func,
      almoco,
      email,
      fechado,
      maps
    });
  }

  // corrige o caso Aracaju/Sergipe (nome e regiao trocados na origem)
  for (const l of lojas) {
    if (/^sergipe$/i.test(l.loja) && /aracaju/i.test(l.regiao)) {
      [l.loja, l.regiao] = [l.regiao, l.loja];
      l.uf = ufDaRegiao(l.regiao);
    }
  }

  // so aceita blocos que sejam loja de verdade: precisam ter link do Maps
  // e ao menos o rotulo de horario. Isso descarta o cabecalho da secao e
  // qualquer CSS/script residual.
  return lojas.filter((l) => l.loja && l.maps && (l.func || l.almoco));
}

async function atualizarLojas() {
  const resposta = await fetch(URL_LOJAS, {
    headers: { "Accept": "text/html" },
    credentials: "omit"
  });

  if (!resposta.ok) {
    throw new Error(`A página respondeu ${resposta.status}.`);
  }

  const html = await resposta.text();
  const lojas = extrairLojas(html);

  if (lojas.length < 5) {
    throw new Error("A extração não encontrou lojas suficientes.");
  }

  await chrome.storage.local.set({
    lojas,
    lojasAtualizadoEm: Date.now()
  });

  return { ok: true, quantidade: lojas.length };
}

// So cria se ainda nao existir. Um create() com nome repetido SUBSTITUI o
// alarme anterior, e este arquivo roda inteiro a cada vez que o service
// worker acorda (clique de menu, mensagem, captura...). Criar direto fazia
// o relogio voltar para "daqui a 1 minuto" o tempo todo, e a atualizacao
// diaria virava dezenas de buscas por dia no site da Soluti.
chrome.alarms.get(ALARME_LOJAS, (existente) => {
  if (existente) return;

  chrome.alarms.create(ALARME_LOJAS, {
    delayInMinutes: 1,
    periodInMinutes: 60 * 24
  });
});

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_LOJAS) {
    atualizarLojas().catch((erro) =>
      console.warn("Apoio Soluti: falha ao atualizar lojas:", erro.message)
    );
  }
});

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "atualizarLojas") {
    atualizarLojas()
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

