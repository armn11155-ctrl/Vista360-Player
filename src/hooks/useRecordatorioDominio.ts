import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

export interface RecordatorioDominioEstado {
  nombre: string;
  vence: string;
  diasAntes: number;
  aceptadoParaVence: string;
}

type Respuesta =
  | { status: "cargando" }
  | { status: "listo"; estado: RecordatorioDominioEstado }
  | { status: "error" };

/**
 * Recordatorio de renovación del dominio (vista360player.pe), para
 * que no se venza sin querer -- se corta el correo (Zoho/Resend) y el
 * sitio hasta que se recupere. Se guarda en Firestore por Admin SDK
 * (functions/src/administrarRecordatorioDominio.ts), no con
 * onSnapshot directo del cliente -- evita cualquier problema con
 * reglas de Firestore que no se pueden ver desde este repo (viven en
 * la consola de Firebase), mismo motivo que ya usa este proyecto para
 * otras pantallas de solo-admin.
 *
 * No hace falta tiempo real acá (es una pantalla que el admin abre de
 * vez en cuando, no algo colaborativo): un fetch al montar alcanza.
 */
export function useRecordatorioDominio(activo: boolean) {
  const [respuesta, setRespuesta] = useState<Respuesta>({ status: "cargando" });

  const recargar = useCallback(async () => {
    if (!cloudFunctions) { setRespuesta({ status: "error" }); return; }
    setRespuesta({ status: "cargando" });
    try {
      const fn = httpsCallable<{ accion: "leer" }, RecordatorioDominioEstado>(cloudFunctions, "administrarRecordatorioDominio");
      const res = await fn({ accion: "leer" });
      setRespuesta({ status: "listo", estado: res.data });
    } catch {
      setRespuesta({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const [aceptando, setAceptando] = useState(false);

  const aceptar = useCallback(async () => {
    if (!cloudFunctions || aceptando) return;
    setAceptando(true);
    try {
      const fn = httpsCallable<{ accion: "aceptar" }, RecordatorioDominioEstado>(cloudFunctions, "administrarRecordatorioDominio");
      const res = await fn({ accion: "aceptar" });
      setRespuesta({ status: "listo", estado: res.data });
    } catch {
      // Si falla, se deja como estaba -- la tarjeta simplemente sigue
      // mostrándose, que es el comportamiento seguro (mejor de más
      // que perder el aviso).
    }
    setAceptando(false);
  }, [aceptando]);

  return { respuesta, aceptar, aceptando };
}
