import { useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

/**
 * Pantallas cuyo uso se cuenta. Tiene que coincidir EXACTAMENTE con la
 * lista del servidor (functions/src/registrarVisita.ts) -- hay un test
 * que lo comprueba (src/logica-negocio/pantallasVisitadas.test.ts),
 * porque si las dos listas se separan, la de acá dejaría pasar nombres
 * que el servidor rechaza y se gastarían llamadas para nada.
 *
 * Acá sirve solo para no llamar en balde; la validación de verdad, la
 * que importa, la hace el servidor.
 */
export const PANTALLAS_VALIDAS = new Set([
  "inicio",
  "campanas",
  "detalle",
  "evidencias",
  "reportes",
  "perfil",
  "nueva",
  "portafolio",
  "cobertura",
  "mispantallas",
  "impacto",
  "contactanos",
  "analitica",
]);

/**
 * Registradas YA en esta sesión. Vive fuera del componente a propósito:
 * el árbol de la app se vuelve a montar en situaciones normales (por
 * ejemplo cuando el admin cambia de cliente), y con un useRef dentro del
 * hook el contador se reiniciaba y se volvía a registrar todo de cero.
 */
const registradasEnEstaSesion = new Set<string>();

/**
 * Cuenta qué pantallas usa cada persona. Alimenta la Analítica del admin.
 *
 * DOS CAMBIOS respecto a como estaba, los dos importantes:
 *
 * 1. PASA POR CLOUD FUNCTION, no escribe directo. Antes hacía un
 *    updateDoc del navegador sobre portalUsers/{uid} -- el mismo
 *    documento donde vive el campo `role`, del que la app saca si
 *    alguien es cliente o administrador. Permitir que el navegador
 *    escriba ahí obliga a tener una regla de Firestore que lo autorice,
 *    y si esa regla no acota exactamente los campos, cualquiera podría
 *    escribirse `role: "admin"`. La Cloud Function `registrarVisita` ya
 *    existía y hacía justo esto en el servidor, pero nadie la llamaba.
 *
 * 2. SE REGISTRA UNA VEZ POR PANTALLA Y SESION. Antes se escribía en
 *    CADA navegación: solo se evitaba repetir si volvías dos veces
 *    seguidas a la misma pantalla. Ir y volver entre Inicio y Campañas
 *    diez veces generaba veinte escrituras. Además todas caen sobre el
 *    MISMO documento, que en Firestore tiene un límite práctico de
 *    escrituras por segundo -- navegando rápido competían entre ellas.
 *    Contar una vez por sesión reduce el gasto a unas pocas por visita
 *    y, de paso, hace la métrica más honesta: "en cuántas sesiones se
 *    usó esta pantalla" describe mejor cuál es la favorita que un
 *    número inflado por alguien que rebota entre dos pantallas.
 *
 * Es "dispara y olvida": si falla no se avisa. Son datos de uso interno.
 */
export function useRegistrarVisita(uid: string | undefined, pantalla: string) {
  useEffect(() => {
    if (!uid || !cloudFunctions) return;
    if (!PANTALLAS_VALIDAS.has(pantalla)) return;

    const clave = `${uid}:${pantalla}`;
    if (registradasEnEstaSesion.has(clave)) return;
    registradasEnEstaSesion.add(clave);

    void httpsCallable(cloudFunctions, "registrarVisita")({ pantalla })
      .catch(() => {
        // Si no se pudo registrar, se quita de la lista para que un
        // fallo puntual de red no deje esa pantalla sin contar durante
        // toda la sesión.
        registradasEnEstaSesion.delete(clave);
      });
  }, [uid, pantalla]);
}
