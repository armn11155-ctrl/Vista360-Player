interface Props {
  visible: boolean;
  message: string;
  titulo?: string;
}

/**
 * Aviso flotante y elegante que aparece arriba de la pantalla cuando se
 * comparte un PDF por WhatsApp (el mensaje se copia solo al portapapeles,
 * porque WhatsApp no deja poner texto junto a un documento -- ver nota en
 * utils/compartirArchivo.ts). Se queda montado siempre y solo cambia de
 * clase para poder animar tanto la entrada como la salida (a diferencia
 * de mostrar/ocultar con un "if", que no deja animar el cierre).
 */
export default function PremiumToast({ visible, message, titulo = "Mensaje" }: Props) {
  return (
    <div className={`premium-toast-wrap${visible ? " is-visible" : ""}`} aria-live="polite">
      <div className="premium-toast">
        <div className="premium-toast-bar" />
        <div className="premium-toast-head">
          <span className="premium-toast-dot" />
          <span>{titulo}</span>
        </div>
        <div className="premium-toast-body">{message}</div>
      </div>
    </div>
  );
}
