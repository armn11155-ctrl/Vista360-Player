import type { Firestore } from "firebase-admin/firestore";
import { hoyEnLima } from "./reglasOcupacion.js";

/**
 * Copia de la lista de clientes, EN PARTES, para el selector del admin.
 *
 * POR QUÉ EXISTE. El selector es la pantalla de inicio de cualquier
 * cuenta interna: se carga en CADA inicio de sesión. Y para pintarlo
 * hacían falta dos consultas que crecían linealmente -- todos los
 * clientes, y todos los contratos vigentes para contar sus campañas
 * activas. Con 1.000 clientes eran ~3.000 documentos por sesión; con
 * 10.000, treinta mil. Es el último crecimiento lineal del proyecto.
 *
 * POR QUÉ EN PARTES Y NO EN UN SOLO DOCUMENTO, como el de paneles. Un
 * documento de Firestore no puede pasar de 1 MB. Los paneles son un
 * inventario físico acotado (nunca habrá 100.000), pero los clientes sí
 * pueden llegar a decenas de miles. Un único documento se rompería en
 * torno a los 5.000 y habría que rehacer esto entero justo cuando el
 * negocio estuviera creciendo. Con partes, crece solo.
 *
 * QUÉ SE GUARDA. Solo lo que la lista necesita para pintarse, buscar y
 * ordenarse: nombre, si está archivado, la foto y el número de campañas
 * activas. NO los datos completos del cliente -- esos se leen (uno solo)
 * al entrar a su cuenta. Guardar poco es lo que mantiene alta la
 * cantidad de clientes por parte.
 *
 * CÓMO SE LEE. La parte 0 dice en `partes` cuántas hay. Con menos de
 * 2.000 clientes solo existe la 0, así que el selector se pinta con UNA
 * lectura. A partir de ahí, una lectura más por cada 2.000 clientes.
 *
 * SE REGENERA A MANO, NO CON UN DISPARADOR, por lo mismo que el agregado
 * de paneles: las funciones que reaccionan a escrituras no se pueden
 * desplegar en este proyecto por un tema de permisos. Se llama desde
 * donde se toca un cliente o un contrato, más el barrido diario.
 *
 * EL BARRIDO DIARIO NO ES OPCIONAL. "Campaña activa" depende de la
 * FECHA DE HOY: una campaña programada pasa a activa sin que nadie
 * escriba nada. Sin la regeneración diaria, el contador se quedaría
 * congelado hasta la siguiente vez que alguien tocara un contrato.
 */

/** Cuántos clientes entran en cada parte. 2.000 x ~250 bytes = ~500 KB,
 *  con margen de sobra bajo el límite de 1 MB incluso con nombres
 *  largos y rutas de foto largas. */
export const CLIENTES_POR_PARTE = 2000;

export function rutaParte(indice: number): string {
  return `agregados/clientes-${indice}`;
}

/** EXACTAMENTE los campos que el selector lee de cada cliente. Se
 *  comprobó uno por uno en AdminClientPicker.tsx; añadir más solo
 *  reduciría cuántos clientes caben por parte sin que nadie los use. */
interface ClienteResumido {
  id: string;
  empresa: string;
  archived: boolean;
  avatarUrl: string;
  avatarKey: string;
  contacto: string;
  campanasActivas: number;
}

/** Campañas activas HOY por cliente, sin leer el historial cerrado. */
async function contarCampanasActivas(db: Firestore): Promise<Map<string, number>> {
  const hoy = hoyEnLima();
  // fin >= hoy descarta todo lo terminado. Una campaña activa cumple
  // inicio <= hoy <= fin, así que su fin nunca es anterior a hoy: no se
  // pierde ninguna.
  const snap = await db.collection("contratos").where("fin", ">=", hoy).get();
  const conteo = new Map<string, number>();
  snap.docs.forEach((d) => {
    const c = d.data();
    if (c.deleted) return;
    const clienteId = String(c.cliente_id ?? "");
    if (!clienteId) return;
    // Activa = ya empezó y no ha terminado. Las programadas no cuentan.
    if (typeof c.inicio !== "string" || c.inicio > hoy) return;
    conteo.set(clienteId, (conteo.get(clienteId) ?? 0) + 1);
  });
  return conteo;
}

/**
 * Reconstruye las partes leyendo la colección completa.
 *
 * Se lee TODO a propósito, en vez de ir aplicando cambios uno a uno: así
 * el agregado no puede quedar desincronizado por un cambio perdido. La
 * consistencia vale más que ahorrar unas lecturas que hace el admin.
 */
export async function regenerarAgregadoClientes(db: Firestore): Promise<void> {
  try {
    const [clientesSnap, activas] = await Promise.all([
      db.collection("clientes").get(),
      contarCampanasActivas(db),
    ]);

    const clientes: ClienteResumido[] = clientesSnap.docs
      .map((d) => {
        const c = d.data() ?? {};
        return {
          id: d.id,
          empresa: String(c.empresa ?? ""),
          archived: Boolean(c.archived),
          avatarUrl: String(c.avatarUrl ?? ""),
          avatarKey: String(c.avatarKey ?? ""),
          contacto: String(c.contacto ?? ""),
          campanasActivas: activas.get(d.id) ?? 0,
        };
      })
      // Orden estable por nombre. El selector lo reordena por campañas
      // activas al pintarlo, pero guardarlo ordenado hace que el reparto
      // en partes sea predecible entre regeneraciones.
      .sort((a, b) => a.empresa.localeCompare(b.empresa, "es", { sensitivity: "base" }));

    const total = clientes.length;
    const partes = Math.max(1, Math.ceil(total / CLIENTES_POR_PARTE));
    const actualizadoEn = new Date().toISOString();

    const lote = db.batch();
    for (let i = 0; i < partes; i++) {
      lote.set(db.doc(rutaParte(i)), {
        clientes: clientes.slice(i * CLIENTES_POR_PARTE, (i + 1) * CLIENTES_POR_PARTE),
        // `partes` y `total` van en TODAS las partes, no solo en la 0:
        // así el lector puede empezar por cualquiera si algún día hiciera
        // falta, y sobre todo puede detectar una parte huérfana.
        partes,
        total,
        actualizadoEn,
      });
    }

    // Partes que sobran de cuando había más clientes. Si no se borran, un
    // lector que confíe en `partes` no las verá (correcto), pero quedan
    // ocupando espacio y confundiendo a quien mire la base de datos.
    // Se limpian unas cuantas de más, sin coste real: son escrituras
    // sobre documentos que casi siempre no existen.
    for (let i = partes; i < partes + 3; i++) {
      lote.delete(db.doc(rutaParte(i)));
    }

    await lote.commit();
  } catch (error) {
    // Nunca hacer fallar la operación principal por esto. Si el agregado
    // no se pudo regenerar, el selector cae a leer la colección
    // directamente: más caro, pero correcto.
    console.error("No se pudo regenerar el agregado de clientes.", error);
  }
}
