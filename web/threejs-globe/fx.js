export function playFade(el) {
  if (!el) {
    return;
  }
  el.classList.remove("fx-fade");
  void el.offsetWidth;
  el.classList.add("fx-fade");
}
