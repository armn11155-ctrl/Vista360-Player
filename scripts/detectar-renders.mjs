#!/usr/bin/env node
/**
 * Detector del patrón que causa bucles de renderizado.
 *
 * Busca valores creados DURANTE EL RENDER (una expresión que devuelve una
 * referencia nueva cada vez) que acaban en el array de dependencias de un
 * useEffect / useMemo / useCallback sin estar memoizados.
 *
 * Ese patrón produce: efecto -> setState -> render -> referencia nueva ->
 * efecto... Y no da ningún síntoma: no hay error, el DOM ni se mueve.
 * Lo único que se rompe son las transiciones de React, que al ser
 * interrumpibles nunca llegan a completarse.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
/**
 * Directorio a analizar. Por defecto src/, pero se puede apuntar a otro
 * con --dir=<ruta>.
 *
 * NO ES UN CAPRICHO: las pruebas necesitan analizar fragmentos sueltos
 * sin escribirlos dentro de src/. Cuando lo hacian, la prueba de "src/
 * esta limpio" veia los fragmentos temporales de las OTRAS pruebas
 * corriendo en paralelo y fallaba al azar. Un test inestable es peor que
 * no tenerlo: se aprende a reintentar el CI en vez de mirar por que fallo.
 */
const argDir = process.argv.find((a) => a.startsWith("--dir="));
const SRC = argDir ? argDir.slice(6) : join(RAIZ, "src");

