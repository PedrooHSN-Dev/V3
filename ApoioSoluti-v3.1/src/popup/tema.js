(() => {
  // A mesma pagina serve de duas formas: popup da barra de ferramentas, com
  // tamanho fixo, e janela destacada, que precisa preencher o que a janela
  // der. A marca e lida aqui, no <head>, pelo mesmo motivo do tema: depois
  // da primeira pintura o usuario ja teria visto a caixa no tamanho errado.
  if (new URLSearchParams(location.search).get("destacada") === "1") {
    document.documentElement.dataset.janela = "destacada";
  }

  try {
    const tema = localStorage.getItem("tema");

    if (tema === "claro" || tema === "escuro") {
      document.documentElement.dataset.tema = tema;
    }
  } catch {
    // armazenamento bloqueado: segue o tema do sistema
  }
})();
