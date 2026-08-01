import { useState, useMemo, useEffect, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import BackChevron from "../BackChevron";
import CampoBusqueda from "../CampoBusqueda";
import { useInvitaciones } from "../../hooks/useInvitaciones";
import type { InvitacionPortal } from "../../hooks/useInvitaciones";
import { BrandThumb } from "../BrandThumb";
import { nombreConocidoPorEmail } from "../../utils/nombresConocidos";
import { saludoPorHora } from "../../utils/fechas";
import { ClientAvatarPicker } from "../ClientAvatarPicker";
import { subirAvatarR2 } from "../../config/r2";
import { cloudFunctions, db } from "../../config/firebase";
import { comprimirAvatarWebp } from "../../utils/comprimirImagen";
import { mensajeDeError } from "../../utils/errores";
import type { Cliente, PersonaInterna } from "../../types";

interface Props {
  onBack: () => void;
  /** true para Gerente (antes "admin" a secas), false para Trabajador.
   *  Un Trabajador puede pedir "Eliminar definitivo" (queda pendiente
   *  de aprobación), pero no archivar/restaurar/restablecer
   *  contraseña ni crear cuentas de Trabajador -- esas siguen siendo
   *  del Gerente en el backend, así que se ocultan acá también para
   *  no mostrar botones que van a fallar con permission-denied. */
  esGerente?: boolean;
}

function fmtFecha(inv: { createdAt?: { toDate: () => Date } | null }): string {
  const d = inv.createdAt?.toDate?.();
  if (!d) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function MenuButton({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", border: "none", background: "transparent", borderRadius: 8,
        padding: "14px 11px", textAlign: "left", fontSize: 12, fontWeight: 800,
        color: disabled ? "#CBD5E1" : danger ? "#DC2626" : "#0F172A",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function MenuLink({ label, href, disabled }: { label: string; href: string; disabled?: boolean }) {
  if (disabled) {
    return <MenuButton label={label} onClick={() => undefined} disabled />;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block", borderRadius: 8, padding: "10px 11px", textAlign: "left",
        fontSize: 12, fontWeight: 800, color: "#0F172A", textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}

export default function Accesos({ onBack, esGerente = true }: Props) {
  const state = useInvitaciones(true);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [accionandoId, setAccionandoId] = useState<string | null>(null);
  const [errorCrear, setErrorCrear] = useState("");

  // ── Crear cliente nuevo (empresa desde cero, no un cliente ya
  // existente) -- formulario aparte, mismo patron que el de arriba. ──
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [nuevaEmpresa, setNuevaEmpresa] = useState("");
  const [nuevoRuc, setNuevoRuc] = useState("");
  const [nuevoSector, setNuevoSector] = useState("");
  const [nuevaCiudad, setNuevaCiudad] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [nuevoContacto, setNuevoContacto] = useState("");
  const [nuevoCelular, setNuevoCelular] = useState("");
  const [nuevoAvatarKey, setNuevoAvatarKey] = useState("tower");
  const [nuevoAvatarUrl, setNuevoAvatarUrl] = useState("");
  const [nuevoSubiendoAvatar, setNuevoSubiendoAvatar] = useState(false);
  const [nuevoCreando, setNuevoCreando] = useState(false);
  const [nuevoError, setNuevoError] = useState("");
  const [nuevoResultado, setNuevoResultado] = useState<{ empresa: string; email: string; password: string } | null>(null);

  // ── Editar cliente ya existente -- mismo formulario de arriba
  // (reusa sus estados nuevoX), pero sin correo/contraseña (esas
  // solo aplican al crear el acceso la primera vez) y guardando con
  // actualizarClienteInfo en vez de crearClienteNuevo. ──
  const [clienteEditandoId, setClienteEditandoId] = useState<string | null>(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const [mensajeOkEdicion, setMensajeOkEdicion] = useState("");

  // ── Restablecer contraseña de un cliente que ya tiene cuenta --
  // Firebase Auth no guarda la contraseña anterior en ningun lado
  // legible, asi que esto genera una nueva y la muestra una vez para
  // que se la pases al cliente (igual que al crear el acceso). ──
  const [reseteandoId, setReseteandoId] = useState<string | null>(null);
  const [resultadoReset, setResultadoReset] = useState<{ nombre: string; email: string; password: string } | null>(null);
  const [errorReset, setErrorReset] = useState("");
  const [avisoPendiente, setAvisoPendiente] = useState("");

  // ── Personal interno (Gerente/Trabajador) -- lectura live desde
  // portalUsers.role, la fuente real de permisos, en vez de depender
  // de las etiquetas GERENTE/TRABAJADOR de más abajo (esas dependen de
  // un campo que se setea a mano y puede quedar desactualizado). Se
  // pidió explícitamente para poder verificar quién tiene el rol de
  // Gerente en cualquier momento. ──
  type PersonalInternoEstado =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; personal: PersonaInterna[] };
  const [personalInterno, setPersonalInterno] = useState<PersonalInternoEstado>({ status: "loading" });

  const cargarPersonalInterno = useCallback(async () => {
    if (!cloudFunctions) {
      setPersonalInterno({ status: "error", message: "Firebase Functions no está configurado." });
      return;
    }
    try {
      const fn = httpsCallable<Record<string, never>, { personal: PersonaInterna[] }>(cloudFunctions, "listarPersonalInterno");
      const res = await fn({});
      setPersonalInterno({ status: "ready", personal: res.data.personal });
    } catch (err) {
      setPersonalInterno({
        status: "error",
        message: mensajeDeError(err, "No se pudo cargar la lista. Si acaba de actualizarse la app, puede que falte desplegar la función en GitHub Actions."),
      });
    }
  }, []);

  useEffect(() => {
    if (esGerente) void cargarPersonalInterno();
  }, [esGerente, cargarPersonalInterno]);

  // ── Crear cuenta de Trabajador (solo Gerente) -- mismo patrón que
  // "crear cliente" de arriba, pero sin empresa/RUC/avatar: un
  // Trabajador es cuenta interna, no un cliente. ──
  const [mostrarFormTrabajador, setMostrarFormTrabajador] = useState(false);
  const [nuevoTrabajadorNombre, setNuevoTrabajadorNombre] = useState("");
  const [nuevoTrabajadorEmail, setNuevoTrabajadorEmail] = useState("");
  const [nuevoTrabajadorPassword, setNuevoTrabajadorPassword] = useState("");
  const [creandoTrabajador, setCreandoTrabajador] = useState(false);
  const [errorTrabajador, setErrorTrabajador] = useState("");
  const [resultadoTrabajador, setResultadoTrabajador] = useState<{ nombre: string; email: string; password: string } | null>(null);

  function limpiarFormTrabajador() {
    setNuevoTrabajadorNombre("");
    setNuevoTrabajadorEmail("");
    setNuevoTrabajadorPassword("");
    setErrorTrabajador("");
    setResultadoTrabajador(null);
  }

  function toggleFormTrabajador() {
    if (mostrarFormTrabajador) {
      setMostrarFormTrabajador(false);
      limpiarFormTrabajador();
    } else {
      limpiarFormTrabajador();
      setMostrarFormTrabajador(true);
    }
  }

  async function crearTrabajador() {
    if (!cloudFunctions) {
      setErrorTrabajador("Firebase Functions no está configurado.");
      return;
    }
    if (!nuevoTrabajadorNombre.trim()) {
      setErrorTrabajador("Escribe el nombre del trabajador.");
      return;
    }
    if (!nuevoTrabajadorEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoTrabajadorEmail.trim())) {
      setErrorTrabajador("El correo no es válido. Revisa que esté bien escrito (ejemplo: nombre@correo.com).");
      return;
    }
    setCreandoTrabajador(true);
    setErrorTrabajador("");
    setResultadoTrabajador(null);
    try {
      const fn = httpsCallable<
        { nombre: string; email: string; password?: string },
        { uid: string; nombre: string; email: string; password: string }
      >(cloudFunctions, "crearTrabajadorAcceso");
      const res = await fn({
        nombre: nuevoTrabajadorNombre.trim(),
        email: nuevoTrabajadorEmail.trim(),
        password: nuevoTrabajadorPassword.trim() || undefined,
      });
      setResultadoTrabajador(res.data);
      void cargarPersonalInterno();
    } catch (err) {
      setErrorTrabajador(err instanceof Error ? err.message : "No se pudo crear la cuenta de trabajador.");
    } finally {
      setCreandoTrabajador(false);
    }
  }

  const mensajeAccesoTrabajador = resultadoTrabajador
    ? [
        `${saludoPorHora()} ${resultadoTrabajador.nombre}, te mando tu acceso a Vista360 Player.`,
        "",
        "Ya puedes entrar como parte del equipo interno.",
        "",
        `Portal: ${window.location.origin}`,
        `Correo: ${resultadoTrabajador.email}`,
        `Contraseña temporal: ${resultadoTrabajador.password}`,
        "",
        "Por seguridad, te recomendamos cambiar la contraseña después del primer ingreso.",
      ].join("\n")
    : "";

  async function subirAvatarNuevo(file: File) {
    setNuevoSubiendoAvatar(true);
    setNuevoError("");
    try {
      const webp = await comprimirAvatarWebp(file);
      const { key: url } = await subirAvatarR2(webp);
      setNuevoAvatarUrl(url);
    } catch (err) {
      setNuevoError(err instanceof Error ? err.message : "No se pudo preparar el avatar.");
    } finally {
      setNuevoSubiendoAvatar(false);
    }
  }

  function limpiarFormNuevo() {
    setClienteEditandoId(null);
    setNuevaEmpresa("");
    setNuevoRuc("");
    setNuevoSector("");
    setNuevaCiudad("");
    setNuevoEmail("");
    setNuevoPassword("");
    setNuevoContacto("");
    setNuevoCelular("");
    setNuevoAvatarKey("tower");
    setNuevoAvatarUrl("");
    setNuevoError("");
    setNuevoResultado(null);
    setMensajeOkEdicion("");
  }

  function toggleFormNuevo() {
    if (mostrarFormNuevo) {
      setMostrarFormNuevo(false);
      limpiarFormNuevo();
    } else {
      limpiarFormNuevo();
      setMostrarFormNuevo(true);
    }
  }

  async function abrirEdicionUsuario(inv: InvitacionPortal) {
    if (!inv.clienteId) {
      setErrorCrear("Este usuario no tiene un cliente asociado para editar.");
      return;
    }
    setMenuAbierto(null);
    setErrorCrear("");
    limpiarFormNuevo();
    setClienteEditandoId(inv.clienteId);
    setMostrarFormNuevo(true);
    setCargandoEdicion(true);
    try {
      if (db) {
        const snap = await getDoc(doc(db, "clientes", inv.clienteId));
        const data = snap.data() as Partial<Cliente> | undefined;
        setNuevaEmpresa(data?.empresa ?? inv.clienteNombre ?? "");
        setNuevoRuc(data?.ruc ?? "");
        setNuevoSector(data?.sector ?? "");
        setNuevaCiudad(data?.ciudad ?? "");
        setNuevoContacto(data?.contacto ?? "");
        setNuevoCelular(data?.celular ?? "");
        setNuevoAvatarKey(data?.avatarKey || inv.avatarKey || "tower");
        setNuevoAvatarUrl(data?.avatarUrl || inv.avatarUrl || "");
      }
    } catch (err) {
      setNuevoError(err instanceof Error ? err.message : "No se pudo cargar la información del cliente.");
    } finally {
      setCargandoEdicion(false);
    }
  }

  async function guardarClienteNuevo() {
    if (!cloudFunctions) {
      setNuevoError("Firebase Functions no está configurado.");
      return;
    }
    if (!nuevaEmpresa.trim()) {
      setNuevoError("Escribe el nombre de la empresa.");
      return;
    }
    if (!clienteEditandoId) {
      if (!nuevoEmail.trim()) {
        setNuevoError("Escribe el correo del usuario.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoEmail.trim())) {
        setNuevoError("El correo no es válido. Revisa que esté bien escrito (ejemplo: nombre@correo.com).");
        return;
      }
    }
    setNuevoCreando(true);
    setNuevoError("");
    setNuevoResultado(null);
    setMensajeOkEdicion("");
    try {
      if (clienteEditandoId) {
        const fn = httpsCallable<
          { clienteId: string; empresa: string; ruc: string; sector: string; ciudad: string; contacto: string; celular: string; avatarKey: string; avatarUrl: string },
          { ok: boolean }
        >(cloudFunctions, "actualizarClienteInfo");
        await fn({
          clienteId: clienteEditandoId,
          empresa: nuevaEmpresa.trim(),
          ruc: nuevoRuc.trim(),
          sector: nuevoSector.trim(),
          ciudad: nuevaCiudad.trim(),
          contacto: nuevoContacto.trim(),
          celular: nuevoCelular.trim(),
          avatarKey: nuevoAvatarKey,
          avatarUrl: nuevoAvatarUrl,
        });
        setMensajeOkEdicion("Cliente actualizado.");
        setMostrarFormNuevo(false);
        limpiarFormNuevo();
      } else {
        const fn = httpsCallable<
          { empresa: string; ruc: string; sector: string; ciudad: string; email: string; password: string; contacto: string; celular: string; avatarKey: string; avatarUrl: string },
          { clienteId: string; empresa: string; email: string; password: string }
        >(cloudFunctions, "crearClienteNuevo");
        const res = await fn({
          empresa: nuevaEmpresa.trim(),
          ruc: nuevoRuc.trim(),
          sector: nuevoSector.trim(),
          ciudad: nuevaCiudad.trim(),
          email: nuevoEmail.trim(),
          password: nuevoPassword.trim(),
          contacto: nuevoContacto.trim(),
          celular: nuevoCelular.trim(),
          avatarKey: nuevoAvatarKey,
          avatarUrl: nuevoAvatarUrl,
        });
        setNuevoResultado(res.data);
      }
    } catch (err) {
      setNuevoError(err instanceof Error ? err.message : (clienteEditandoId ? "No se pudo guardar los cambios del cliente." : "No se pudo crear el cliente."));
    } finally {
      setNuevoCreando(false);
    }
  }

  const mensajeAccesoNuevo = nuevoResultado
    ? [
        `${saludoPorHora()} ${nuevoContacto || nuevoResultado.empresa}, te mando tu acceso a Vista360 Player.`,
        "",
        "Ya puedes entrar a tu portal para ver campañas, cobertura, reportes y descargas.",
        "",
        `Portal: ${window.location.origin}`,
        `Correo: ${nuevoResultado.email}`,
        `Contraseña temporal: ${nuevoResultado.password}`,
        "",
        "Por seguridad, te recomendamos cambiar la contraseña después del primer ingreso.",
      ].join("\n")
    : "";

  async function copiar(id: string, link: string) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId((c) => (c === id ? null : c)), 2000);
    } catch {
      // si falla el portapapeles, igual queda el link visible para seleccionar a mano
    }
  }

  const invitaciones = state.status === "ready" ? state.invitaciones : [];
  const usuariosActivos = invitaciones.filter((inv) => !inv.archived);
  const usuariosArchivados = invitaciones.filter((inv) => !!inv.archived);
  const usuariosDelTab = tab === "activos" ? usuariosActivos : usuariosArchivados;
  const [busqueda, setBusqueda] = useState("");

  // Las cuentas de Trabajador en invitacionesPortal nunca guardaron un
  // nombre (crearTrabajadorAcceso solo guarda uid/email/esTrabajador
  // ahí -- el nombre real vive en portalUsers), así que esta lista
  // caía siempre al correo para ellas. "Personal interno" (más arriba
  // en esta misma pantalla) ya trae el nombre real desde portalUsers
  // vía listarPersonalInterno -- se reusa ese resultado acá como
  // segundo intento antes de resignarse al correo.
  const nombrePorUid = useMemo(() => {
    const mapa: Record<string, string> = {};
    if (personalInterno.status === "ready") {
      for (const p of personalInterno.personal) {
        if (p.uid && p.nombre) mapa[p.uid] = p.nombre;
      }
    }
    return mapa;
  }, [personalInterno]);
  function nombreDeUsuario(inv: InvitacionPortal) {
    return inv.clienteNombre || (inv.uid && nombrePorUid[inv.uid]) || inv.email;
  }
  // Por empresa, contacto y correo: son las tres formas en que uno se
  // acuerda de un cliente cuando la lista ya no cabe en una pantalla.
  const usuariosVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuariosDelTab;
    return usuariosDelTab.filter((u) =>
      [u.clienteNombre, u.email, u.uid ? nombrePorUid[u.uid] : undefined, (u as { contacto?: string }).contacto]
        .some((campo) => String(campo ?? "").toLowerCase().includes(q))
    );
  }, [usuariosDelTab, busqueda, nombrePorUid]);


  async function administrarUsuario(inv: InvitacionPortal, accion: "archivar" | "restaurar" | "eliminar") {
    if (!cloudFunctions) {
      setErrorCrear("Firebase Functions no está configurado.");
      return;
    }

    const nombre = nombreDeUsuario(inv);
    const confirmado =
      accion === "archivar"
        ? window.confirm(`¿Seguro que quieres archivar el usuario de ${nombre}? No podrá entrar hasta que lo restaures.`)
        : accion === "eliminar"
          ? window.confirm(
              esGerente
                ? `¿Seguro que quieres eliminar definitivamente el usuario de ${nombre}? Esta acción no se puede deshacer.`
                : `¿Pedirle a tu Gerente que elimine definitivamente el usuario de ${nombre}? Quedará pendiente de su aprobación.`
            )
          : true;
    if (!confirmado) return;

    setAccionandoId(inv.id);
    setMenuAbierto(null);
    setErrorCrear("");
    setAvisoPendiente("");
    try {
      const fn = httpsCallable<
        { invitacionId: string; uid?: string; email: string; accion: "archivar" | "restaurar" | "eliminar" },
        { ok: boolean; pendiente?: boolean }
      >(cloudFunctions, "administrarUsuarioPortal");
      const res = await fn({ invitacionId: inv.id, uid: inv.uid, email: inv.email, accion });
      if (res.data.pendiente) {
        setAvisoPendiente(`Enviado a tu Gerente para aprobación: eliminar el acceso de ${nombre}.`);
      } else if (esGerente) {
        void cargarPersonalInterno();
      }
    } catch (err) {
      setErrorCrear(err instanceof Error ? err.message : "No se pudo actualizar el usuario.");
    } finally {
      setAccionandoId(null);
    }
  }

  async function restablecerPassword(inv: InvitacionPortal) {
    if (!cloudFunctions) {
      setErrorCrear("Firebase Functions no está configurado.");
      return;
    }
    const nombre = nombreDeUsuario(inv);
    const confirmado = window.confirm(
      `¿Generar una contraseña nueva para ${nombre}? La contraseña actual dejará de funcionar de inmediato.`
    );
    if (!confirmado) return;

    setReseteandoId(inv.id);
    setMenuAbierto(null);
    setErrorReset("");
    try {
      const fn = httpsCallable<
        { uid?: string; email: string },
        { email: string; password: string }
      >(cloudFunctions, "restablecerPasswordCliente");
      const res = await fn({ uid: inv.uid, email: inv.email });
      setResultadoReset({
        nombre,
        email: res.data.email || inv.email,
        password: res.data.password,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code.includes("not-found")) {
        setErrorReset("No se encontró ese usuario.");
      } else if (code.includes("permission-denied")) {
        setErrorReset("No tienes permiso para hacer esto.");
      } else if (code.includes("internal") || code.includes("unavailable") || !code) {
        setErrorReset("No se pudo restablecer la contraseña. Intenta de nuevo en un momento.");
      } else {
        setErrorReset(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
      }
    } finally {
      setReseteandoId(null);
    }
  }

  return (
    <div className="admin-tool-screen accesos-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Usuarios</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        {esGerente && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
              Personal interno
            </div>
            {personalInterno.status === "loading" && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Cargando…</div>
            )}
            {personalInterno.status === "error" && (
              <div style={{ fontSize: 12, color: "var(--red)" }}>{personalInterno.message}</div>
            )}
            {personalInterno.status === "ready" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {personalInterno.personal.map((p) => {
                  const nombreMostrado = p.nombre || nombreConocidoPorEmail(p.email) || p.email;
                  return (
                  <div key={p.uid} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <BrandThumb name={nombreMostrado} avatarUrl={p.avatarUrl} size={36} radius={10} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nombreMostrado}
                      </div>
                      <div
                        style={{
                          fontSize: 11, fontWeight: 700, marginTop: 1,
                          color: p.role === "Gerente" ? "#0B3F8A" : "#6D28D9",
                        }}
                      >
                        {p.role}{p.archived ? " · archivado" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.email}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { id: "activos" as const, label: "Activos", count: usuariosActivos.length },
            { id: "archivados" as const, label: "Archivados", count: usuariosArchivados.length },
          ].map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={{
                  border: active ? "1px solid #0877FF" : "1px solid #E5E7EB",
                  background: active ? "rgba(8,119,255,0.09)" : "#fff",
                  color: active ? "#0877FF" : "#64748B",
                  borderRadius: 12,
                  minHeight: 42,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {item.label} <span style={{ color: active ? "#0B3F8A" : "#64748B" }}>{item.count}</span>
              </button>
            );
          })}
        </div>

        <div className="accesos-create-btn-row" style={{ margin: "12px 0", display: "flex", gap: 8 }}>
          <button
            className="accesos-create-btn"
            onClick={toggleFormNuevo}
            style={{
              flex: 1, background: mostrarFormNuevo ? "#0B1220" : "#0877FF", color: "#fff",
              border: "none", borderRadius: 12, padding: "14px", fontSize: 12,
              fontWeight: 800, cursor: "pointer",
            }}
          >
            {mostrarFormNuevo ? "Cerrar formulario" : "+ Crear cliente"}
          </button>
          {esGerente && (
            <button
              className="accesos-create-btn"
              onClick={toggleFormTrabajador}
              style={{
                flex: 1, background: mostrarFormTrabajador ? "#0B1220" : "#6D28D9", color: "#fff",
                border: "none", borderRadius: 12, padding: "14px", fontSize: 12,
                fontWeight: 800, cursor: "pointer",
              }}
            >
              {mostrarFormTrabajador ? "Cerrar formulario" : "+ Crear trabajador"}
            </button>
          )}
        </div>

        {mostrarFormTrabajador && esGerente && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 2 }}>
              Cuenta de trabajador
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
              Un Trabajador puede gestionar campañas, clientes y reportes libremente. Las acciones
              sensibles (eliminar algo, crear o editar paneles) quedan pendientes de tu aprobación.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <input value={nuevoTrabajadorNombre} onChange={(e) => setNuevoTrabajadorNombre(e.target.value)} placeholder="Nombre del trabajador" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              <input value={nuevoTrabajadorEmail} onChange={(e) => setNuevoTrabajadorEmail(e.target.value)} placeholder="Correo del trabajador" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              <input value={nuevoTrabajadorPassword} onChange={(e) => setNuevoTrabajadorPassword(e.target.value)} placeholder="Contraseña inicial (opcional)" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
            </div>
            {errorTrabajador && (
              <div style={{ color: "#DC2626", fontSize: 12, marginTop: 10 }}>{errorTrabajador}</div>
            )}
            <button
              onClick={crearTrabajador}
              disabled={creandoTrabajador}
              style={{ width: "100%", marginTop: 12, background: creandoTrabajador ? "#C4B5FD" : "#0B1220", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, cursor: creandoTrabajador ? "not-allowed" : "pointer" }}
            >
              {creandoTrabajador ? "Creando..." : "Crear trabajador y acceso"}
            </button>
            {resultadoTrabajador && (
              <div style={{ marginTop: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 800, marginBottom: 8 }}>Trabajador creado</div>
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--text)", lineHeight: 1.45 }}>{mensajeAccesoTrabajador}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={`https://wa.me/?text=${encodeURIComponent(mensajeAccesoTrabajador)}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: "#22C55E", color: "#fff", borderRadius: 12, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>WhatsApp</a>
                  <a href={`mailto:${resultadoTrabajador.email}?subject=${encodeURIComponent("Acceso a Vista360 Player")}&body=${encodeURIComponent(mensajeAccesoTrabajador)}`} style={{ flex: 1, textAlign: "center", background: "#0877FF", color: "#fff", borderRadius: 12, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>Correo</a>
                </div>
              </div>
            )}
          </div>
        )}
        {errorCrear && (
          <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 10 }}>{errorCrear}</div>
        )}
        {avisoPendiente && (
          <div style={{ color: "#6D28D9", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{avisoPendiente}</div>
        )}
        {mensajeOkEdicion && !mostrarFormNuevo && (
          <div style={{ color: "#16A34A", fontSize: 12, fontWeight: 800, marginBottom: 10 }}>{mensajeOkEdicion}</div>
        )}

        {mostrarFormNuevo && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 2 }}>
              {clienteEditandoId ? "Editar cliente" : "Cliente nuevo"}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
              {clienteEditandoId ? "Actualiza la información de la empresa." : "Crea la empresa y su acceso al portal en un solo paso."}
            </div>
            {cargandoEdicion && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Cargando datos del cliente...</div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              <input value={nuevaEmpresa} onChange={(e) => setNuevaEmpresa(e.target.value)} placeholder="Nombre de la empresa" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={nuevoRuc} onChange={(e) => setNuevoRuc(e.target.value)} placeholder="RUC (opcional)" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
                <input value={nuevaCiudad} onChange={(e) => setNuevaCiudad(e.target.value)} placeholder="Ciudad (opcional)" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              </div>
              <input value={nuevoSector} onChange={(e) => setNuevoSector(e.target.value)} placeholder="Sector (opcional)" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              {!clienteEditandoId && (
                <>
                  <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
                  <input value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} placeholder="Correo del usuario" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
                  <input value={nuevoPassword} onChange={(e) => setNuevoPassword(e.target.value)} placeholder="Contraseña inicial (opcional)" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
                </>
              )}
              <input value={nuevoContacto} onChange={(e) => setNuevoContacto(e.target.value)} placeholder="Nombre/contacto" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              <input value={nuevoCelular} onChange={(e) => setNuevoCelular(e.target.value)} placeholder="WhatsApp" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", boxSizing: "border-box" }} />
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800, marginBottom: 8 }}>Avatar del cliente</div>
                <ClientAvatarPicker
                  name={nuevaEmpresa || nuevoContacto || nuevoEmail || "Cliente"}
                  value={nuevoAvatarKey}
                  onChange={(value) => {
                    setNuevoAvatarKey(value);
                    setNuevoAvatarUrl("");
                  }}
                  avatarUrl={nuevoAvatarUrl}
                  onAvatarFile={(file) => void subirAvatarNuevo(file)}
                  uploading={nuevoSubiendoAvatar}
                />
              </div>
            </div>
            {nuevoError && (
              <div style={{ color: "#DC2626", fontSize: 12, marginTop: 10 }}>{nuevoError}</div>
            )}
            <button
              onClick={guardarClienteNuevo}
              disabled={nuevoCreando || nuevoSubiendoAvatar || cargandoEdicion}
              style={{ width: "100%", marginTop: 12, background: nuevoCreando || nuevoSubiendoAvatar || cargandoEdicion ? "#93C5FD" : "#0B1220", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, cursor: nuevoCreando || nuevoSubiendoAvatar || cargandoEdicion ? "not-allowed" : "pointer" }}
            >
              {nuevoCreando
                ? (clienteEditandoId ? "Guardando..." : "Creando...")
                : nuevoSubiendoAvatar
                  ? "Preparando avatar..."
                  : cargandoEdicion
                    ? "Cargando..."
                    : clienteEditandoId
                      ? "Guardar cambios"
                      : "Crear cliente y acceso"}
            </button>
            {!clienteEditandoId && nuevoResultado && (
              <div style={{ marginTop: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 800, marginBottom: 8 }}>Cliente creado</div>
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--text)", lineHeight: 1.45 }}>{mensajeAccesoNuevo}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={`https://wa.me/${nuevoCelular.replace(/\D/g, "")}?text=${encodeURIComponent(mensajeAccesoNuevo)}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: "#22C55E", color: "#fff", borderRadius: 12, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>WhatsApp</a>
                  <a href={`mailto:${nuevoResultado.email}?subject=${encodeURIComponent("Acceso a Vista360 Player")}&body=${encodeURIComponent(mensajeAccesoNuevo)}`} style={{ flex: 1, textAlign: "center", background: "#0877FF", color: "#fff", borderRadius: 12, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>Correo</a>
                </div>
              </div>
            )}
          </div>
        )}

        {state.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}
        {state.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {state.message}
          </div>
        )}
        {state.status === "ready" && usuariosDelTab.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            {tab === "activos" ? "Aún no hay usuarios activos." : "No hay usuarios archivados."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {usuariosDelTab.length > 0 && (
            <CampoBusqueda
              valor={busqueda}
              onCambio={setBusqueda}
              placeholder="Buscar por empresa, contacto o correo"
              resultados={usuariosVisibles.length}
            />
          )}
          {usuariosVisibles.map((inv) => {
            const yaCopiado = copiadoId === inv.id;
            const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
              `Hola, aquí tienes tu acceso a Vista360 Player. Crea tu contraseña con este link: ${inv.link}`
            )}`;
            return (
              <div
                className="card"
                key={inv.id}
                onClick={() => void abrirEdicionUsuario(inv)}
                style={{ padding: 12, position: "relative", cursor: inv.clienteId ? "pointer" : "default" }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <BrandThumb name={nombreDeUsuario(inv)} avatarKey={inv.avatarKey} avatarUrl={inv.avatarUrl} size={42} radius={12} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <span>{nombreDeUsuario(inv)}</span>
                      {inv.esAdmin && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#0B3F8A", padding: "3px 8px", borderRadius: 20, letterSpacing: ".02em" }}>
                          GERENTE
                        </span>
                      )}
                      {inv.esTrabajador && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#6D28D9", padding: "3px 8px", borderRadius: 20, letterSpacing: ".02em" }}>
                          TRABAJADOR
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{inv.email}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{fmtFecha(inv)}</div>
                  </div>
                  {inv.clienteId && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuAbierto((id) => id === inv.id ? null : inv.id); }}
                    style={{
                      width: 34, height: 34, borderRadius: 16, border: "1px solid #E5E7EB",
                      background: "#fff", color: "#64748B", fontSize: 19, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", flexShrink: 0, lineHeight: 1,
                    }}
                    aria-label="Opciones del usuario"
                  >
                    ⋯
                  </button>
                </div>
                {accionandoId === inv.id && (
                  <div style={{ marginTop: 9, fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                    Actualizando...
                  </div>
                )}
                {reseteandoId === inv.id && (
                  <div style={{ marginTop: 9, fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                    Generando contraseña nueva...
                  </div>
                )}
                {yaCopiado && (
                  <div style={{ marginTop: 9, fontSize: 11, color: "#16A34A", fontWeight: 800 }}>
                    Link copiado
                  </div>
                )}
                {menuAbierto === inv.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", top: 52, right: 12, zIndex: 20, minWidth: 178,
                      background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                      boxShadow: "0 18px 38px rgba(15,23,42,0.16)", padding: 6,
                    }}
                  >
                    {tab === "activos" ? (
                      <>
                        <MenuButton label="Copiar link" onClick={() => copiar(inv.id, inv.link)} disabled={!inv.link} />
                        <MenuLink label="Enviar por WhatsApp" href={whatsappHref} disabled={!inv.link} />
                        {esGerente && (
                          <MenuButton label="Restablecer contraseña" onClick={() => void restablecerPassword(inv)} />
                        )}
                        {esGerente && (
                          <MenuButton label="Archivar usuario" danger onClick={() => administrarUsuario(inv, "archivar")} />
                        )}
                        {!esGerente && (
                          <MenuButton label="Eliminar (pedir aprobación)" danger onClick={() => administrarUsuario(inv, "eliminar")} />
                        )}
                      </>
                    ) : (
                      <>
                        {esGerente && (
                          <MenuButton label="Restaurar usuario" onClick={() => administrarUsuario(inv, "restaurar")} />
                        )}
                        <MenuButton label={esGerente ? "Eliminar definitivo" : "Eliminar (pedir aprobación)"} danger onClick={() => administrarUsuario(inv, "eliminar")} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {errorReset && !resultadoReset && (
        <div
          onClick={() => setErrorReset("")}
          style={{
            position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 500,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px",
              width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)", boxSizing: "border-box",
            }}
          >
            <div style={{ color: "#DC2626", fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{errorReset}</div>
            <button
              onClick={() => setErrorReset("")}
              style={{ width: "100%", padding: "13px", background: "#0B1220", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {resultadoReset && (
        <div
          onClick={() => setResultadoReset(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 500,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px",
              width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)", boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
              Contraseña restablecida
            </div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 14 }}>
              La contraseña anterior de <strong style={{ color: "#0B1220" }}>{resultadoReset.nombre}</strong> ya no funciona. Comparte esta nueva con el cliente.
            </div>
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Correo</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{resultadoReset.email}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Contraseña nueva</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{resultadoReset.password}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${saludoPorHora()} ${resultadoReset.nombre}, te confirmamos que tu contraseña de Vista360 Player fue restablecida.

Correo: ${resultadoReset.email}
Contraseña nueva: ${resultadoReset.password}

Por seguridad, te recomendamos cambiarla después de entrar (Perfil > Cambiar contraseña).`
                )}`}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1, textAlign: "center", background: "#22C55E", color: "#fff", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}
              >
                WhatsApp
              </a>
              <button
                onClick={() => setResultadoReset(null)}
                style={{ flex: 1, background: "#0B1220", color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
