import type { Firestore } from "firebase-admin/firestore";

/**
 * Copia del inventario de paneles en UN SOLO documento.
 *
 * POR QUÉ EXISTE. Cobertura le muestra a cada cliente todo el inventario,
 * así que cada sesión leía un documento por panel. Con 150 paneles eso
 * era el 60% del coste de una sesión, y lo pagaba TODO el mundo -- da
 * igual que el cliente entre a ver una factura y nunca abra el mapa.
 *
 * Y es un gasto absurdo: los paneles son los MISMOS para todos. Miles de
 * sesiones leyendo una y otra vez exactamente los mismos documentos.
 *
 * Con esto, una sesión lee 1 documento en vez de N. A 100.000 sesiones
 * al mes con 150 paneles, son 15 millones de lecturas menos.
 *
 * SE REGENERA A MANO, NO CON UN DISPARADOR. Firestore permite reaccionar
 * automáticamente a cada escritura, pero en este proyecto esas funciones
 * fallan al desplegarse por un tema de permisos (ver el workflow de
 * despliegue). Así que se llama explícitamente desde los cuatro sitios
 * que tocan paneles: crearPanel, actualizarPanel, eliminarPanel y
 * recalcularEstadoPaneles. Es más código a la vista, pero se despliega
 * sin depender de permisos que esta cuenta no tiene.
 *
 * LÍMITE A VIGILAR: un documento de Firestore no puede pasar de 1 MB.
 * Cada panel ocupa ~300 bytes, así que el techo real está en torno a
 * 3.000 paneles. Si se acerca, hay que partirlo en varios documentos.
 * regenerarAgregadoPaneles avisa en el registro al pasar de 2.000.
 */

export const RUTA_AGREGADO = "agregados/paneles";

/** Tope de seguridad: por encima de esto, avisar en el registro. */
const AVISO_A_PARTIR_DE = 2000;

/**
 * Reconstruye el documento agregado leyendo la colección completa.
 *
 * Se lee TODO a propósito, en vez de ir aplicando cambios uno a uno: es
 * una operación poco frecuente (solo al tocar un panel) y así el
 * agregado no puede quedar desincronizado por un cambio perdido. La
 * consistencia vale más que ahorrar unas lecturas que hace el admin.
 */
export async function regenerarAgregadoPaneles(db: Firestore): Promise<void> {
  try {
    const snap = await db.collection("paneles").get();
    const paneles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (paneles.length > AVISO_A_PARTIR_DE) {
      console.warn(
        `El agregado de paneles ya tiene ${paneles.length} elementos. ` +
          "Acercándose al límite de 1 MB por documento de Firestore: " +
          "conviene partirlo en varios documentos."
      );
    }

    await db.doc(RUTA_AGREGADO).set({
      paneles,
      total: paneles.length,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (error) {
    // Nunca hacer fallar la operación principal por esto. Si el agregado
    // no se pudo regenerar, el frontend lo detecta desactualizado y cae
    // a leer la colección directamente: más caro, pero correcto.
    console.error("No se pudo regenerar el agregado de paneles.", error);
  }
}
