import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Reemplazo propio de window.confirm() / window.alert().
 *
 * Por qué existe: los diálogos nativos del navegador rompen por
 * completo el diseño de la app. En iOS (que es donde más se usa esto,
 * como app instalada en la pantalla de inicio) Safari los muestra con
 * el encabezado "vista360player.pe dice…", en la tipografía del
 * sistema y con los botones del sistema -- se ve exactamente igual que
 * el aviso de una página cualquiera, no como una parte de la app. En
 * una app que se presenta como premium ese detalle desentona más que
 * cualquier otro: es el único momento en que el usuario ve algo que no
 * está diseñado.
 *
 * Además, los nativos no se pueden estilar, bloquean el hilo del
 * navegador mientras están abiertos, y no permiten distinguir una
 * acción destructiva (eliminar para siempre) de una normal -- los dos
 * botones se ven idénticos, así que la gente confirma borrados sin
 * registrar del todo qué está aceptando.
 *
 * La API es a propósito casi idéntica a la nativa, para que reemplazar
 * cada llamada sea un cambio de una línea y no una reescritura:
 *
 *   const { confirmar, avisar } = useDialogos();
 *   if (!(await confirmar({ titulo, mensaje }))) return;
 *   await avisar({ titulo, mensaje });
 *
 * Igual que window.confirm, `confirmar` devuelve true/false y espera a
 * que la persona decida; la diferencia es que no congela el navegador
 * mientras tanto.
 */

export interface OpcionesConfirmar {
  titulo: string;
  mensaje?: string;
  /** Texto del botón que confirma. Por defecto "Confirmar". */
  textoConfirmar?: string;
  /** Texto del botón que cancela. Por defecto "Cancelar". */
  textoCancelar?: string;
  /** true para acciones que no se pueden deshacer (eliminar, borrar
   *  definitivamente): pinta el botón de confirmar en rojo y deja el
   *  foco inicial en "Cancelar", no en el botón peligroso. */
  destructivo?: boolean;
}

export interface OpcionesPedirContrasena {
  titulo: string;
  mensaje?: string;
  /** Texto del botón que confirma. Por defecto "Confirmar". */
  textoConfirmar?: string;
}

export interface OpcionesAvisar {
  titulo: string;
  mensaje?: string;
  /** Texto del único botón. Por defecto "Entendido". */
  textoCerrar?: string;
  /** true si el aviso comunica un error (pinta el título en rojo). */
  esError?: boolean;
}

interface ContextoDialogos {
  confirmar: (opciones: OpcionesConfirmar) => Promise<boolean>;
  avisar: (opciones: OpcionesAvisar) => Promise<void>;
  /** Pide la contraseña de la propia cuenta para confirmar una acción
   *  crítica. Devuelve la contraseña escrita, o null si se canceló.
   *
   *  Ojo: quien la llama NO decide con esto si la acción se permite --
   *  la contraseña se le pasa a Firebase (reautenticar()) y es el
   *  backend quien comprueba, en el ID token, que la reautenticación
   *  ocurrió de verdad. Este diálogo es solo la forma de pedirla. */
  pedirContrasena: (opciones: OpcionesPedirContrasena) => Promise<string | null>;
}

const Contexto = createContext<ContextoDialogos | null>(null);

type EstadoDialogo =
  | { tipo: "confirmar"; opciones: OpcionesConfirmar }
  | { tipo: "avisar"; opciones: OpcionesAvisar }
  | { tipo: "contrasena"; opciones: OpcionesPedirContrasena };

export function DialogosProvider({ children }: { children: ReactNode }) {
  const [dialogo, setDialogo] = useState<EstadoDialogo | null>(null);
  // El resolver de la promesa vive en un ref (no en el estado) para
  // poder resolverlo desde el efecto de limpieza: si el provider se
  // desmonta con un diálogo abierto (cierre de sesión, recarga de
  // pantalla), la promesa quedaría colgada para siempre y con ella el
  // `await` de quien la llamó. Resolverla como "cancelado" deja todo
  // cerrado en vez de dejar una función a medio ejecutar.
  const pendienteRef = useRef<((v: boolean | string | null) => void) | null>(null);

  const cerrar = useCallback((valor: boolean | string | null) => {
    const resolver = pendienteRef.current;
    pendienteRef.current = null;
    setDialogo(null);
    resolver?.(valor);
  }, []);

  useEffect(() => {
    return () => {
      pendienteRef.current?.(false);
      pendienteRef.current = null;
    };
  }, []);

  // Escape = cancelar, igual que un diálogo nativo. Se engancha solo
  // mientras hay uno abierto, para no dejar un listener global vivo
  // durante toda la sesión.
  useEffect(() => {
    if (!dialogo) return;
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        cerrar(false);
      }
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [dialogo, cerrar]);

  const api = useMemo<ContextoDialogos>(
    () => ({
      confirmar: (opciones) =>
        new Promise<boolean>((resolve) => {
          // Si ya había uno abierto (dos acciones disparadas casi a la
          // vez), el anterior se cancela en vez de quedar colgado.
          pendienteRef.current?.(false);
          pendienteRef.current = (v) => resolve(v === true);
          setDialogo({ tipo: "confirmar", opciones });
        }),
      avisar: (opciones) =>
        new Promise<void>((resolve) => {
          pendienteRef.current?.(false);
          pendienteRef.current = () => resolve();
          setDialogo({ tipo: "avisar", opciones });
        }),
      pedirContrasena: (opciones) =>
        new Promise<string | null>((resolve) => {
          pendienteRef.current?.(false);
          // La contraseña nunca se guarda en estado de React ni en
          // ningún sitio persistente: viaja del input a quien la pidió y
          // ahí muere. Cancelar (Escape, tocar fuera, botón) resuelve
          // null, no una cadena vacía, para que no se confunda con
          // "escribió una contraseña vacía".
          pendienteRef.current = (v) => resolve(typeof v === "string" ? v : null);
          setDialogo({ tipo: "contrasena", opciones });
        }),
    }),
    []
  );

  return (
    <Contexto.Provider value={api}>
      {children}
      {dialogo && <Dialogo estado={dialogo} onCerrar={cerrar} />}
    </Contexto.Provider>
  );
}

