// ajusta a altura do painel "Países selecionados" para acompanhar a coluna
// esquerda (config + visual): os detalhes rolam dentro do card em vez de
// esticar e deixar espaço em branco ao lado. Grid puro não resolve porque o
// card faz span das 2 linhas e infla a própria coluna; aqui medimos e capamos.
const card = document.querySelector(".selected-card");
const colTop = document.querySelector(".explore-config");
const visual = document.querySelector(".explore-visual");
const content = document.querySelector("#selectedCountryContent");

if (card && colTop && visual && content) {
  const fit = () => {
    // empilhado (mobile): sem limite, rola a página
    if (window.innerWidth <= 900) {
      content.style.maxHeight = "";
      return;
    }
    const colHeight = visual.getBoundingClientRect().bottom - colTop.getBoundingClientRect().top;
    const usedAbove = content.getBoundingClientRect().top - card.getBoundingClientRect().top;
    const padBottom = 18; // padding inferior do card
    content.style.maxHeight = `${Math.max(160, Math.round(colHeight - usedAbove - padBottom))}px`;
  };

  const ro = new ResizeObserver(fit);
  ro.observe(visual);
  ro.observe(colTop);
  window.addEventListener("resize", fit);
  // re-ajusta quando a seleção muda (o conteúdo cresce/encolhe)
  new MutationObserver(fit).observe(content, { childList: true, subtree: true });
  fit();
}