/** Expresiones que devuelven una referencia NUEVA en cada evaluación. */
const CREADORES = [
  [/\.filter\s*\(/, "filter()"],
  [/\.map\s*\(/, "map()"],
  [/\.flatMap\s*\(/, "flatMap()"],
  [/\.sort\s*\(/, "sort()"],
  [/\.slice\s*\(/, "slice()"],
  [/\.concat\s*\(/, "concat()"],
  [/\.reduce\s*\(/, "reduce()"],
  [/\.split\s*\(/, "split()"],
  [/Object\.values\s*\(/, "Object.values()"],
  [/Object\.keys\s*\(/, "Object.keys()"],
  [/Object\.entries\s*\(/, "Object.entries()"],
  [/Object\.assign\s*\(/, "Object.assign()"],
  [/Object\.fromEntries\s*\(/, "Object.fromEntries()"],
  [/new\s+Set\s*\(/, "new Set()"],
  [/new\s+Map\s*\(/, "new Map()"],
  [/new\s+Date\s*\(/, "new Date()"],
  [/Array\.from\s*\(/, "Array.from()"],
  [/\[\s*\.\.\./, "spread en array"],
  [/\{\s*\.\.\./, "spread en objeto"],
  [/=\s*\[\s*\]/, "array vacío literal"],
  [/=\s*\{\s*\}/, "objeto vacío literal"],
  [/\?\s*[^:]*:\s*\[\s*\]/, "`: []` en un ternario"],
  [/\?\s*[^:]*:\s*\{\s*\}/, "`: {}` en un ternario"],
  [/=\s*\[[^\]]/, "array literal con contenido"],
];

/** Ya está memoizado: la referencia es estable. */
// Se prueba contra la parte de la DERECHA del `=`, asi que no lleva `=`.
const MEMOIZADO = /^\s*(useMemo|useCallback|useRef)\s*\(/;

/**
 * Expresiones que acaban en un PRIMITIVO (string, número, booleano).
 * Los primitivos se comparan por VALOR, así que da igual que se calculen
 * en cada render: la dependencia solo cambia si el valor cambia.
 *
 * De hecho `.map(...).join("|")` es el patrón CORRECTO para meter una
 * lista en un array de dependencias. No debe marcarse como riesgo.
 */
const METODOS_PRIMITIVOS = new Set([
  "join", "length", "startsWith", "endsWith", "includes", "indexOf",
  "toString", "toLowerCase", "toUpperCase", "trim", "test", "localeCompare",
  "getTime", "toISOString", "some", "every", "find",
]);

/**
 * ¿La expresión termina en algo que devuelve un primitivo?
 *
 * Lo que decide el tipo es la ÚLTIMA operación, no lo que haya en medio.
 * `lista.map(x => x.id).join("|")` acaba en join -> string -> seguro.
 * `ITEMS.filter(x => x.a || x.b)` acaba en filter -> array -> peligroso,
 * aunque lleve un `||` dentro.
 */
/** Literales que son primitivos (referencia estable por definición). */
function esLiteralPrimitivo(x) {
  const t = x.trim();
  return /^(""|''|``|-?\d+(\.\d+)?|true|false|null|undefined)$/.test(t);
}

function devuelvePrimitivo(expr) {
  const limpio = expr.trim().replace(/;\s*$/, "");

  // TERNARIO: lo que importa son las DOS ramas. `cond ? algo.join("|") : ""`
  // devuelve string por los dos lados -> seguro. `cond ? lista : []` no.
  const t = partirTernario(limpio);
  if (t) return (devuelvePrimitivo(t.si) || esLiteralPrimitivo(t.si))
             && (devuelvePrimitivo(t.no) || esLiteralPrimitivo(t.no));

  if (/^(Boolean|String|Number)\s*\(/.test(limpio)) return true;
  if (/\.length$/.test(limpio)) return true;
  // Última llamada a método de la expresión.
  const llamadas = [...limpio.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)];
  if (llamadas.length === 0) return false;
  const ultima = llamadas[llamadas.length - 1][1];
  // Solo cuenta si esa llamada es la que CIERRA la expresión.
  const desde = llamadas[llamadas.length - 1].index;
  const cola = limpio.slice(desde);
  const cierra = cola.lastIndexOf(")") === cola.length - 1;
  return cierra && METODOS_PRIMITIVOS.has(ultima);
}

/** Parte `cond ? a : b` respetando paréntesis y corchetes anidados. */
function partirTernario(expr) {
  let nivel = 0, posInterrogacion = -1, posDosPuntos = -1;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if ("([{".includes(c)) nivel++;
    else if (")]}".includes(c)) nivel--;
    else if (nivel === 0 && c === "?" && posInterrogacion === -1 && expr[i + 1] !== ".") posInterrogacion = i;
    else if (nivel === 0 && c === ":" && posInterrogacion !== -1 && posDosPuntos === -1) posDosPuntos = i;
  }
  if (posInterrogacion === -1 || posDosPuntos === -1) return null;
  return {
    si: expr.slice(posInterrogacion + 1, posDosPuntos),
    no: expr.slice(posDosPuntos + 1),
  };
}

function archivos(dir) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) salida.push(p);
  }
  return salida;
}

/** Quita comentarios para no analizar texto explicativo. */
function limpiar(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

const hallazgos = [];
const declaracionesPorArchivo = new Map();

for (const ruta of archivos(SRC)) {
  const original = readFileSync(ruta, "utf-8");
  const codigo = limpiar(original);
  const lineas = codigo.split("\n");

  // Declaraciones locales: nombre -> { linea, texto, memoizado }
  const declaraciones = new Map();
  lineas.forEach((l, i) => {
    const m = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=(.*)$/.exec(l);
    if (!m) return;
    const [, nombre, resto] = m;
    // El cuerpo puede seguir en las lineas siguientes, pero hay que
    // PARAR en la declaracion siguiente. Una ventana fija de N lineas se
    // colaba en la constante de al lado: si esa era un useMemo, esta se
    // daba por memoizada y el riesgo pasaba inadvertido. (Ocurrio: asi
    // se le escapaba el bug real de App.tsx.)
    const trozo = [lineas[i]];
    for (let k = i + 1; k < Math.min(i + 8, lineas.length); k++) {
      if (/^\s*(const|let|var|function|export|return|if|useEffect|useLayoutEffect)\b/.test(lineas[k])) break;
      trozo.push(lineas[k]);
    }
    const cuerpo = trozo.join("\n");
    // La memoizacion se juzga SOLO por la propia declaracion.
    declaraciones.set(nombre, { linea: i + 1, texto: resto.trim(), cuerpo, memoizado: MEMOIZADO.test(resto) });
  });

  declaracionesPorArchivo.set(ruta, declaraciones);

  // Arrays de dependencias.
  const re = /\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  let m;
  while ((m = re.exec(codigo)) !== null) {
    const linea = codigo.slice(0, m.index).split("\n").length;
    const deps = m[1].split(",").map((d) => d.trim()).filter(Boolean);
    for (const dep of deps) {
      // `lista.length` es un NUMERO: se compara por valor y es seguro,
      // aunque `lista` sea una referencia nueva en cada render. Recortar
      // el `.length` y quedarse con `lista` era un falso positivo.
      if (/\.length\s*$/.test(dep)) continue;
      const nombre = dep.replace(/[?!].*$/, "").split(/[.[]/)[0];
      const d = declaraciones.get(nombre);
      if (!d || d.memoizado) continue;
      // Primero: ¿el resultado es un primitivo? Entonces es seguro.
      // Una expresión que acaba en primitivo es segura: los primitivos se
      // comparan por VALOR, así que la dependencia solo cambia si el
      // valor cambia. `.map(...).join("|")` es el patrón CORRECTO.
      if (devuelvePrimitivo(d.texto)) continue;
      const motivo = CREADORES.find(([r]) => r.test(d.cuerpo));
      if (!motivo) continue;
      hallazgos.push({
        archivo: relative(RAIZ, ruta),
        dependencia: nombre,
        creadoEnLinea: d.linea,
        usadoEnLinea: linea,
        motivo: motivo[1],
        codigo: d.texto.slice(0, 90),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// SEGUNDA COMPROBACIÓN, la que habría cazado el bug real.
//
// Un hook que recibe un array/objeto POR PARÁMETRO y lo mete en sus
// dependencias es una bomba puesta en manos de quien lo llame: si el que
// llama no memoiza, hay bucle. Y el hook no puede defenderse solo.
//
// Fue exactamente lo que pasó: useNotificaciones(clienteId, contratos,
// solicitudes) con [clienteId, contratos, solicitudes] en el efecto, y
// App.tsx pasándole un `.filter(...)` sin memoizar.
//
// Estos casos no se prohíben --a veces es lo natural-- pero se listan
// para que cada uno esté revisado y sus llamadas memoizadas.
const parametrosEnDeps = [];
for (const ruta of archivos(SRC)) {
  const codigo = limpiar(readFileSync(ruta, "utf-8"));
  const reHook = /export function (use[A-Z]\w*)\s*\(([^)]*)\)/g;
  let h;
  while ((h = reHook.exec(codigo)) !== null) {
    const [, nombre, params] = h;
    // Parámetros cuyo tipo es array u objeto (los primitivos no molestan).
    const deTipoReferencia = params
      .split(",")
      .map((p) => p.trim())
      .filter((p) => /:\s*[^=]*(\[\]|Record<|Map<|Set<|\{)/.test(p))
      .map((p) => p.split(":")[0].trim());
    if (deTipoReferencia.length === 0) continue;
    const cuerpo = codigo.slice(h.index, codigo.indexOf("\nexport ", h.index + 10));
    const reDeps = /\}\s*,\s*\[([^\]]*)\]\s*\)/g;
    let d;
    while ((d = reDeps.exec(cuerpo)) !== null) {
      const deps = d[1].split(",").map((x) => x.trim());
      for (const dep of deps) {
        if (deTipoReferencia.includes(dep)) {
          parametrosEnDeps.push({ archivo: relative(RAIZ, ruta), hook: nombre, parametro: dep });
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// TERCERA COMPROBACIÓN: argumentos EN LÍNEA.
//
// El detector de arriba solo mira `const x = ...`. Pero el patrón también
// aparece pasado directamente en la llamada:
//
//   useNotificaciones(clienteId, contratos, estado.ok ? estado.lista : [])
//
// Ese `[]` es un array nuevo en cada render y va derecho a las
// dependencias del efecto del hook. Mismo bucle, sin ninguna constante
// donde verlo.
const argumentosEnLinea = [];
const hooksPeligrosos = new Set(parametrosEnDeps.map((p) => p.hook));
for (const ruta of archivos(SRC)) {
  const codigo = limpiar(readFileSync(ruta, "utf-8"));
  for (const hook of hooksPeligrosos) {
    const re = new RegExp(hook + "\\s*\\(", "g");
    let m;
    while ((m = re.exec(codigo)) !== null) {
      // Recorta la llamada completa respetando paréntesis anidados.
      let nivel = 0, fin = m.index + m[0].length - 1;
      for (let i = fin; i < codigo.length; i++) {
        if (codigo[i] === "(") nivel++;
        else if (codigo[i] === ")") { nivel--; if (nivel === 0) { fin = i; break; } }
      }
      const args = codigo.slice(m.index + m[0].length, fin);
      // Se salta la propia definición del hook.
      if (/^\s*[a-zA-Z_$][\w$]*\s*:/.test(args)) continue;
      // (a) La referencia se crea DENTRO de la llamada.
      let motivo = CREADORES.find(([r]) => r.test(args));
      let detalle = args.replace(/\s+/g, " ").trim().slice(0, 100);
      if (motivo && devuelvePrimitivo(args)) motivo = undefined;

      // (b) O se pasa una CONSTANTE LOCAL que se crea en cada render.
      //     Este es el caso que rompio la navegacion en produccion:
      //     App.tsx tenia `const contratos = ...filter(...)` y se lo
      //     pasaba a useNotificaciones, que lo usa como dependencia. La
      //     constante NO aparecia en ningun array de dependencias de su
      //     propio archivo, asi que la primera comprobacion no la veia.
      if (!motivo) {
        const decls = declaracionesPorArchivo.get(ruta);
        for (const nombre of args.split(",").map((x) => x.trim())) {
          if (!/^[A-Za-z_$][\w$]*$/.test(nombre)) continue;
          const d = decls && decls.get(nombre);
          if (!d || d.memoizado) continue;
          if (devuelvePrimitivo(d.texto)) continue;
          const m2 = CREADORES.find(([r]) => r.test(d.cuerpo));
          if (m2) {
            motivo = m2;
            detalle = `${nombre} = ${d.texto.slice(0, 70)}`;
            break;
          }
        }
      }

      if (!motivo) continue;
      argumentosEnLinea.push({
        archivo: relative(RAIZ, ruta),
        linea: codigo.slice(0, m.index).split("\n").length,
        hook,
        motivo: motivo[1],
        argumentos: detalle,
      });
    }
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ hallazgos, argumentosEnLinea, parametrosEnDeps }, null, 1));
} else {
  console.log(`RIESGO DIRECTO (valor de render usado como dependencia): ${hallazgos.length}\n`);
  for (const h of hallazgos) {
    console.log(`${h.archivo}:${h.creadoEnLinea}  dep "${h.dependencia}"  [${h.motivo}]`);
    console.log(`   usada como dependencia en la línea ${h.usadoEnLinea}`);
    console.log(`   ${h.codigo}\n`);
  }
  console.log(`\nRIESGO EN LÍNEA (referencia creada dentro de la propia llamada): ${argumentosEnLinea.length}\n`);
  for (const a of argumentosEnLinea) {
    console.log(`${a.archivo}:${a.linea}  ${a.hook}(${a.argumentos})  [${a.motivo}]\n`);
  }

  console.log(`\nHOOKS QUE RECIBEN UNA REFERENCIA Y LA USAN COMO DEPENDENCIA: ${parametrosEnDeps.length}`);
  console.log("(no es un fallo en sí, pero OBLIGA a que quien los llame memoice)\n");
  for (const p of parametrosEnDeps) {
    console.log(`  ${p.archivo}  ${p.hook}(... ${p.parametro} ...)`);
  }
}
process.exit(0);
