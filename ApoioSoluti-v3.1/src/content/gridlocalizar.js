(function () {
  async function tentarRedirecionar() {
    try {
      const res = await fetch(location.href, { credentials: "include" });
      const text = await res.text();

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return false;
      }

      const id = json?.items?.[0]?.idCDsolicitacao;
      if (!id) return false;

      location.replace(`${location.origin}/certdig/andamento/id/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  // so age nas paginas de gridlocalizar (evita rodar fetch em toda pagina)
  if (!location.pathname.includes("/certdig/gridlocalizar")) return;

  tentarRedirecionar();

  const intervalo = setInterval(async () => {
    const ok = await tentarRedirecionar();
    if (ok) clearInterval(intervalo);
  }, 1500);

  setTimeout(() => clearInterval(intervalo), 20000);
})();
