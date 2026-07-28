import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { estadoCampana, type Contrato } from "../types";

export type ConteoCampanasActivas = Record<string, number>;

/**
 * Cuenta las campañas activas de todos los clientes para ordenar el
 * selector del administrador. Se mantiene en tiempo real: al crear,
 * finalizar o eliminar una campaña, la posición del cliente se ajusta
 * sin tener que recargar la página.
 */
export function useCampanasActivasPorCliente(): ConteoCampanasActivas {
  const [conteo, setConteo] = useState<ConteoCampanasActivas>({});

  useEffect(() => {
    if (!db) {
      setConteo({});
      return;
    }

    return onSnapshot(
      collection(db, "contratos"),
      (snap) => {
        const siguiente: ConteoCampanasActivas = {};

        snap.docs.forEach((documento) => {
          const contrato = documento.data() as Contrato;
          if (contrato.deleted || !contrato.cliente_id || estadoCampana(contrato) !== "Activa") return;
          siguiente[contrato.cliente_id] = (siguiente[contrato.cliente_id] ?? 0) + 1;
        });

        setConteo(siguiente);
      },
      () => setConteo({})
    );
  }, []);

  return conteo;
}
