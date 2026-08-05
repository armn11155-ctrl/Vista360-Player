import { useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

/**
 * Anota que esta persona entró (fecha del último acceso y cuántas veces
 * ha entrado). Alimenta la pantalla de Analítica del admin.
 *
 * PASA POR CLOUD FUNCTION, NO ESCRIBE DIRECTO. Antes esto hacía un
 * updateDoc del navegador sobre portalUsers/{uid}. El problema es que en
 * ESE MISMO documento vive el campo `role`, que es de donde la app saca
 * si alguien es cliente, trabajador o gerente (ver usePortalAuth). Para
 * que el navegador pudiera escribir ahí, las reglas de Firestore tienen
 * que permitirle actualizar su propio portalUsers -- y si esa regla no
 * acota exactamente qué campos, cualquiera con la consola del navegador
 * abierta podría escribirse `role: "admin"` y entrar como administrador.
 *
 * La Cloud Function `registrarAcceso` ya existía y hacía exactamente
 * esto del lado del servidor, pero nadie la llamaba: quedó a medio
 * migrar. Ahora se usa, y con eso las reglas pueden prohibir por
 * completo que el cliente escriba en portalUsers, que es lo correcto.
 *
 * Es "dispara y olvida": si falla, no se le dice nada a la persona. Son
 * datos de uso interno; que no se registre una visita no debe molestar
 * a nadie ni bloquear la pantalla.
 */
export function useRegistrarAcceso(uid: string | undefined) {
  const yaRegistrado = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !cloudFunctions) return;
    if (yaRegistrado.current === uid) return;
    yaRegistrado.current = uid;

    void httpsCallable(cloudFunctions, "registrarAcceso")()
      .catch(() => {
        /* estadística interna: si no se registra, no pasa nada */
      });
  }, [uid]);
}