function Dialogo({ estado, onCerrar }: { estado: EstadoDialogo; onCerrar: (v: boolean | string | null) => void }) {
  const [contrasena, setContrasena] = useState("");
  const campoRef = useRef<HTMLInputElement | null>(null);
  const destructivo = estado.tipo === "confirmar" && Boolean(estado.opciones.destructivo);
  const esError = estado.tipo === "avisar" && Boolean(estado.opciones.esError);
  const botonInicialRef = useRef<HTMLButtonElement | null>(null);

  // Foco al abrir: en una acción destructiva el foco arranca en
  // "Cancelar" (así un Enter reflejo NO borra nada); en el resto, en el
  // botón principal, que es lo que la persona va a querer casi siempre.
  useEffect(() => {
    if (estado.tipo === "contrasena") {
      campoRef.current?.focus();
      return;
    }
    botonInicialRef.current?.focus();
  }, [estado.tipo]);

  const { titulo, mensaje } = estado.opciones;

  return (
    <div
      className="dialogo-backdrop"
      role="presentation"
      // Tocar fuera cancela -- mismo gesto que ya tienen los otros
      // modales de la app (foto de perfil, recorte de fotos).
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar(false);
      }}
    >
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        aria-describedby={mensaje ? "dialogo-mensaje" : undefined}
      >
        <div id="dialogo-titulo" className={esError ? "dialogo-titulo es-error" : "dialogo-titulo"}>
          {titulo}
        </div>
        {mensaje && (
          <div id="dialogo-mensaje" className="dialogo-mensaje">
            {mensaje}
          </div>
        )}
        {estado.tipo === "contrasena" && (
          <input
            ref={campoRef}
            type="password"
            // autoComplete="current-password" para que el gestor de
            // contraseñas del navegador la ofrezca; sin esto la gente
            // acaba escribiéndola a mano cada vez y se cansa de la
            // función de seguridad, que es como se terminan quitando.
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && contrasena) onCerrar(contrasena);
            }}
            placeholder="Tu contraseña"
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 12,
              border: "1px solid var(--border)", borderRadius: 12,
              padding: "12px", fontSize: 14,
            }}
          />
        )}
        <div className="dialogo-acciones">
          {(estado.tipo === "confirmar" || estado.tipo === "contrasena") && (
            <button
              type="button"
              className="dialogo-btn secondary"
              ref={destructivo ? botonInicialRef : undefined}
              onClick={() => onCerrar(estado.tipo === "contrasena" ? null : false)}
            >
              {estado.tipo === "contrasena"
                ? "Cancelar"
                : estado.opciones.textoCancelar ?? "Cancelar"}
            </button>
          )}
          <button
            type="button"
            className={destructivo ? "dialogo-btn destructive" : "dialogo-btn primary"}
            ref={destructivo ? undefined : botonInicialRef}
            disabled={estado.tipo === "contrasena" && !contrasena}
            onClick={() => onCerrar(estado.tipo === "contrasena" ? contrasena : true)}
          >
            {estado.tipo === "confirmar"
              ? estado.opciones.textoConfirmar ?? "Confirmar"
              : estado.tipo === "contrasena"
                ? estado.opciones.textoConfirmar ?? "Confirmar"
                : estado.opciones.textoCerrar ?? "Entendido"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Diálogos de la app (reemplazo de window.confirm/alert). Ver el
 *  comentario grande arriba sobre por qué no se usan los nativos. */
export function useDialogos(): ContextoDialogos {
  const ctx = useContext(Contexto);
  if (!ctx) {
    throw new Error("useDialogos() necesita estar dentro de <DialogosProvider>.");
  }
  return ctx;
}
