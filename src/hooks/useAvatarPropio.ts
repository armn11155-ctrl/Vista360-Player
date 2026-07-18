import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Foto de la cuenta admin (portalUsers/{uid}.avatarUrl), en vivo —
 * fuente única para todos los lugares donde se muestra (ícono "Mi
 * perfil" en el selector de cuentas, pantalla Mi perfil admin): al
 * cambiar la foto en uno, el otro se actualiza solo, sin recargar la
 * página, porque los dos escuchan el mismo documento de Firestore.
 */
export function useAvatarPropio(uid: string | undefined): string {
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (!uid || !db) {
      setAvatarUrl("");
      return;
    }
    const unsub = onSnapshot(doc(db, "portalUsers", uid), (snap) => {
      setAvatarUrl((snap.data()?.avatarUrl as string | undefined) ?? "");
    });
    return unsub;
  }, [uid]);

  return avatarUrl;
}
