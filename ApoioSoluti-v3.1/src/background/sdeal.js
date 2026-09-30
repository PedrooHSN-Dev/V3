// S.Deal (sdeal.soluti.com.br): busca de voucher.
//
// Sistema legado, sem API: a tela e montada por uma sequencia de
// requisicoes que abrem o formulario, filtram o grid e so entao executam a
// regra "Pesquisar voucher". A resposta nao e JSON, e JavaScript — uma
// lista de chamadas ebfFormChangeComponentValue() que preenchem os campos.
//
// Por isso a sequencia inteira roda aqui, e nao numa aba: o fetch do
// service worker leva os cookies de sessao com credentials: "include", e o
// atendente nao ve nada piscar na tela.

const SDEAL_BASE = "https://sdeal.soluti.com.br/GVS";
const SDEAL_GUID = "{B88CD30B-9E3E-433A-8D40-ED95AEC9CD3E}";
const SDEAL_FORM_ID = "464569235";

// o id do campo de busca no formulario do S.Deal; aparece na URL do grid e
// de novo no corpo do executeRule
const SDEAL_CAMPO_VOUCHER = "818663";

const SDEAL_CABECALHOS = {
  accept: "*/*",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8"
};

// "ebfFormChangeComponentValue('form','campo', valor);" — valor vem como
// string entre aspas, como new Date(...) ou vazio
const RE_CAMPO_SDEAL = /ebfFormChangeComponentValue\('[^']+','([^']+)',\s*(.*?)\);/g;

function interpretarValorSDeal(bruto) {
  const valor = bruto.trim();

  if (valor.startsWith("'") && valor.endsWith("'")) {
    return valor.slice(1, -1);
  }

  if (/^new Date\(/.test(valor)) {
    const numeros = valor.match(/-?\d+/g);

    // new Date(ano, mes, dia): o mes do JavaScript comeca em zero, e a tela
    // mostra o numero do mes como gente le
    if (numeros && numeros.length >= 3) {
      return {
        __data: true,
        ano: Number(numeros[0]),
        mes: Number(numeros[1]) + 1,
        dia: Number(numeros[2])
      };
    }
  }

  return valor === "" ? "" : valor;
}

async function buscarVoucherSDeal(numeroVoucher) {
  if (!numeroVoucher) return { erro: "Digite o número do voucher." };

  try {
    // As tres primeiras chamadas nao devolvem nada de util: elas deixam a
    // sessao no estado que o executeRule espera (formulario aberto, grid
    // filtrado). Pular qualquer uma faz a ultima responder vazio.
    await fetch(
      `${SDEAL_BASE}/wfrcore?action=ruleopenform&sys=GVS&guid=${encodeURIComponent(SDEAL_GUID)}`,
      { headers: SDEAL_CABECALHOS, credentials: "include" }
    );

    await fetch(
      `${SDEAL_BASE}/form.do?sys=GVS&formID=${SDEAL_FORM_ID}&param=include&align=0&filter=&goto=0&WFRInput${SDEAL_CAMPO_VOUCHER}=`,
      { headers: SDEAL_CABECALHOS, credentials: "include" }
    );

    await fetch(
      `${SDEAL_BASE}/gridEdit.do?sys=GVS&action=gridEdit&param=refresh&formID=${SDEAL_FORM_ID}` +
      `&comID=821586&gridComID=-1&gt=-1&WFRInput${SDEAL_CAMPO_VOUCHER}=${encodeURIComponent(numeroVoucher)}`,
      { headers: SDEAL_CABECALHOS, credentials: "include" }
    );

    const corpo = new URLSearchParams({
      action: "executeRule",
      pType: "2",
      ruleName: "Pesquisar voucher",
      sys: "GVS",
      formID: SDEAL_FORM_ID,
      [`F_1_${SDEAL_CAMPO_VOUCHER}`]: numeroVoucher
    });

    const resposta = await fetch(`${SDEAL_BASE}/executeRule.do`, {
      method: "POST",
      headers: {
        ...SDEAL_CABECALHOS,
        accept: "application/javascript,*/*;q=0.9",
        "content-type": "application/x-www-form-urlencoded"
      },
      credentials: "include",
      body: corpo.toString()
    });

    // sessao expirada nao devolve erro: devolve a tela de login
    if (resposta.url && resposta.url.includes("login")) {
      return { erro: "Sessão expirada. Faça login no site do S.Deal e tente novamente." };
    }

    const texto = await resposta.text();
    const dados = {};

    let campo;
    while ((campo = RE_CAMPO_SDEAL.exec(texto)) !== null) {
      dados[campo[1]] = interpretarValorSDeal(campo[2]);
    }

    if (!Object.keys(dados).length) {
      return { erro: "Não veio nenhum dado do S.Deal. Confirme se você está logado." };
    }

    // voucher inexistente: o S.Deal devolve o formulario inteiro, so que
    // com todos os campos em branco
    if (!Object.values(dados).some((valor) => valor !== "")) {
      return { erro: "Nenhum voucher encontrado com esse número." };
    }

    return { ok: true, dados };
  } catch (erro) {
    console.error("Apoio Soluti: erro ao buscar voucher no S.Deal:", erro);
    return { erro: "Erro de conexão ao buscar o voucher. Confirme se você está logado no S.Deal." };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarVoucherSDeal") {
    buscarVoucherSDeal(limparCodigo(mensagem.voucher))
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});
