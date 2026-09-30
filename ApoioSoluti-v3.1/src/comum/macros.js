if (!window.ApoioMacros) {
  window.ApoioMacros = (() => {
    const CHAVE_LOCAL = "macros";
    const CHAVE_PARTES = "macrosPartes";
    const PREFIXO = "macrosParte";
    const TAMANHO_PARTE = 7000;

    // uma vez que o sync recusa a gravacao (cota, sync desligado, sem conta),
    // parar de insistir: senao cada mudanca de macro tentaria de novo e
    // esbarraria no limite de gravacoes por minuto do proprio sync
    let syncIndisponivel = false;

    function ehChaveDeMacro(chave) {
      return chave === CHAVE_PARTES || chave.startsWith(PREFIXO);
    }

    async function lerDoSync() {
      const dados = await chrome.storage.sync.get(null);
      const partes = dados[CHAVE_PARTES];

      if (!Number.isInteger(partes) || partes < 1) return null;

      let texto = "";
      for (let i = 0; i < partes; i++) {
        const pedaco = dados[PREFIXO + i];
        // gravacao interrompida no meio: melhor cair pro local inteiro do
        // que devolver uma lista cortada
        if (typeof pedaco !== "string") return null;
        texto += pedaco;
      }

      try {
        const lista = JSON.parse(texto);
        return Array.isArray(lista) ? lista : null;
      } catch {
        return null;
      }
    }

    async function limparSobras(usadas) {
      const dados = await chrome.storage.sync.get(null);

      // uma lista que encolheu deixa pedacos antigos para tras; sem remove-los
      // eles so ocupam cota, mas tambem confundem qualquer leitura futura
      const sobrando = Object.keys(dados).filter(
        (chave) =>
          chave.startsWith(PREFIXO) &&
          Number(chave.slice(PREFIXO.length)) >= usadas
      );

      if (sobrando.length) await chrome.storage.sync.remove(sobrando);
    }

    async function enviarParaSync(lista) {
      if (syncIndisponivel) return false;

      const texto = JSON.stringify(lista);
      const pedacos = [];
      for (let i = 0; i < texto.length; i += TAMANHO_PARTE) {
        pedacos.push(texto.slice(i, i + TAMANHO_PARTE));
      }

      const gravar = { [CHAVE_PARTES]: pedacos.length };
      pedacos.forEach((pedaco, i) => {
        gravar[PREFIXO + i] = pedaco;
      });

      try {
        await chrome.storage.sync.set(gravar);
        await limparSobras(pedacos.length);
        return true;
      } catch (erro) {
        syncIndisponivel = true;
        console.warn("Apoio Soluti: macros sem sincronizacao:", erro.message);

        // o local ja tem tudo. Limpar as chaves DESTE modulo evita o pior
        // caso: uma versao parcial/antiga la sobrescrevendo a boa na proxima
        // leitura. So as proprias, e nao um clear(): o sync agora tambem
        // guarda os modelos de e-mail, que nao sao nossos para apagar.
        try {
          const dados = await chrome.storage.sync.get(null);
          const nossas = Object.keys(dados).filter(ehChaveDeMacro);
          if (nossas.length) await chrome.storage.sync.remove(nossas);
        } catch {}

        return false;
      }
    }

    // opcoes.migrar sobe para o sync o que ja existia so na maquina. So o
    // popup pede isso: o content script roda em TODOS os frames da pagina, e
    // uma pagina com varios iframes mandaria uma gravacao por frame de uma
    // vez, estourando o limite de gravacoes por minuto do proprio sync.
    async function ler(opcoes = {}) {
      try {
        const doSync = await lerDoSync();
        if (doSync) return doSync;
      } catch {}

      const dados = await chrome.storage.local.get(CHAVE_LOCAL);
      const local = Array.isArray(dados[CHAVE_LOCAL]) ? dados[CHAVE_LOCAL] : [];

      // nao mexe no local aqui, para nao disparar um redesenho a toa
      if (opcoes.migrar && local.length && !syncIndisponivel) {
        enviarParaSync(local).catch(() => {});
      }

      return local;
    }

    async function salvar(lista) {
      // o local primeiro, sempre: e a copia que nao depende de rede nem cota
      await chrome.storage.local.set({ [CHAVE_LOCAL]: lista });
      return enviarParaSync(lista);
    }

    function aoMudar(callback) {
      chrome.storage.onChanged.addListener((mudancas, area) => {
        const mexeu =
          (area === "sync" && Object.keys(mudancas).some(ehChaveDeMacro)) ||
          (area === "local" && Boolean(mudancas[CHAVE_LOCAL]));

        if (mexeu) ler().then(callback);
      });
    }

    function saudacaoAtual() {
      const h = new Date().getHours();
      // 6h-11h59 bom dia; 12h-17h59 boa tarde; resto boa noite
      if (h >= 6 && h < 12) return "Bom dia";
      if (h >= 12 && h < 18) return "Boa tarde";
      return "Boa noite";
    }

    // Troca o marcador {saudacao} pela saudacao do horario. Se o comando for
    // exatamente .ini e nao houver marcador, a saudacao vai na frente.
    function resolverResposta(macro) {
      const texto = macro?.resposta || "";

      if (texto.includes("{saudacao}")) {
        return texto.replace(/\{saudacao\}/gi, saudacaoAtual());
      }

      if ((macro?.comando || "").toLowerCase() === ".ini") {
        return texto ? saudacaoAtual() + ", " + texto : saudacaoAtual() + "!";
      }

      return texto;
    }

    return { ler, salvar, aoMudar, saudacaoAtual, resolverResposta };
  })();
}
