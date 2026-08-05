/**
 * descargar-reglas-firestore.mjs
 *
 * Descarga las reglas de seguridad que están AHORA MISMO en producción y
 * las escribe en un archivo, para poder compararlas con las del
 * repositorio (firestore.rules).
 *
 * Existe porque las reglas nunca estuvieron versionadas: vivían solo en
 * la consola de Firebase, sin historial ni forma de revisarlas. Sin
 * saber qué dicen, no se puede afirmar que la aplicación sea segura --
 * son la última línea de defensa, la que se aplica aunque alguien llame
 * a Firestore directamente desde la consola del navegador saltándose la
 * aplicación entera.
 *
 * Usa la API de Firebase Rules con la misma credencial del despliegue,
 * y el mismo patrón que los otros scripts de esta carpeta (llamada
 * directa a la API en vez de pasar por firebase-tools, que hace
 * comprobaciones de permisos que esta credencial no siempre supera).
 *
 * NO modifica nada: solo lee.
 */
import { GoogleAuth } from 'google-auth-library';
import { writeFileSync } from 'node:fs';

const PROJECT_ID = 'base-de-datos-vista360';
const SALIDA = process.argv[2] || '/tmp/reglas-en-produccion.rules';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status} en ${url}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

// 1. Qué conjunto de reglas está publicado para Firestore.
const release = await get(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`
);
const rulesetName = release.rulesetName;
console.log(`Conjunto de reglas publicado: ${rulesetName}`);
console.log(`Publicado el: ${release.createTime ?? '(sin fecha)'}`);

// 2. Su contenido.
const ruleset = await get(`https://firebaserules.googleapis.com/v1/${rulesetName}`);
const archivos = ruleset.source?.files ?? [];
if (archivos.length === 0) {
  console.error('❌ El conjunto de reglas vino vacío.');
  process.exit(1);
}

const contenido = archivos.map((f) => f.content).join('\n');
writeFileSync(SALIDA, contenido, 'utf-8');

console.log(`\n✅ Guardado en ${SALIDA} (${contenido.length} caracteres)\n`);
console.log('──────── REGLAS ACTUALES EN PRODUCCIÓN ────────');
console.log(contenido);
console.log('───────────────────────────────────────────────');

// 3. VEREDICTO sobre portalUsers.
//
//    Es la comprobación que más importa de todo el script: en ese
//    documento vive el campo "role", del que la aplicación saca si
//    alguien es cliente o administrador. Si el cliente puede escribir
//    ahí sin restricción de campos, puede hacerse administrador solo.
//
//    Se analiza el texto de la regla en vez de pedirle a nadie que la
//    interprete a ojo.

function bloqueDe(coleccion) {
  // OJO con las llaves de la RUTA. Un encabezado es
  // `match /portalUsers/{uid} {` : las llaves de `{uid}` son parte del
  // camino, no del cuerpo. Contar desde la primera llave que aparezca
  // daba un bloque vacío (se abría y cerraba en `{uid}`), y entonces el
  // análisis no encontraba ninguna regla de escritura y daba por
  // SEGURO cualquier caso, incluido el peligroso. Se busca el `{` que
  // viene DESPUÉS de cerrar los parámetros de la ruta.
  const encabezado = new RegExp(`match\\s+/${coleccion}/(?:\\{[^}]*\\}|[^\\s{])*\\s*\\{`);
  const m = contenido.match(encabezado);
  if (!m) return null;
  const inicioCuerpo = m.index + m[0].length - 1; // la llave que abre el cuerpo
  let nivel = 0;
  for (let j = inicioCuerpo; j < contenido.length; j += 1) {
    if (contenido[j] === '{') nivel += 1;
    else if (contenido[j] === '}') {
      nivel -= 1;
      if (nivel === 0) return contenido.slice(m.index, j + 1);
    }
  }
  return contenido.slice(m.index);
}

console.log('\n════════ VEREDICTO SOBRE portalUsers ════════\n');

/** Cuerpo de una función declarada en las reglas (`function nombre() { ... }`). */
function cuerpoDeFuncion(nombre) {
  const m = contenido.match(new RegExp(`function\\s+${nombre}\\s*\\([^)]*\\)\\s*\\{`));
  if (!m) return null;
  let nivel = 0;
  const inicio = m.index + m[0].length - 1;
  for (let k = inicio; k < contenido.length; k += 1) {
    if (contenido[k] === '{') nivel += 1;
    else if (contenido[k] === '}') {
      nivel -= 1;
      if (nivel === 0) return contenido.slice(inicio, k + 1);
    }
  }
  return null;
}

/**
 * Condición con las funciones auxiliares ya sustituidas por su cuerpo.
 *
 * Sin esto el análisis se equivocaba: una regla como
 *     allow update: if request.auth.uid == uid && soloActualizaAnalitica();
 * parecía "no limita los campos", cuando el límite está DENTRO de la
 * función. Da una alarma falsa justo donde todo estaba bien.
 */
function condicionExpandida(condicion, profundidad = 0) {
  if (profundidad > 3) return condicion;
  let salida = condicion;
  for (const m of condicion.matchAll(/\b([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*\)/g)) {
    const cuerpo = cuerpoDeFuncion(m[1]);
    if (cuerpo) salida += ' ' + condicionExpandida(cuerpo, profundidad + 1);
  }
  return salida;
}

const bloquePortal = bloqueDe('portalUsers');

if (!bloquePortal) {
  console.log('No hay un bloque propio para portalUsers.');
  console.log('Puede estar cubierto por una regla comodín: revisar el texto de arriba.');
} else {
  console.log('Regla encontrada:\n');
  console.log(bloquePortal.split('\n').map((l) => '    ' + l).join('\n'));
  console.log();

  const escrituras = [...bloquePortal.matchAll(/allow\s+([a-z,\s]*(?:write|update|create)[a-z,\s]*):([^;]*);/g)];

  if (escrituras.length === 0) {
    console.log('✅ SEGURO: el bloque no concede ninguna escritura.');
  } else {
    let peligroso = false;
    let dudoso = false;

    for (const e of escrituras) {
      const etiqueta = e[1].trim();
      const condicion = e[2].trim();
      const expandida = condicionExpandida(condicion);

      const cerrada = /^if\s+false$/.test(condicion);
      const acotaCampos = /hasOnly|affectedKeys|keys\(\)/.test(expandida);
      const permiteRole = /hasOnly\([^)]*['"]role['"]/.test(expandida);
      // Condiciones que EXCLUYEN a las cuentas de portal (el personal
      // interno del ERP). Un cliente nunca las cumple, así que esa
      // escritura no está a su alcance.
      const soloPersonalInterno = /!\s*esCuentaDePortal\(\)|isHuman\(\)|isOwner\(\)|isAllowed\(\)/.test(condicion);

      if (cerrada) {
        console.log(`✅ "allow ${etiqueta}" está cerrada (if false).`);
      } else if (acotaCampos && !permiteRole) {
        console.log(`✅ "allow ${etiqueta}" limita los campos, y "role" NO está entre ellos.`);
      } else if (acotaCampos && permiteRole) {
        peligroso = true;
        console.log(`🔴 "allow ${etiqueta}" limita campos pero INCLUYE "role".`);
      } else if (soloPersonalInterno) {
        dudoso = true;
        console.log(`🟡 "allow ${etiqueta}" no limita campos, pero exige NO ser cuenta de portal.`);
        console.log('   Un cliente del portal no puede usarla. Queda al alcance de cualquier');
        console.log('   cuenta de Firebase SIN ficha en portalUsers: revisar que el registro');
        console.log('   de cuentas esté cerrado en Authentication.');
      } else {
        peligroso = true;
        console.log(`🔴 "allow ${etiqueta}" NO limita qué campos se escriben y sí está al alcance de un cliente.`);
      }
    }

    console.log();
    if (peligroso) {
      console.log('🔴🔴🔴  ESCALADA DE PRIVILEGIOS POSIBLE  🔴🔴🔴');
      console.log();
      console.log('Un cliente con sesión podría escribirse role:"admin".');
      console.log();
      console.log('ARREGLO (consola de Firebase -> Firestore -> Reglas):');
      console.log('      allow write: if false;');
      console.log();
      console.log('Es seguro: desde el 5 de agosto la app ya no escribe ahí desde el');
      console.log('navegador -- accesos y visitas pasan por Cloud Functions.');
    } else if (dudoso) {
      console.log('🟡 Sin escalada al alcance de un CLIENTE del portal.');
      console.log('   Queda por confirmar que nadie pueda crearse una cuenta suelta:');
      console.log('   Authentication -> Configuración -> Acciones del usuario ->');
      console.log('   "Habilitar la creación (registro)" debe estar DESMARCADO.');
    } else {
      console.log('✅ No se detecta escalada de privilegios por esta vía.');
    }
  }
}
console.log('\n═════════════════════════════════════════════\n');

// 4. Aviso automático de los patrones más peligrosos, para que salte a
//    la vista en el log aunque nadie lea las reglas con detalle.
const alertas = [];
if (/allow\s+(read|write)[^:]*:\s*if\s+true/.test(contenido)) {
  alertas.push('Hay una regla ABIERTA A CUALQUIERA (if true).');
}
if (/allow\s+write[^:]*:\s*if\s+request\.auth\s*!=\s*null\s*;/.test(contenido)) {
  alertas.push('Hay una escritura permitida a CUALQUIER usuario autenticado, sin más condiciones.');
}
if (/match\s*\/portalUsers/.test(contenido)) {
  const bloque = contenido.slice(contenido.indexOf('match /portalUsers'));
  const propio = bloque.slice(0, bloque.indexOf('match /', 10) === -1 ? 600 : bloque.indexOf('match /', 10));
  if (/allow\s+(write|update)/.test(propio) && !/allow\s+(write|update)[^:]*:\s*if\s+false/.test(propio)) {
    alertas.push(
      'portalUsers ACEPTA ESCRITURA del cliente. Ahí vive el campo "role": ' +
      'si la regla no acota los campos exactos, un cliente puede escribirse role:"admin" ' +
      'y quedarse con acceso total. REVISAR CON PRIORIDAD.'
    );
  }
}

if (alertas.length > 0) {
  console.log('\n⚠️  ATENCIÓN:');
  for (const a of alertas) console.log(`   - ${a}`);
} else {
  console.log('\nSin patrones peligrosos evidentes en la revisión automática.');
  console.log('(Revisión superficial: no sustituye leer las reglas.)');
}
