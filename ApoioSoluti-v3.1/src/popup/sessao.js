// Guarda o estado do popup de uma abertura para a outra.
//
// O popup fecha a cada clique fora, e nao ha como impedir: quem decide isso
// e o navegador. Sem este arquivo, cada fechada apagava a aba aberta e o que
// estava digitado — e o atendente redigitava so para voltar ao que ja tinha.
//
// ONDE MORA: chrome.storage.session, de proposito. Ele vive na memoria do
// navegador e some quando o navegador fecha; NADA daqui toca o disco.
// O que fica guardado aponta para cliente — codigo de solicitacao, o termo
// que estava sendo buscado — e nao tem por que sobreviver ao dia nem ficar
// no disco de uma maquina que pode ser compartilhada ou perdida.
// Se algum dia isso mudar para storage.local, passa a ser preciso um prazo
// de validade e um botao de limpar visivel.
//
// DUAS TELAS AO MESMO TEMPO: o popup e a janela destacada dividem a mesma
// chave, e a ultima a escrever vence. E aceitavel porque isto e
// conveniencia, nao fonte da verdade: nenhuma decisao da extensao depende
// do que esta guardado aqui, e o pior caso e reabrir numa aba diferente da
// esperada.

const CHAVE_SESSAO = "estadoPopup";

// Campos de texto cujo conteudo volta ao reabrir. Os campos que a tela cria
// na hora (os {marcadores} do modelo de e-mail) ficam de fora: eles so
// existem depois que o modelo e escolhido, e restaurar valor em campo que
// ainda nao nasceu daria mais codigo do que vale.
const CAMPOS_GUARDADOS = [
  "busca",
  "codigoSolicitacao",
  "documentoDatabricks",
  "codigoVoucherSDeal",
  "documentoGestao",
  "numeroPedidoGestao",
  "documentoWings",
  "buscaLoja",
  "filtroUf",
  "buscaParceiro",
  "destinatarioEmail"
];

// Junta as gravacoes de uma rajada numa so: digitar dispara um "input" por
// tecla, e nao ha motivo para gravar sete vezes numa palavra.
const ESPERA_GRAVACAO = 400;

let gravacaoAgendada = null;

// Enquanto a restauracao acontece ela mesma dispara eventos de input e
// click. Sem esta trava, o estado seria regravado no meio de ser lido.
let restaurando = false;

function abaAberta() {
  return document.querySelector(".aba.ativa")?.dataset.aba || "macros";
}

function montarEstado() {
  const campos = {};

  for (const id of CAMPOS_GUARDADOS) {
    const campo = $(id);
    if (campo?.value) campos[id] = campo.value;
  }

  return {
    aba: abaAberta(),
    escopoAtender: escopoAtual,
    campos
  };
}

function guardarEstado() {
  if (restaurando) return;

  clearTimeout(gravacaoAgendada);

  gravacaoAgendada = setTimeout(async () => {
    try {
      await chrome.storage.session.set({ [CHAVE_SESSAO]: montarEstado() });
    } catch {
      // sessao indisponivel ou cheia: seguir sem guardar e o certo. Perder a
      // restauracao e um incomodo; travar a tela por causa dela seria pior.
    }
  }, ESPERA_GRAVACAO);
}

async function restaurarEstado() {
  let estado = null;

  try {
    const dados = await chrome.storage.session.get(CHAVE_SESSAO);
    estado = dados[CHAVE_SESSAO] || null;
  } catch {}

  if (!estado) return;

  restaurando = true;

  try {
    // 1. o escopo ANTES dos campos, e nao o contrario: trocarEscopo() limpa
    //    o campo de busca de parceiros ao trocar, entao restaurar o texto
    //    primeiro so para ele ser apagado em seguida.
    if (estado.escopoAtender && estado.escopoAtender !== escopoAtual) {
      trocarEscopo(estado.escopoAtender);
    }

    // 2. o que estava digitado
    for (const [id, valor] of Object.entries(estado.campos || {})) {
      const campo = $(id);
      if (campo) campo.value = valor;
    }

    // 3. a aba por ultimo: trocarAba() poe o foco no campo do escopo aberto,
    //    e a essa altura escopo e campo ja estao como estavam
    if (estado.aba && estado.aba !== abaAberta()) trocarAba(estado.aba);
  } finally {
    restaurando = false;
  }
}

// Um ouvinte no documento em vez de um por controle: qualquer digitacao ou
// clique pode ter mudado o que vale a pena guardar — troca de aba, troca de
// escopo, um campo preenchido. A espera de ESPERA_GRAVACAO transforma a
// rajada numa gravacao so, e as telas de resultado chamam guardarEstado()
// por conta propria, porque o resultado chega depois do clique.
document.addEventListener("input", guardarEstado);
document.addEventListener("click", guardarEstado);
