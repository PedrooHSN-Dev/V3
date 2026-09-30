// Wings: assinatura, autenticacoes e o perfil completo do usuario.
//
// A tela fica em wingsportal.com.br, mas a API e outro endereco
// (billing.vaultid.com.br) — o token vem da aba do portal e vale nos dois.

const WINGS = sistemaPorId("wings");

const WINGS_API = "https://billing.vaultid.com.br";

async function buscarWings(documento) {
  if (!documento) return { erro: "Digite o CPF ou CNPJ." };

  try {
    const respRetail = await fetchComToken(
      WINGS,
      `${WINGS_API}/user-retail?page=1&search=${encodeURIComponent(documento)}`
    );

    if (!respRetail.ok) {
      return { erro: `Erro ao consultar o Wings (USER_RETAIL_HTTP_${respRetail.status}).` };
    }

    const listaRetail = extrairLista(await respRetail.json());
    if (!listaRetail.length) {
      return { erro: "Nenhum usuário encontrado com esse CPF/CNPJ." };
    }

    const userRetail = listaRetail[0];

    // O deep-detail e o perfil completo (usuario, validade, emissoes e os
    // ultimos eventos). E acessorio: sem ele a tela ainda mostra assinatura
    // e autenticacoes, entao a falha vira "brutoDeep" em vez de erro.
    const respDeep = await fetchComToken(
      WINGS,
      `${WINGS_API}/user-deep-detail/${encodeURIComponent(documento)}?events=10`
    );

    let deepDetail = null;
    let brutoDeep;

    if (respDeep.ok) {
      const jsonDeep = await respDeep.json();
      deepDetail = jsonDeep?.bird || null;
      if (!deepDetail) brutoDeep = JSON.stringify(jsonDeep).slice(0, 4000);
    } else {
      brutoDeep = `DEEP_DETAIL_HTTP_${respDeep.status}`;
    }

    return { ok: true, userRetail, deepDetail, brutoDeep };
  } catch (erro) {
    if (erro.message === "TOKEN_NAO_ENCONTRADO") {
      return { erro: "Sessão não encontrada no Wings. Faça login no portal." };
    }

    console.error("Apoio Soluti: erro ao buscar no Wings:", erro);
    return { erro: `Não foi possível buscar no Wings (${erro.message}).` };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarWings") {
    buscarWings(limparDocumento(mensagem.cpfCnpj))
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});
