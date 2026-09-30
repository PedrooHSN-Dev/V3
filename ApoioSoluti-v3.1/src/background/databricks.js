// Databricks: solicitacoes do cliente, por CPF/CNPJ.
//
// O painel e um app Streamlit, e Streamlit nao tem API: a pagina fala com o
// servidor por um WebSocket em protobuf, e o resultado volta como uma
// tabela Apache Arrow.
//
// O caminho honesto seria abrir o app numa aba e preencher os campos. Isso
// custa uma aba visivel, o carregamento inteiro do Streamlit e alguns
// segundos por busca. Em vez disso, a extensao fala o mesmo protocolo:
// abre o WebSocket, diz quais widgets receberam quais valores e le a
// tabela que volta.
//
// O PRECO DISSO: os quatro ids de widget abaixo sao gerados pelo Streamlit
// a partir do codigo do app. Se alguem mexer no painel — trocar a ordem dos
// campos, renomear, acrescentar um — os ids mudam e a busca para de
// responder. Quando isso acontecer, os ids novos aparecem no trafego
// WebSocket do proprio painel (DevTools > Network > _stcore/stream).

const DATABRICKS_URL =
  "wss://data-app-609763180630129.9.azure.databricksapps.com/_stcore/stream";

const DATABRICKS_WIDGETS = {
  tipoDocumento: "$$ID-ed08728521ac97b9c787b6458fe5c32d-None",
  documento: "$$ID-9bf7704f81035a0c1dd5869e9f15e337-None",
  periodo: "$$ID-f7ba3404bc21064042376b1db44d38ce-None",
  botaoBuscar: "$$ID-57751a2638b17770b1019ed6ba02d751-None"
};

// opcoes do painel, pelo indice que o radio/select usa la
const DATABRICKS_TIPO_CNPJ = 4;
const DATABRICKS_PERIODO_5_ANOS = 8;

// desiste antes que o popup pareca travado; o painel costuma responder em
// 2-4 segundos
const DATABRICKS_TIMEOUT = 15000;

/* Protobuf na mao ----------------------------------------------------
   Sao tres tipos de campo e quatro widgets: uma biblioteca de protobuf
   inteira (mais o .proto do Streamlit) para montar 60 bytes seria mais
   codigo para manter do que estas quatro funcoes.
   ------------------------------------------------------------------ */

function protoVarint(valor) {
  const bytes = [];

  while (valor > 127) {
    bytes.push((valor & 0x7f) | 0x80);
    valor >>>= 7;
  }

  bytes.push(valor);
  return bytes;
}

function protoTexto(texto) {
  const bytes = new TextEncoder().encode(texto);
  return [...protoVarint(bytes.length), ...bytes];
}

// WidgetState: campo 1 = id, e depois o valor, num campo que depende do
// tipo do widget (5 = int, 6 = string, 2 = trigger/botao)
function protoWidgetState(id, tipo, valor) {
  const idBytes = [0x0a, ...protoTexto(id)];

  let valorBytes = [];
  if (tipo === "int") valorBytes = [0x28, ...protoVarint(valor)];
  else if (tipo === "string") valorBytes = [0x32, ...protoTexto(valor)];
  else if (tipo === "trigger") valorBytes = [0x10, valor ? 1 : 0];

  const conteudo = [...idBytes, ...valorBytes];
  return [0x0a, ...protoVarint(conteudo.length), ...conteudo];
}

// BackMsg.rerun_script: "estes widgets mudaram, roda o app de novo"
function montarBackMsg(sessionId, documento) {
  const widgets = [
    ...protoWidgetState(DATABRICKS_WIDGETS.tipoDocumento, "int", DATABRICKS_TIPO_CNPJ),
    ...protoWidgetState(DATABRICKS_WIDGETS.documento, "string", documento),
    ...protoWidgetState(DATABRICKS_WIDGETS.periodo, "int", DATABRICKS_PERIODO_5_ANOS),
    ...protoWidgetState(DATABRICKS_WIDGETS.botaoBuscar, "trigger", 1)
  ];

  const rerunScript = [
    0x0a, 0x00,                                                   // 1: query string vazia
    0x12, ...protoVarint(widgets.length), ...widgets,             // 2: widget_states
    0x1a, ...protoTexto(sessionId),                               // 3: page_script_hash
    0x22, 0x00,                                                   // 4: page_name vazio
    0x2a, 0x00                                                    // 5: fragment_id vazio
  ];

  // 11 (rerun_script) << 3 | 2 (delimitado) = 0x5A
  return new Uint8Array([0x5a, ...protoVarint(rerunScript.length), ...rerunScript]);
}

