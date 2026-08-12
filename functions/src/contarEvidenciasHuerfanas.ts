import { onCall } from "firebase-functions/v2/https";
import { exigirRitmo } from "./limitador.js";
import { exigirGerente } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface Datos {
  confirmar?: boolean;
}

/**
 * Las fotos de `fotos_campania` quedaron sin forma de verse: la pantalla
 * de Evidencias, que era la única que las mostraba y la única que las
 * subía, se retiró porque las fotos ahora van dentro del reporte mensual.
 *
 * Esas fotos siguen ocupando espacio en R2 y la limpieza de huérfanos NO
 * las toca, porque técnicamente siguen referenciadas desde el contrato.
 * O sea: espacio muerto permanente si nadie hace esto.
 *
 * Igual que limpiarArchivosHuerfanos, por defecto SOLO CUENTA. Borra
 * únicamente con confirmar:true, y en ese caso también vacía el campo
 * del contrato para no dejar referencias apuntando a archivos que ya no
 * existen.
 */
export const contarEvidenciasHuerfanas = onCall<Datos>(
  // Recorre la coleccion de contratos completa y cruza con R2.
  { secrets: R2_SECRETS, timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
  const db = getFirestore();
  const { uid } = await exigirGerente(request, "Solo la cuenta admin puede hacer esto.");
  // Recorre TODOS los contratos del negocio en cada llamada -- sin
  // límite de ritmo, un bucle agota la cuota de lecturas diaria.
  // Techo de peticiones por minuto: ver limitador.ts.
  exigirRitmo(uid, "contarEvidenciasHuerfanas", 10);

  const confirmar = request.data?.confirmar === true;
  const contratosSnap = await db.collection("contratos").get();

  const claves: string[] = [];
  const contratosConFotos: { id: string; nombre: string; fotos: number }[] = [];

  contratosSnap.docs.forEach((doc) => {
    const c = doc.data() ?? {};
    const fotos = Array.isArray(c.fotos_campania) ? c.fotos_campania : [];
    if (fotos.length === 0) return;
    contratosConFotos.push({
      id: doc.id,
      nombre: String(c.nombre ?? doc.id),
      fotos: fotos.length,
    });
    fotos.forEach((f: Record<string, unknown>) => {
      // Solo keys de R2; las URLs http:// son de otra fuente.
      [f?.url, f?.thumbKey].forEach((v) => {
        if (typeof v === "string" && v && !v.startsWith("http")) claves.push(v);
      });
    });
  });

  let borradas = 0;
  if (confirmar) {
    for (const key of claves) {
      try {
        await borrarObjetoR2(key);
        borradas += 1;
      } catch (err) {
        console.error(`No se pudo borrar la evidencia ${key}`, err);
      }
    }
    // Vaciar el campo para no dejar referencias colgando.
    await Promise.all(
      contratosConFotos.map((c) =>
        db.doc(`contratos/${c.id}`).set({ fotos_campania: [] }, { merge: true })
      )
    );
  }

  return {
    contratosConFotos: contratosConFotos.length,
    archivos: claves.length,
    detalle: contratosConFotos.slice(0, 30),
    borradas,
    soloConteo: !confirmar,
  };
});
