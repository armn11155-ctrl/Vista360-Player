import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, esKeyValida, firmarLecturaR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

const MAX_KEYS_POR_LLAMADA = 60;
// 6 horas: suficiente para que el cliente navegue toda la sesión sin
// re-firmar a cada rato, pero sin dejar links "eternos" dando vueltas.
const EXPIRACION_SEGUNDOS = 6 * 60 * 60;

/**
 * Firma URLs de LECTURA (GET) para archivos privados en R2. Quien pide
 * las URLs debe estar autenticado y tener una fila en portalUsers.
 *
 * Para las FACTURAS se verifica además de quién es cada archivo. Antes
 * no se hacía: bastaba con que la key empezara con "vista360/facturas/"
 * para firmarla, apoyándose en que un cliente "nunca llega a conocer
 * una key que no sea suya" -- seguridad por oscuridad, y encima
 * inconsistente, porque firmarDescargaFactura (la otra puerta al mismo
 * archivo) sí valida al dueño con cuidado. Ahora el admin puede firmar
 * cualquiera, y un cliente solo las keys presentes en su agregado de
 * facturas (con respaldo por cliente_id).
 *
 * Las otras carpetas (campañas, avatares) no llevan datos financieros
 * y sus keys viven dentro de documentos que Firestore Rules ya limita
 * por cliente, así que se firman con la validación de carpeta de
 * siempre.
 */
export const firmarUrlsR2 = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const keysRaw = request.data?.keys;
  if (!Array.isArray(keysRaw) || keysRaw.length === 0) {
    throw new HttpsError("invalid-argument", "Envía un arreglo de keys.");
  }
  if (keysRaw.length > MAX_KEYS_POR_LLAMADA) {
    throw new HttpsError("invalid-argument", `Máximo ${MAX_KEYS_POR_LLAMADA} keys por llamada.`);
  }

  const keys = keysRaw.map((k) => String(k)).filter(esKeyValida);

  const propio = snap.data() ?? {};
  const esAdmin = propio.role === "admin";
  const clienteIdPropio = String(propio.clienteId ?? "");

  /**
   * Todas las facturas propias en una lectura agregada. Antes se hacía una
   * consulta por cada key recibida: mostrar 20 facturas costaba 20 lecturas
   * solo para validar las URLs. Es el mismo documento que ya consume la
   * pantalla. Si aún no existe, se conserva el respaldo por colección.
   */
  async function keysDeMisFacturas(): Promise<Set<string>> {
    const propias = new Set<string>();
    if (!clienteIdPropio) return propias;
    const agregado = await db.doc(`agregados/facturas-${clienteIdPropio}`).get();
    const facturasAgregadas = agregado.data()?.facturas;
    if (agregado.exists && Array.isArray(facturasAgregadas)) {
      facturasAgregadas.forEach((factura: { pdfUrl?: unknown }) => {
        if (typeof factura.pdfUrl === "string") propias.add(factura.pdfUrl);
      });
      return propias;
    }
    const facturasSnap = await db.collection("facturas").where("cliente_id", "==", clienteIdPropio).get();
    facturasSnap.docs.forEach((documento) => {
      const pdfUrl = documento.data()?.pdfUrl;
      if (typeof pdfUrl === "string") propias.add(pdfUrl);
    });
    return propias;
  }

  /**
   * Todas las keys de R2 que aparecen en las campañas de ESTE cliente:
   * la foto de portada y las fotos de evidencia (con sus miniaturas).
   *
   * Se traen de una sola consulta y se dejan en un Set, en vez de
   * consultar por cada key: firmarUrlsR2 acepta hasta 60 por llamada, y
   * una consulta por cada una haría de esta función un cuello de
   * botella (y un blanco fácil para saturar la cuota de Firestore
   * llamándola en bucle).
   */
  async function keysDeMisCampanas(): Promise<Set<string>> {
    const propias = new Set<string>();
    if (!clienteIdPropio) return propias;
    const snapContratos = await db
      .collection("contratos")
      .where("cliente_id", "==", clienteIdPropio)
      .get();
    snapContratos.docs.forEach((d) => {
      const c = d.data();
      if (typeof c.imagenCampaniaUrl === "string") propias.add(c.imagenCampaniaUrl);
      const fotos = Array.isArray(c.fotos_campania) ? c.fotos_campania : [];
      fotos.forEach((f: { url?: unknown; thumbKey?: unknown }) => {
        if (typeof f?.url === "string") propias.add(f.url);
        if (typeof f?.thumbKey === "string") propias.add(f.thumbKey);
      });
    });
    return propias;
  }

  /**
   * DECIDIR POR LISTA BLANCA, NO POR EXCEPCIONES.
   *
   * Antes acá solo se comprobaba la propiedad de las keys que empezaban
   * por "vista360/facturas/"; CUALQUIER otra se firmaba sin verificar
   * nada. En la práctica eso significaba que un cliente autenticado
   * podía pedir una URL firmada de las fotos de campaña de OTRO cliente
   * con solo conocer su key -- las keys llevan una parte aleatoria y no
   * son adivinables a la fuerza, pero apoyarse en eso es seguridad por
   * oscuridad, no control de acceso: basta con que una key se filtre por
   * cualquier vía (una consulta mal protegida, un enlace compartido, una
   * copia de seguridad) para que quede accesible sin límite.
   *
   * Ahora se decide carpeta por carpeta y lo que no encaje se niega. Si
   * mañana se agrega una carpeta nueva a CARPETAS_PERMITIDAS y nadie
   * toca esto, sus archivos quedan inaccesibles para los clientes --
   * molesto, pero es el fallo seguro: se nota enseguida y no filtra nada.
   */
  async function keysPermitidas(): Promise<string[]> {
    if (esAdmin) return keys;

    const necesitaCampanas = keys.some((key) => key.startsWith("vista360/campanas/"));
    const necesitaFacturas = keys.some((key) => key.startsWith("vista360/facturas/"));
    const [campanasMias, facturasMias] = await Promise.all([
      necesitaCampanas ? keysDeMisCampanas() : Promise.resolve(new Set<string>()),
      necesitaFacturas ? keysDeMisFacturas() : Promise.resolve(new Set<string>()),
    ]);
    const decididas = keys.map((key) => {
        // Facturas: la key tiene que estar en el agregado de este cliente.
        if (key.startsWith("vista360/facturas/")) {
          return facturasMias.has(key) ? key : null;
        }
        // Fotos de campaña: solo las que están en SUS propias campañas.
        if (key.startsWith("vista360/campanas/")) {
          return campanasMias.has(key) ? key : null;
        }
        // Avatares: son el logo/foto de perfil que la propia app muestra
        // en cabeceras y listados; no llevan información privada y se
        // ven de forma cruzada por diseño.
        if (key.startsWith("vista360/avatares/")) {
          return key;
        }
        // Cualquier otra cosa: no.
        return null;
      });
    return decididas.filter((k): k is string => k !== null);
  }

  const permitidas = await keysPermitidas();

  const firmadas = await Promise.all(
    permitidas.map(async (key) => ({
      key,
      url: await firmarLecturaR2(key, EXPIRACION_SEGUNDOS),
    }))
  );

  // Las keys que no pasaron el filtro simplemente no vuelven en la
  // respuesta -- el frontend ya trata "sin URL firmada" como "no hay
  // nada que mostrar", así que no rompe nada, y no se le confirma a
  // quien pregunta si esa factura existe o no.
  return { urls: firmadas };
});
