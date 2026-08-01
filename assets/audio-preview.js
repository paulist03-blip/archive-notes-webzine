(() => {
  const audioLinks = document.querySelectorAll("[data-audio-preview]");
  if (!audioLinks.length) return;

  audioLinks.forEach((link) => {
    const source = link.getAttribute("data-audio-preview");
    if (!source) return;

    link.addEventListener("click", (event) => {
      event.preventDefault();
      const player = new Audio(source);
      player.play().catch(() => {});
    });
  });
})();
