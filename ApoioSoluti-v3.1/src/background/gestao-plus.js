// GO (o Gestão+, em solutivd.gestao.plus): parceiro, pedidos e o detalhe
// do pedido. É "GO" que aparece na tela; "gestao" segue como identificador
// no código e no nome do arquivo.
//
// API REST comum, autenticada pelo token da aba logada — quem cuida disso e
// o fetchComToken() do sistemas-sessao.js. Aqui so moram as URLs e o
// formato do que volta.

const GESTAO = sistemaPorId("gestao");

// As URLs do Gestão+ filtram por um formato de query proprio
// (filter[0][field]=x&filter[0][type]=eq&filter[0][value]=y), que precisa
// ir codificado. Montar na mao aqui e mais legivel do que uma funcao que
// gera isso para tres chamadas diferentes.
function urlGestao(caminho) {
  return `${GESTAO.origem}${caminho}`;
}

function erroDeSessaoGestao(erro, acao) {
  if (erro.message === "TOKEN_NAO_ENCONTRADO") {
    return { erro: "Sessão não encontrada no GO. Faça login no site." };
  }

  console.error(`Apoio Soluti: Gestão+ (${acao}):`, erro);
  return { erro: `${acao} (${erro.message}).` };
}

// Busca por CPF/CNPJ: primeiro o parceiro (para ter o id), depois as
// vendas dele. Duas chamadas porque a API nao aceita filtrar movimentacao
// por documento do parceiro.
async function buscarHistoricoGestaoPlus(cpfCnpj) {
  if (!cpfCnpj) return { erro: "Digite o CPF ou CNPJ." };

  try {
    const respParceiro = await fetchComToken(
      GESTAO,
      urlGestao(
        "/parceiro?filter%5B0%5D%5Bfield%5D=cpfCnpj&filter%5B0%5D%5Btype%5D=eq" +
        `&filter%5B0%5D%5Bvalue%5D=${encodeURIComponent(cpfCnpj)}&page=1&pageSize=25`
      )
    );

    if (!respParceiro.ok) {
      return { erro: `Erro ao buscar parceiro (HTTP ${respParceiro.status})` };
    }

    const jsonParceiro = await respParceiro.json();
    const listaParceiro = extrairLista(jsonParceiro);

    // "bruto" so viaja quando a lista vem vazia: sem ele, um formato de
    // resposta novo vira "nenhum parceiro encontrado" e ninguem descobre
    if (!listaParceiro.length) {
      return {
        erro: "Nenhum parceiro encontrado com esse CPF/CNPJ.",
        bruto: JSON.stringify(jsonParceiro).slice(0, 4000)
      };
    }

    const parceiro = listaParceiro[0];

    // tipo V = venda; status 0 e 1 = em aberto e faturada
    const respMov = await fetchComToken(
      GESTAO,
      urlGestao(
        "/movimentacao?filter%5B0%5D%5Bfield%5D=tipo&filter%5B0%5D%5Btype%5D=eq&filter%5B0%5D%5Bvalue%5D=V" +
        "&filter%5B1%5D%5Bfield%5D=status&filter%5B1%5D%5Btype%5D=in&filter%5B1%5D%5Bvalues%5D%5B0%5D=0&filter%5B1%5D%5Bvalues%5D%5B1%5D=1" +
        `&filter%5B2%5D%5Bfield%5D=parceiro&filter%5B2%5D%5Btype%5D=eq&filter%5B2%5D%5Bvalue%5D=${parceiro.id}` +
        "&order-by%5B0%5D%5Btype%5D=field&order-by%5B0%5D%5Bfield%5D=id&order-by%5B0%5D%5Bdirection%5D=desc&pageSize=25"
      )
    );

    if (!respMov.ok) {
      return { erro: `Erro ao buscar movimentações (HTTP ${respMov.status})`, parceiro };
    }

    const jsonMov = await respMov.json();
    const movimentacoes = extrairLista(jsonMov);

    return {
      ok: true,
      parceiro,
      movimentacoes,
      bruto: movimentacoes.length ? undefined : JSON.stringify(jsonMov).slice(0, 4000)
    };
  } catch (erro) {
    return erroDeSessaoGestao(erro, "Falha no GO");
  }
}

