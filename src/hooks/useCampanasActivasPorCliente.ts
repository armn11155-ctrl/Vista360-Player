import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { hoyEnPeru } from "../utils/fechas";
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

    // AHORRO: solo los contratos que TODAVIA no terminaron.
    //
    // Antes esto escuchaba la colección "contratos" ENTERA, sin filtro:
    // para contar las campañas activas de hoy se leían todos los
    // contratos que hubieran existido jamás, en cada sesión de
    // administrador y otra vez en cada cambio. Una cuenta que solo
    // crece: con los años, abrir el selector de clientes costaría leer
    // miles de documentos que se descartan al instante -- ninguno de
    // ellos puede estar activo, porque terminaron hace años.
    //
    // `fin >= hoy` deja fuera todo el historial cerrado. No cambia el
    // resultado: una campaña activa cumple inicio <= hoy <= fin, así que
    // su fin nunca puede ser anterior a hoy. Lo que se descarta es
    // exactamente lo que el filtro de abajo ya descartaba, pero sin
    // haberlo traído ni pagado.
    //
    // Es un filtro de un solo campo: Firestore lo resuelve con el índice
    // que crea solo, sin añadir nada al despliegue.
    return onSnapshot(
      query(collection(db, "contratos"), where("fin", ">=", hoyEnPeru())),
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
