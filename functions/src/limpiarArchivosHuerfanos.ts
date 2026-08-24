import { onCall } from "firebase-functions/v2/https";
import { exigirRitmo } from "./limitador.js";
import { exigirGerente, exigirAutenticacionReciente } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PAPELERA_PREFIJO, R2_SECRETS, borrarObjetoR2, listarObjetosR2 } from "./r2Storage.js";
import { auditar } from "./registro.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Encuentra archivos en R2 que ya no están referenciados por ningún
 * documento de Firestore, y opcionalmente los borra.
 *
 * De dónde salen: cuando una subida se hace en dos pasos (primero el
 * archivo a R2, después la referencia en Firestore) y el segundo paso
 * falla -- se corta la conexión, se cierra la pestaña, el documento se
 * borra por otro lado -- el archivo se queda en el bucket sin que nada
 * lo apunte. Es invisible desde la app: nadie lo va a encontrar nunca
 * para borrarlo a mano, pero sigue ocupando (y costando) espacio.
 *
 * MUY a propósito: por defecto NO borra nada. Devuelve el listado y
 * cuánto espacio se recuperaría, para poder revisar antes. Solo borra
 * si se le pasa confirmar:true explícitamente.
 *
 * Además ignora los archivos subidos hace menos de 24 horas: pueden ser
 * de una subida que todavía está en curso (el usuario eligió la foto y
 * aún no guarda el formulario), y borrarlos rompería esa subida.
 */

const HORAS_DE_GRACIA = 24;

interface LimpiarData {
  confirmar?: boolean;
}

/** Todas las keys de R2 que aparecen citadas en algún documento. */
async function keysEnUso(db: FirebaseFirestore.Firestore): Promise<Set<string>> {
  const enUso = new Set<string>();
  const agregar = (valor: unknown) => {
    // Solo interesan las keys de R2. Las URLs http:// son de otra fuente
    // (imágenes externas ya migradas) y no viven en nuestro bucket.
    if (typeof valor === "string" && valor && !valor.startsWith("http")) enUso.add(valor);
  };

  const [contratos, solicitudes, clientes, portalUsers, facturas, informes] = await Promise.all([
    db.collection("contratos").get(),
    db.collection("solicitudesCampana").get(),
    db.collection("clientes").get(),
    db.collection("portalUsers").get(),
    db.collection("facturas").get(),
    db.collection("informesCliente").get(),
  ]);

  contratos.docs.forEach((d) => {
    const c = d.data();
    agregar(c.imagenCampaniaUrl);
    (Array.isArray(c.fotos_campania) ? c.fotos_campania : []).forEach((f: Record<string, unknown>) => {
      agregar(f?.url);
      agregar(f?.thumbKey);
    });
  });

  solicitudes.docs.forEach((d) => {
    const s = d.data();
    agregar(s.imagenReferencialUrl);
    agregar(s.comprobantePagoUrl);
  });

  clientes.docs.forEach((d) => {
    agregar(d.data().avatarUrl);
    agregar(d.data().logoUrl);
  });
  portalUsers.docs.forEach((d) => agregar(d.data().avatarUrl));
  facturas.docs.forEach((d) => agregar(d.data().pdfUrl));
  informes.docs.forEach((d) => {
    const r2Keys = d.data().r2Keys;
    if (r2Keys && typeof r2Keys === "object") Object.values(r2Keys).forEach(agregar);
  });

  return enUso;
}

export const limpiarArchivosHuerfanos = onCall<LimpiarData>(
  // Recorre SEIS colecciones completas y ademas lista el bucket entero de
  // R2. Es la funcion que peor escala del proyecto: su coste crece con
  // TODO el historico, no con lo que se este usando. Con los 60 segundos
  // por defecto, el dia que haya decenas de miles de documentos se corta
  // a la mitad y deja el recuento sin terminar -- sin decir por que.
  { secrets: R2_SECRETS, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
  const db = getFirestore();
  const { uid } = await exigirGerente(request, "Solo la cuenta admin puede hacer esto.");
  // Borra en bucle potencialmente cientos de archivos de R2 -- sin
  // límite de ritmo, una sesión comprometida podría llamarla en bucle
  // para maximizar el daño. Techo de peticiones por minuto: ver
  // limitador.ts.
  exigirRitmo(uid, "limpiarArchivosHuerfanos", 10);

  const confirmar = request.data?.confirmar === true;

  // Solo el borrado REAL es crítico. La simulación (confirmar:false) es
  // de lectura y se usa para revisar antes de decidir: pedirle la
  // contraseña a alguien que solo está mirando sería fricción sin
  // ninguna ganancia de seguridad.
  if (confirmar) {
    exigirAutenticacionReciente(
      request,
      "Vuelve a escribir tu contraseña para borrar definitivamente estos archivos."
    );
  }
  const enUso = await keysEnUso(db);

  const limite = Date.now() - HORAS_DE_GRACIA * 60 * 60 * 1000;

  const huerfanos: { key: string; bytes: number; modificado: string }[] = [];
  let totalObjetos = 0;
  let bytesHuerfanos = 0;
  let continuationToken: string | undefined;

  do {
    const pagina = await listarObjetosR2({ continuationToken });
    for (const obj of pagina.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      totalObjetos += 1;

      // Los reportes mensuales (clientes/{id}/reportes/...) NO se citan
      // por key en ningún documento: se descubren listando el bucket
      // por prefijo (ver listarReportesCliente). Si se contaran como
      // huérfanos, esta limpieza borraría justamente el historial de
      // reportes de los clientes. Se excluyen enteros.
      if (key.startsWith("clientes/")) continue;

      // La papelera es recuperación deliberada, no basura. Su retención
      // es de 30 días mediante una regla de ciclo de vida de R2. Antes,
      // este barrido la consideraba huérfana y podía borrarla a las 24 h,
      // contradiciendo la garantía de recuperación de la propia interfaz.
      if (key.startsWith(PAPELERA_PREFIJO)) continue;

      if (enUso.has(key)) continue;

      const modificado = obj.LastModified?.getTime() ?? 0;
      if (modificado > limite) continue; // subido recién, puede estar en curso

      const bytes = obj.Size ?? 0;
      bytesHuerfanos += bytes;
      huerfanos.push({
        key,
        bytes,
        modificado: obj.LastModified?.toISOString() ?? "",
      });
    }
    continuationToken = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
  } while (continuationToken);

  // Del más pesado al más liviano: si hay muchos, los primeros son los
  // que de verdad mueven la aguja del espacio.
  huerfanos.sort((a, b) => b.bytes - a.bytes);

  let borrados = 0;
  if (confirmar) {
    for (const h of huerfanos) {
      try {
        await borrarObjetoR2(h.key);
        borrados += 1;
      } catch (err) {
        console.error(`No se pudo borrar ${h.key}`, err);
      }
    }
    // Rastro de quién confirmó un borrado masivo real (no la
    // simulación) y cuántos archivos se fueron -- antes esta función
    // no dejaba ningún registro de auditoría.
    auditar("archivos_huerfanos_borrados", { uid, cantidad: borrados });
  }

  return {
    // Qué se revisó
    totalObjetos,
    keysReferenciadas: enUso.size,
    // Qué sobra
    huerfanos: huerfanos.length,
    bytesHuerfanos,
    mbHuerfanos: Math.round((bytesHuerfanos / 1024 / 1024) * 10) / 10,
    // Los 50 más pesados, para revisar antes de confirmar
    muestra: huerfanos.slice(0, 50),
    // Qué se hizo
    borrados,
    soloSimulacion: !confirmar,
  };
});
