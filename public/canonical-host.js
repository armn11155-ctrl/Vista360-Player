(function redirigirAlDominioOficial() {
  var dominiosTecnicos = ["vista360-player.pages.dev", "vista360.pages.dev"];
  if (dominiosTecnicos.indexOf(window.location.hostname) === -1) return;

  var destino = new URL(window.location.href);
  destino.protocol = "https:";
  destino.hostname = "vista360player.pe";
  destino.port = "";
  window.location.replace(destino.toString());
})();