// Busca pelo numero do pedido, sem passar pelo parceiro. O "like %codigo"
// existe porque o atendente costuma receber so o final do codigo.
// Status 0, 1 e 2: aqui entram tambem os cancelados, que sao justamente os
// que geram duvida no atendimento.
async function buscarPedidoPorCodigoGestaoPlus(codigo) {
  if (!codigo) return { erro: "Digite o número do pedido." };

  try {
    const resposta = await fetchComToken(
      GESTAO,
      urlGestao(
        "/movimentacao?filter%5B0%5D%5Bfield%5D=codigo&filter%5B0%5D%5Btype%5D=like" +
        `&filter%5B0%5D%5Bvalue%5D=${encodeURIComponent("%" + codigo)}` +
        "&filter%5B1%5D%5Bfield%5D=tipo&filter%5B1%5D%5Btype%5D=eq&filter%5B1%5D%5Bvalue%5D=V" +
        "&filter%5B2%5D%5Bfield%5D=status&filter%5B2%5D%5Btype%5D=in&filter%5B2%5D%5Bvalues%5D%5B0%5D=0" +
        "&filter%5B2%5D%5Bvalues%5D%5B1%5D=1&filter%5B2%5D%5Bvalues%5D%5B2%5D=2" +
        "&order-by%5B0%5D%5Btype%5D=field&order-by%5B0%5D%5Bfield%5D=id&order-by%5B0%5D%5Bdirection%5D=desc&pageSize=25"
      )
    );

    if (!resposta.ok) {
      return { erro: `Erro na busca por código (HTTP ${resposta.status})` };
    }

    const movimentacoes = extrairLista(await resposta.json());

    if (!movimentacoes.length) {
      return { erro: "Nenhum pedido encontrado com esse número.", movimentacoes: [] };
    }

    return { ok: true, movimentacoes };
  } catch (erro) {
    return erroDeSessaoGestao(erro, "Falha ao buscar por código");
  }
}

// Detalhe do pedido: cabecalho, itens e historico vem em tres endpoints.
// Itens e historico sao acessorios — se um deles falhar, o pedido ainda e
// util, entao a falha vira lista vazia em vez de erro.
async function buscarPedidoGestaoPlus(movimentacaoId) {
  if (!movimentacaoId) return { erro: "Pedido inválido." };

  try {
    const respPedido = await fetchComToken(GESTAO, urlGestao(`/movimentacao/${movimentacaoId}`));

    if (!respPedido.ok) {
      return { erro: `Erro ao buscar pedido (HTTP ${respPedido.status})` };
    }

    const pedido = await respPedido.json();

    const respItens = await fetchComToken(
      GESTAO,
      urlGestao(
        "/movimentacao-item?filter%5B0%5D%5Bfield%5D=movimentacao&filter%5B0%5D%5Btype%5D=eq" +
        `&filter%5B0%5D%5Bvalue%5D=${movimentacaoId}&pageSize=999`
      )
    );
    const itens = respItens.ok ? extrairLista(await respItens.json()) : [];

    const respHistorico = await fetchComToken(
      GESTAO,
      urlGestao(
        "/movimentacao-historico?filter%5B0%5D%5Bfield%5D=movimentacao&filter%5B0%5D%5Btype%5D=eq" +
        `&filter%5B0%5D%5Bvalue%5D=${movimentacaoId}&pageSize=999`
      )
    );
    const historico = respHistorico.ok ? extrairLista(await respHistorico.json()) : [];

    return { ok: true, pedido, itens, historico };
  } catch (erro) {
    return erroDeSessaoGestao(erro, "Falha ao buscar pedido");
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarHistoricoGestaoPlus") {
    buscarHistoricoGestaoPlus(limparDocumento(mensagem.cpfCnpj))
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }

  if (mensagem?.tipo === "buscarPedidoPorCodigoGestaoPlus") {
    buscarPedidoPorCodigoGestaoPlus(limparCodigo(mensagem.codigo))
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }

  if (mensagem?.tipo === "buscarPedidoGestaoPlus") {
    buscarPedidoGestaoPlus(mensagem.movimentacaoId)
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});
