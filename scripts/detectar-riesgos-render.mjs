#!/usr/bin/env node
/**
 * Segunda parte del detector: el RESTO de la familia.
 *
 * detectar-renders.mjs cubre una sola via -- referencias inestables en
 * arrays de dependencias. Este cubre las demas formas de provocar un
 * bucle, un re-render inutil o un bloqueo del hilo principal.
 *
 * Todas comparten la misma caracteristica traicionera: no dan error.
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

function archivos(dir) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) salida.push(p);
  }
  return salida;
}

/**
 * Quita comentarios Y el CONTENIDO de las cadenas de texto, conservando
 * los saltos de linea para que los numeros de linea sigan cuadrando.
 *
 * Vaciar las cadenas no es cosmetico: sin eso, las plantillas de HTML
 * (`<div>${x}</div>`) meten llaves sueltas que descuadran el conteo y el
 * analizador cree que un efecto termina donde no termina. Con eso, los
 * limites de los efectos salian mal y aparecian avisos falsos.
 */
function limpiar(txt) {
  const enBlanco = (m) => m.replace(/[^\n]/g, " ");
  return txt
    .replace(/\/\*[\s\S]*?\*\//g, enBlanco)
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")
    // Plantillas, comillas dobles y simples: se vacia el contenido.
    .replace(/`(?:\\.|[^`\\])*`/g, enBlanco)
    .replace(/"(?:\\.|[^"\\\n])*"/g, enBlanco)
    .replace(/'(?:\\.|[^'\\\n])*'/g, enBlanco);
}

/**
 * Localiza cada `useEffect` / `useLayoutEffect` con su cuerpo y sus
 * dependencias.
 *
 * SE CIERRA POR INDENTACION, no contando llaves. Contarlas parece lo
 * correcto y no lo es: las plantillas de texto anidadas
 * (`<div>${`...`}</div>`) descuadran el conteo y el analizador da por
 * terminado un efecto 300 lineas antes de tiempo -- y entonces cree que
 * no tiene array de dependencias y avisa de un bucle que no existe.
 * Pasó, y por eso este comentario.
 *
 * La indentacion es fiable aqui porque todo el proyecto esta formateado
 * igual: el cierre de un efecto va exactamente a la misma columna que su
 * apertura.
 */
function efectos(codigo) {
  const lineas = codigo.split("\n");
  const salida = [];
  lineas.forEach((linea, i) => {
    const m = /^(\s*)(useEffect|useLayoutEffect)\s*\(/.exec(linea);
    if (!m) return;
    const [, sangria, tipo] = m;

    // EFECTO EN UNA SOLA LINEA: `useEffect(() => { ... }, [x]);`
    // No es como se escribe en este proyecto, pero si el detector no lo
    // entendiera bastaria con juntar las lineas para colarse.
    const enUnaLinea = /\}\s*(?:,\s*\[([^\]]*)\])?\s*\)\s*;?\s*$/.exec(linea);
    if (enUnaLinea && linea.indexOf("{") !== -1) {
      salida.push({
        tipo,
        linea: i + 1,
        cuerpo: linea,
        deps: enUnaLinea[1] === undefined ? null : enUnaLinea[1].split(",").map((d) => d.trim()).filter(Boolean),
        sinArrayDeDeps: enUnaLinea[1] === undefined,
      });
      return;
    }

    const cierre = new RegExp("^" + sangria + "\\}");
    for (let k = i + 1; k < lineas.length; k++) {
      if (!cierre.test(lineas[k])) continue;
      const cuerpo = lineas.slice(i, k).join("\n");
      // El cierre puede ser `}, [a, b]);` o `});` (sin dependencias).
      const resto = lineas.slice(k, k + 3).join(" ");
      const mDeps = /^\s*\}\s*,\s*\[([^\]]*)\]/.exec(resto);
      salida.push({
        tipo,
        linea: i + 1,
        cuerpo,
        deps: mDeps ? mDeps[1].split(",").map((d) => d.trim()).filter(Boolean) : null,
        sinArrayDeDeps: !mDeps,
      });
      return;
    }
  });
  return salida;
}

const riesgos = [];
const anotar = (tipo, archivo, linea, detalle) => riesgos.push({ tipo, archivo, linea, detalle });

for (const ruta of archivos(SRC)) {
  const rel = relative(RAIZ, ruta);
  const codigo = limpiar(readFileSync(ruta, "utf-8"));
  const lineas = codigo.split("\n");
  const esComponenteOHook = /export (default )?function [A-Z]|export function use[A-Z]/.test(codigo);
  if (!esComponenteOHook) continue;

  const setters = [...codigo.matchAll(/const\s*\[[^,\]]+,\s*(set[A-Z]\w*)\s*\]\s*=\s*useState/g)].map((m) => m[1]);
  const cuerposDeEfecto = efectos(codigo);

  // ── 1. setState llamado en el CUERPO del render ──────────────────
  // Bucle inmediato: render -> setState -> render...
  for (const setter of setters) {
    const re = new RegExp("^\\s{2}" + setter + "\\s*\\(", "gm");
    let m;
    while ((m = re.exec(codigo)) !== null) {
      const linea = codigo.slice(0, m.index).split("\n").length;
      const dentroDeEfecto = cuerposDeEfecto.some((e) => e.cuerpo.includes(lineas[linea - 1]));
      if (!dentroDeEfecto) anotar("setState en el render", rel, linea, `${setter}() fuera de un efecto o manejador`);
    }
  }

  // ── 2. Efecto SIN array de dependencias que hace setState ────────
  // Corre en CADA render. Con setState dentro, es un bucle.
  for (const e of cuerposDeEfecto) {
    if (!e.sinArrayDeDeps) continue;
    const setter = setters.find((s) => new RegExp("\\b" + s + "\\s*\\(").test(e.cuerpo));
    if (setter) anotar("efecto sin dependencias con setState", rel, e.linea, `${e.tipo} sin \`[]\` y llama a ${setter}()`);
  }

  // ── 3. Funcion declarada en el render usada como dependencia ─────
  // Una funcion nueva en cada render es una dependencia que SIEMPRE
  // cambia. Necesita useCallback.
  const funcionesDeRender = new Set(
    [...codigo.matchAll(/^\s{2}(?:function\s+([a-z]\w*)|const\s+([a-z]\w*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/gm)]
      .map((m) => m[1] || m[2])
      .filter(Boolean)
  );
  const memoizadas = new Set(
    [...codigo.matchAll(/const\s+(\w+)\s*=\s*useCallback\s*\(/g)].map((m) => m[1])
  );
  for (const e of cuerposDeEfecto) {
    for (const dep of e.deps ?? []) {
      if (funcionesDeRender.has(dep) && !memoizadas.has(dep)) {
        anotar("funcion del render como dependencia", rel, e.linea, `${dep} se redefine en cada render (falta useCallback)`);
      }
    }
  }

  // ── 4. Efecto que actualiza un estado del que DEPENDE ────────────
  // El caso clasico de ciclo: [x] en deps y setX() dentro.
  for (const e of cuerposDeEfecto) {
    for (const dep of e.deps ?? []) {
      const setter = "set" + dep.charAt(0).toUpperCase() + dep.slice(1);
      if (!setters.includes(setter)) continue;
      // SOLO cuenta si la llamada ocurre al EJECUTARSE el efecto. Un
      // setter dentro de un manejador (`onClick={() => setX(...)}`,
      // `.on("click", () => setX(...))`) se dispara con la persona, no
      // con el render: no puede realimentar nada. Era el falso positivo
      // mas ruidoso de esta regla.
      const llamadas = [...e.cuerpo.matchAll(new RegExp("(.{0,40})\\b" + setter + "\\s*\\(", "g"))];
      const enEjecucion = llamadas.some((m) => !/=>\s*$|on\w+=\{|\.on\(|addEventListener|then\(|catch\(/.test(m[1]));
      if (enEjecucion) {
        anotar("efecto que se realimenta", rel, e.linea, `depende de ${dep} y llama a ${setter}() al ejecutarse`);
      }
    }
  }

  // ── 5. value de un Context creado en linea ───────────────────────
  // Objeto nuevo en cada render -> TODOS los consumidores re-renderizan.
  const provider = /<(\w+)\.Provider\s+value=\{\{/.exec(codigo) || /<(\w+)\.Provider\s+value=\{\[/.exec(codigo);
  if (provider) anotar("value de Context en linea", rel, codigo.slice(0, provider.index).split("\n").length,
    `${provider[1]}.Provider recibe un objeto nuevo en cada render`);

  // ── 6. Temporizadores y observadores sin limpieza ────────────────
  for (const e of cuerposDeEfecto) {
    const abre = [
      [/setInterval\s*\(/, "setInterval", /clearInterval\s*\(/],
      [/setTimeout\s*\(/, "setTimeout", /clearTimeout\s*\(/],
      [/requestAnimationFrame\s*\(/, "requestAnimationFrame", /cancelAnimationFrame\s*\(/],
      [/new (ResizeObserver|MutationObserver|IntersectionObserver)\s*\(/, "Observer", /\.disconnect\s*\(/],
      [/addEventListener\s*\(/, "addEventListener", /removeEventListener\s*\(/],
    ];
    // Si el efecto DEVUELVE una funcion de limpieza, se confia en ella.
    // Buscar el par exacto (setTimeout/clearTimeout) daba muchos falsos
    // positivos: la limpieza suele ir por una variable
    // (`const cancelar = cancelIdleCallback ?? clearTimeout`) o por una
    // bandera (`cancelado = true`), y eso es perfectamente valido.
    const tieneLimpieza = /return\s*\(\s*\)\s*=>|return\s+function/.test(e.cuerpo);
    for (const [re, nombre, reLimpieza] of abre) {
      if (!re.test(e.cuerpo)) continue;
      // setInterval es la excepcion: sin clearInterval EXPLICITO el
      // temporizador sigue corriendo para siempre, aunque haya otra
      // limpieza. Es el unico que puede quemar la bateria en silencio.
      const exigirExacto = nombre === "setInterval";
      if (exigirExacto ? !reLimpieza.test(e.cuerpo) : !tieneLimpieza) {
        anotar("recurso sin limpiar", rel, e.linea, `${nombre} sin limpieza en el return del efecto`);
      }
    }
  }

  // ── 7. Escucha de Firestore que se resuscribe con una referencia ─
  // Cada resuscripcion vuelve a LEER y a COBRAR todos los documentos.
  for (const e of cuerposDeEfecto) {
    if (!/onSnapshot\s*\(/.test(e.cuerpo)) continue;
    for (const dep of e.deps ?? []) {
      // Dependencias que no son primitivas evidentes.
      const decl = new RegExp("const\\s+" + dep + "\\s*=([^\\n]*)").exec(codigo);
      if (!decl) continue;
      const rhs = decl[1];
      if (/useMemo|useCallback|useRef/.test(rhs)) continue;
      if (/\.(filter|map|sort|slice|concat|flatMap)\s*\(|\[\s*\]|\{\s*\}|new (Set|Map)\s*\(|\[\s*\.\.\./.test(rhs)) {
        anotar("escucha de Firestore con dependencia inestable", rel, e.linea,
          `onSnapshot se vuelve a suscribir cuando cambia ${dep} (se paga la lectura otra vez)`);
      }
    }
  }

  // ── 8. `key` inestable: remonta el componente en cada render ─────
  // Un key distinto cada vez hace que React DESTRUYA y vuelva a crear el
  // componente: se pierde su estado, se relanzan sus efectos (y sus
  // escuchas de Firestore, que se pagan otra vez).
  for (const m of codigo.matchAll(/key=\{([^}]*)\}/g)) {
    const expr = m[1];
    if (/Math\.random|Date\.now|new Date|crypto\.randomUUID|\+\+/.test(expr)) {
      anotar("key inestable", rel, codigo.slice(0, m.index).split("\n").length,
        `key={${expr.trim().slice(0, 40)}} cambia en cada render: remonta el componente`);
    }
  }

  // ── 9. Bucle sin cota que bloquea el hilo ────────────────────────
  for (const m of codigo.matchAll(/while\s*\(\s*(true|1)\s*\)/g)) {
    const desde = m.index;
    const trozo = codigo.slice(desde, desde + 600);
    if (!/\b(break|return|throw)\b/.test(trozo)) {
      anotar("bucle sin salida", rel, codigo.slice(0, desde).split("\n").length,
        "while(true) sin break/return: bloquea el hilo principal");
    }
  }

  // ── 10. requestAnimationFrame recursivo sin cancelacion ──────────
  // Un rAF que se vuelve a pedir a si mismo corre 60 veces por segundo
  // para siempre si nadie lo cancela al desmontar.
  for (const e of cuerposDeEfecto) {
    const rafs = (e.cuerpo.match(/requestAnimationFrame\s*\(/g) ?? []).length;
    const seVuelveAPedir = /requestAnimationFrame\s*\([^)]*\)[\s\S]{0,200}requestAnimationFrame/.test(e.cuerpo);
    if (rafs >= 2 && seVuelveAPedir && !/cancelAnimationFrame/.test(e.cuerpo)) {
      anotar("animacion sin cancelar", rel, e.linea,
        "requestAnimationFrame recursivo sin cancelAnimationFrame: corre para siempre");
    }
  }

  // ── 11. useState con inicializador COSTOSO no perezoso ────────────
  // useState(calcular()) ejecuta calcular() en CADA render.
  for (const m of codigo.matchAll(/useState\s*\(\s*([A-Za-z_$][\w$.]*)\s*\(/g)) {
    const inicial = m[1];
    if (/^(Number|String|Boolean|Symbol)$/.test(inicial)) continue;
    anotar("useState con inicializador no perezoso", rel, codigo.slice(0, m.index).split("\n").length,
      `useState(${inicial}(...)) ejecuta esa funcion en cada render; usar useState(() => ${inicial}(...))`);
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(riesgos, null, 1));
} else {
  const porTipo = new Map();
  for (const r of riesgos) porTipo.set(r.tipo, [...(porTipo.get(r.tipo) ?? []), r]);
  console.log(`TOTAL: ${riesgos.length}\n`);
  for (const [tipo, lista] of porTipo) {
    console.log(`── ${tipo.toUpperCase()} (${lista.length})`);
    for (const r of lista) console.log(`   ${r.archivo}:${r.linea}  ${r.detalle}`);
    console.log();
  }
}
process.exit(0);
