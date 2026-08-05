import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Foto de la cuenta propia (portalUsers/{uid}.avatarUrl), en vivo.
 *
 * NO ABRE NINGUNA LECTURA. El dato ya viene en el documento que
 * usePortalAuth escucha desde que arranca la sesión -- el mismo
 * portalUsers/{uid} del que saca el rol -- así que aquí solo se
 * reutiliza.
 *
 * Antes cada sitio donde se muestra la foto abría su PROPIA escucha
 * sobre ese mismo documento: el selector de clientes, la barra lateral
 * dentro de un cliente y Mi perfil. Con usePortalAuth ya escuchándolo,
 * eran hasta CUATRO escuchas sobre el mismo documento en una sesión, y
 * cada una se cobra por separado.
 *
 * Sigue siendo en vivo: al cambiar la foto, usePortalAuth recibe el
 * cambio y lo reparte a todos los suscriptores igual que antes.
 */

let uidPublicado = "";
let avatarPublicado = "";
const suscriptores = new Set<(url: string) => void>();

/** La llama usePortalAuth con cada snapshot del documento propio. */
export function publicarAvatarPropio(uid: string, avatarUrl: string): void {
  uidPublicado = uid;
  avatarPublicado = avatarUrl;
  suscriptores.forEach((fn) => fn(avatarUrl));
}

export function useAvatarPropio(uid: string | undefined): string {
  const [avatarUrl, setAvatarUrl] = useState(() =>
    uid && uid === uidPublicado ? avatarPublicado : ""
  );

  useEffect(() => {
    if (!uid || !db) { setAvatarUrl(""); return; }

    // Caso normal: es la cuenta con la sesión abierta, y usePortalAuth ya
    // está escuchando ese documento. Cero lecturas.
    if (uid === uidPublicado) {
      setAvatarUrl(avatarPublicado);
      suscriptores.add(setAvatarUrl);
      return () => { suscriptores.delete(setAvatarUrl); };
    }

    // Respaldo: se pide la foto de OTRO uid (o usePortalAuth todavía no
    // ha publicado nada). Entonces sí hace falta leerlo.
    const unsub = onSnapshot(doc(db, "portalUsers", uid), (snap) => {
      setAvatarUrl((snap.data()?.avatarUrl as string | undefined) ?? "");
    });
    return unsub;
  }, [uid]);

  return avatarUrl;
}
