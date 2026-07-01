interface Props {
  online: boolean;
}

/**
 * Franja fija arriba de la app cuando no hay conexión. Firestore sigue
 * mostrando los últimos datos que tenía en caché (onSnapshot no se cae
 * por perder señal), así que esto es solo un aviso — no bloquea la app,
 * el cliente puede seguir viendo lo que ya cargó.
 */
export default function OfflineBanner({ online }: Props) {
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      Sin conexión — mostrando la última información guardada.
    </div>
  );
}
