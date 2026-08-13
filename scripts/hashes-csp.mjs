/**
 * hashes-csp.mjs
 *
 * Calcula los hashes SHA-256 que la CSP necesita para permitir los
 * bloques <style> y <script> EN LÍNEA que quedan en los HTML estáticos.
 *
 * Por qué hashes y no 'unsafe-inline': 'unsafe-inline' abre la puerta a
 * CUALQUIER script o estilo inyectado, que es justo el ataque (XSS) del
 * que la CSP debería proteger. Un hash permite exactamente ese bloque y
 * nada más -- si alguien inyecta algo distinto, el navegador lo bloquea.
 *
 * Contrapartida honesta: si alguien edita uno de esos bloques y no
 * actualiza el hash, el navegador deja de aplicarlo (la pantalla se ve
 * mal, o el visor de PDF deja de funcionar). Por eso existe la prueba
 * permanente en src/logica-negocio/cabecerasWeb.test.ts: recalcula los
 * hashes desde los HTML reales y falla si no coinciden con _headers.
 *
 * Uso:  node scripts/hashes-csp.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Extrae el contenido de cada bloque <tag>...</tag> de un HTML.
 *
 *  Quita primero los comentarios HTML. Sin eso, un comentario que
 *  MENCIONE una etiqueta de estilo o de script hace que el buscador
 *  empiece a contar desde dentro del comentario y el hash salga mal --
 *  y un hash mal calculado no se nota hasta que el navegador bloquea el
 *  bloque en produccion. Paso de verdad al documentar esto. */
function bloquesEnLinea(html, tag) {
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const encontrados = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    // Un <script src="..."> no lleva contenido en línea: no necesita hash.
    if (m[1].trim() !== "") encontrados.push(m[1]);
  }
  return encontrados;
}

/** Hash en el formato exacto que espera una CSP. */
function hashCsp(contenido) {
  return `'sha256-${createHash("sha256").update(contenido, "utf8").digest("base64")}'`;
}

for (const archivo of ["index.html", "visor-pdf.html", "public/404.html"]) {
  const html = readFileSync(join(RAIZ, archivo), "utf8");
  const estilos = bloquesEnLinea(html, "style").map(hashCsp);
  const scripts = bloquesEnLinea(html, "script").map(hashCsp);
  console.log(`\n${archivo}`);
  console.log(`  style-src : ${estilos.join(" ") || "(ninguno)"}`);
  console.log(`  script-src: ${scripts.join(" ") || "(ninguno)"}`);
}