/* A conversa --------------------------------------------------------- */

// Converte a tabela Arrow em objetos simples. BigInt e Date nao atravessam
// o sendMessage (a serializacao do Chrome nao aceita BigInt), entao viram
// texto aqui mesmo.
function tabelaParaObjetos(buffer) {
  return Arrow.tableFromIPC(buffer).toArray().map((linha) => {
    const objeto = linha.toJSON();

    for (const chave of Object.keys(objeto)) {
      const valor = objeto[chave];
      if (valor === null) continue;

      if (typeof valor === "bigint") objeto[chave] = valor.toString();
      else if (valor instanceof Date) objeto[chave] = valor.toLocaleString("pt-BR");
    }

    return objeto;
  });
}

// O Arrow IPC comeca com o marcador de continuacao 0xFFFFFFFF, e o
// Streamlit manda a tabela no meio de uma mensagem maior: achar o marcador
// e o jeito de saber onde a tabela comeca.
function inicioDaTabelaArrow(bytes) {
  for (let i = 0; i < bytes.length - 4; i++) {
    if (
      bytes[i] === 0xff &&
      bytes[i + 1] === 0xff &&
      bytes[i + 2] === 0xff &&
      bytes[i + 3] === 0xff
    ) {
      return i;
    }
  }

  return -1;
}

function buscarDatabricks(cpfCnpj) {
  const documento = limparDocumento(cpfCnpj);
  if (!documento) return Promise.resolve({ erro: "Digite o CPF ou CNPJ." });

  return new Promise((resolve) => {
    const ws = new WebSocket(DATABRICKS_URL, ["streamlit"]);
    ws.binaryType = "arraybuffer";

    let sessionId = null;
    let terminou = false;

    function encerrar(resultado) {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(resultado);
    }

    const timer = setTimeout(
      () => encerrar({ erro: "Tempo esgotado aguardando o Databricks." }),
      DATABRICKS_TIMEOUT
    );

    // BackMsg vazio, em base64: acorda o servidor e faz ele devolver a
    // sessao. E sempre o mesmo, entao vai literal.
    ws.onopen = () => {
      ws.send(Uint8Array.from(atob("WggKABIAGgAiAA=="), (c) => c.charCodeAt(0)));
    };

    ws.onmessage = (evento) => {
      if (typeof evento.data === "string") return;

      const bytes = new Uint8Array(evento.data);

      // 1o passo: a primeira resposta traz o id da sessao (32 hex) em meio
      // ao protobuf. Com ele em maos, manda os valores dos campos.
      if (!sessionId) {
        const encontrado = new TextDecoder().decode(bytes).match(/[a-f0-9]{32}/);
        if (encontrado) {
          sessionId = encontrado[0];
          ws.send(montarBackMsg(sessionId, documento));
        }
        return;
      }

      // 2o passo: entre as mensagens de redesenho, a que tem a tabela
      const inicio = inicioDaTabelaArrow(bytes);
      if (inicio === -1) return;

      try {
        encerrar({ ok: true, dados: tabelaParaObjetos(bytes.slice(inicio)) });
      } catch (erro) {
        console.error("Apoio Soluti: tabela do Databricks ilegível:", erro);
        encerrar({ erro: `Falha ao extrair tabela do Databricks (${erro.message}).` });
      }
    };

    ws.onerror = () => encerrar({ erro: "Erro na conexão WebSocket com o Databricks." });

    ws.onclose = () => encerrar({ erro: "A conexão com o Databricks foi encerrada." });
  });
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarDatabricks") {
    buscarDatabricks(mensagem.cpfCnpj)
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});
