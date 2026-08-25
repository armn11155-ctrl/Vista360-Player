import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useSelectorDeClientes } from "../hooks/useClientesAdmin";
import { useSignedUrls } from "../hooks/useSignedUrls";
import { useAvatarPropio } from "../hooks/useAvatarPropio";
import { useSolicitudesPendientes } from "../hooks/useSolicitudesCampana";
import { usePushEstado } from "../hooks/usePushEstado";
import { cloudFunctions, logout } from "../config/firebase";
import type { Cliente } from "../types";
import { brandColor } from "../utils/brandColor";
import { filtrarClientes, ordenarClientesPorCampanasActivas } from "../utils/clientPicker";
import { ClientAvatar } from "./ClientAvatar";
import { useDialogos } from "./DialogosProvider";
import { conReautenticacion } from "../config/reautenticacion";

const SIN_CLIENTES: Cliente[] = [];

interface Props {
  onSelect: (clienteId: string) => void;
  onOpenUsuarios?: () => void;
  onOpenSolicitudes?: () => void;
  onOpenAnalitica?: () => void;
  onOpenPerfil?: () => void;
  onOpenPaneles?: () => void;
  /** Solo se muestra si esGerente es true -- un Trabajador no ve la
   *  tarjeta ni puede llegar a esta pantalla. */
  onOpenAprobaciones?: () => void;
  onOpenPapelera?: () => void;
  /** true para la cuenta Gerente (antes "admin" a secas), false para
   *  un Trabajador. Ver el comentario grande sobre roles en App.tsx. */
  esGerente?: boolean;
  adminIniciales?: string;
  /** Para mostrar la foto real (no solo iniciales) en el ícono "Mi perfil". */
  uid?: string;
  vistaClienteActiva?: boolean;
  onToggleVistaCliente?: () => void;
  /** true cuando se vuelve desde Usuarios/Solicitudes/Analítica/Paneles
   *  con el botón de "atrás" -- pedido explícito: como este componente
   *  se desmonta por completo mientras se ve cualquiera de esas
   *  pantallas (App.tsx las renderiza en una rama separada), "Centro
   *  de gestión" siempre se perdía y volver acá caía en la selección
   *  de clientes de cero. Con esto se reabre directo en Centro de
   *  gestión, que es de donde salió. */
  onOpenOcupacion?: () => void;
  onOpenCotizaciones?: () => void;
  gestionInicial?: boolean;
  onGestionInicialConsumida?: () => void;
}

/**
 * Selector de cuenta del admin — perfiles editoriales: la fotografía es
 * la superficie principal y el nombre vive sobre un degradado legible.
 * Grid responsivo: dos columnas en móvil y tres en escritorio.
 */
export default function AdminClientPicker({ onSelect, onOpenUsuarios, onOpenSolicitudes, onOpenAnalitica, onOpenPerfil, onOpenPaneles, onOpenOcupacion, onOpenCotizaciones, onOpenAprobaciones, onOpenPapelera, esGerente = true, adminIniciales, uid, vistaClienteActiva = false, onToggleVistaCliente, gestionInicial = false, onGestionInicialConsumida }: Props) {
  const { confirmar, avisar, pedirContrasena, notificar } = useDialogos();
  // El botón de activar notificaciones vive acá (al costado del perfil
  // del admin), no solo dentro de la vista de un cliente -- antes,
  // como esto solo se manejaba adentro de AuthenticatedApp, cada vez
  // que el admin entraba a ver un cliente distinto se volvía a montar
  // ese componente y se repetía el registro. Ahora es un solo lugar
  // fijo, ligado a la cuenta del admin, sin importar qué cliente esté
  // viendo (o si no está viendo ninguno).
  const { estado: estadoPush, error: errorPush, activar: activarPush } = usePushEstado(uid);
  // Una sola fuente para la lista Y el contador de campañas activas:
  // los dos salen del mismo documento agregado, así que no hay dos
  // consultas ni pueden desincronizarse entre sí.
  const { state, campanasActivas: campanasActivasPorCliente } = useSelectorDeClientes();
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [menuCliente, setMenuCliente] = useState<Cliente | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState("");
  // Se recuerda la URL exacta que falló, no solo el cliente. Así una URL
  // firmada vencida puede renovarse y volver a intentar; antes el cliente
  // quedaba sin foto durante todo el montaje aunque ya hubiera una URL nueva.
  const [avataresFallidos, setAvataresFallidos] = useState<Map<string, string>>(new Map());
  const [miAvatarFallo, setMiAvatarFallo] = useState(false);
  const [gestionAbierta, setGestionAbierta] = useState(() => gestionInicial);
  const [soloConCampana, setSoloConCampana] = useState(false);
  // Se consume una sola vez al montar -- el valor ya quedó capturado
  // arriba como estado inicial, así que esto solo le avisa al padre
  // que ya lo puede volver a poner en false (si no, la próxima vez
  // que se entre a Selección de clientes por otro camino distinto se
  // abriría Centro de gestión sin que tenga sentido).
  useEffect(() => {
    if (gestionInicial) onGestionInicialConsumida?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Solo las pendientes: el badge es un numero. Cargar tambien las 50
  // resueltas costaba 50 documentos por inicio de sesion para pintar
  // un digito en un circulo rojo.
  const solicitudesState = useSolicitudesPendientes(true);
  const solicitudesPendientes = solicitudesState.status === "ready"
    ? solicitudesState.solicitudes.length
    : 0;
  const clientes: Cliente[] = state.status === "ready" ? state.clientes : SIN_CLIENTES;
  const activos = useMemo(
    () => ordenarClientesPorCampanasActivas(
      clientes.filter((cliente) => !cliente.archived),
      campanasActivasPorCliente,
    ),
    [campanasActivasPorCliente, clientes],
  );
  const archivados = useMemo(() => clientes.filter((cliente) => !!cliente.archived), [clientes]);
  const visibles = tab === "activos" ? activos : archivados;
  const filtradosPorTexto = filtrarClientes(visibles, busqueda);
  const filtrados = soloConCampana && tab === "activos"
    ? filtradosPorTexto.filter((cliente) => (campanasActivasPorCliente[cliente.id] ?? 0) > 0)
    : filtradosPorTexto;
  const cuentasConCampana = activos.filter((cliente) => (campanasActivasPorCliente[cliente.id] ?? 0) > 0);

  // Con muchos clientes la grilla se hacía interminable -- ahora se
  // muestran de a 8 tiles a la vez (pedido explícito) y el último
  // espacio se usa para un tile "Ver más" que carga 8 más por toque,
  // en vez de mostrar los cientos de clientes de una sola vez. Se
  // reinicia a 8 cada vez que cambia la pestaña o la búsqueda, para
  // no arrastrar un conteo expandido de una búsqueda anterior.
  const [cantidadVisible, setCantidadVisible] = useState(8);
  useEffect(() => {
    setCantidadVisible(8);
  }, [tab, busqueda]);
  const hayMasClientes = filtrados.length > cantidadVisible;
  const clientesMostrados = hayMasClientes ? filtrados.slice(0, cantidadVisible - 1) : filtrados;
  const clientesRestantes = filtrados.length - clientesMostrados.length;

  // avatarUrl en realidad es una KEY de R2 (no una URL directa) para
  // los clientes migrados desde Cloudinary a R2 — hay que firmarla
  // antes de poder usarla en un <img>, igual que hace BrandThumb en el
  // resto de la app. Antes esta pantalla la usaba tal cual y por eso
  // salía como imagen rota.
  const miAvatarUrl = useAvatarPropio(uid);
  const miAvatarEsKeyR2 = Boolean(miAvatarUrl) && !miAvatarUrl.startsWith("http");
  // Se firma todo junto (fotos de clientes + la propia del admin) en
  // una sola tanda para no hacer dos viajes al servidor por separado.
  // Solo se firman las fotos que la paginación realmente va a mostrar.
  // Antes se pedían las de TODOS los clientes aunque la grilla enseñara 8:
  // con una cartera grande eran varios lotes de Functions y la pantalla
  // completa esperaba archivos que todavía ni se podían ver.
  const keysR2 = clientesMostrados
    .map((c) => c.avatarUrl)
    .filter((url): url is string => Boolean(url) && !url!.startsWith("http"))
    .concat(miAvatarEsKeyR2 ? [miAvatarUrl] : []);
  const avataresFirmados = useSignedUrls(keysR2);

  function avatarSrc(c: Cliente) {
    if (!c.avatarUrl) return undefined;
    const url = c.avatarUrl.startsWith("http") ? c.avatarUrl : avataresFirmados[c.avatarUrl];
    if (!url || avataresFallidos.get(c.id) === url) return undefined;
    return url;
  }

  const miAvatarSrc = miAvatarUrl
    ? miAvatarUrl.startsWith("http")
      ? miAvatarUrl
      : avataresFirmados[miAvatarUrl]
    : undefined;

  function cambiarTab(siguiente: "activos" | "archivados") {
    setErrorAccion("");
    if (siguiente === "archivados") setSoloConCampana(false);
    setTab(siguiente);
  }

  async function llamarAdministrarCliente(clienteId: string, accion: "archivar" | "restaurar" | "eliminarDefinitivo"): Promise<{ pendiente?: boolean }> {
    if (!cloudFunctions) {
      throw new Error("Firebase Functions no está configurado.");
    }
    const fn = httpsCallable<{ clienteId: string; accion: string }, { ok: boolean; pendiente?: boolean }>(
      cloudFunctions,
      "administrarClienteAdmin"
    );
    // eliminarDefinitivo es crítica en el backend (borra el cliente y
    // todo lo suyo, sin vuelta atrás): si pide identidad reciente, se
    // pide la contraseña y se reintenta. Archivar/restaurar no la piden.
    const res = await conReautenticacion(
      () => fn({ clienteId, accion }),
      () =>
        pedirContrasena({
          titulo: "Confirma tu identidad",
          mensaje: "Vas a eliminar definitivamente a este cliente y todo lo asociado. Escribe tu contraseña para continuar.",
          textoConfirmar: "Eliminar",
        })
    );
    if (!res) return {};
    return { pendiente: res.data.pendiente };
  }

  async function archivarCliente(cliente: Cliente) {
    const seguro = await confirmar({
      titulo: "¿Archivar este perfil?",
      mensaje: `${cliente.empresa} se moverá a Archivados. Podrás recuperarlo cuando quieras.`,
      textoConfirmar: "Archivar",
    });
    if (!seguro) return;
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await llamarAdministrarCliente(cliente.id, "archivar");
      setMenuCliente(null);
      cambiarTab("archivados");
      notificar({ tipo: "exito", mensaje: `${cliente.empresa} se movió a Archivados.` });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "No se pudo archivar el perfil.";
      setErrorAccion(mensaje);
      notificar({ tipo: "error", mensaje });
    } finally {
      setAccionandoId(null);
    }
  }

  async function restaurarCliente(cliente: Cliente) {
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await llamarAdministrarCliente(cliente.id, "restaurar");
      setMenuCliente(null);
      cambiarTab("activos");
      notificar({ tipo: "exito", mensaje: `${cliente.empresa} volvió a perfiles activos.` });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "No se pudo recuperar el perfil.";
      setErrorAccion(mensaje);
      notificar({ tipo: "error", mensaje });
    } finally {
      setAccionandoId(null);
    }
  }

  async function eliminarDefinitivo(cliente: Cliente) {
    const seguro = await confirmar(
      esGerente
        ? {
            titulo: "¿Eliminar definitivamente?",
            mensaje: `Se borrará el perfil de ${cliente.empresa} y todos sus accesos. No se puede deshacer.`,
            textoConfirmar: "Eliminar",
            destructivo: true,
          }
        : {
            titulo: "¿Pedir la eliminación?",
            mensaje: `Se le pedirá a tu Gerente eliminar definitivamente a ${cliente.empresa}. Quedará pendiente de su aprobación.`,
            textoConfirmar: "Enviar solicitud",
          }
    );
    if (!seguro) return;
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      const { pendiente } = await llamarAdministrarCliente(cliente.id, "eliminarDefinitivo");
      setMenuCliente(null);
      if (pendiente) {
        setErrorAccion("");
        await avisar({
          titulo: "Enviado para aprobación",
          mensaje: `Tu Gerente debe aprobar la eliminación definitiva de ${cliente.empresa}.`,
        });
      } else {
        notificar({ tipo: "exito", mensaje: `${cliente.empresa} se eliminó definitivamente.` });
      }
    } catch (err) {
      // La tarjeta puede seguir visible unas milésimas después de que
      // Firestore confirmó el borrado. Si se vuelve a tocar durante ese
      // intervalo, la función responde not-found; para eliminar, ese
      // resultado ya es el estado deseado y no debe mostrarse como error.
      if ((err as { code?: string })?.code === "functions/not-found") {
        setMenuCliente(null);
        setErrorAccion("");
        return;
      }
      const mensaje = err instanceof Error ? err.message : "No se pudo eliminar definitivamente.";
      setErrorAccion(mensaje);
      notificar({ tipo: "error", mensaje });
    } finally {
      setAccionandoId(null);
    }
  }

  return (
    <div className="admin-picker-shell">
      {state.status === "loading" ? (
        <div className="admin-picker-loading">
          <div className="admin-picker-loading-spinner" />
        </div>
      ) : (
        <>
      {/* Antes "Gestión" y "Vista cliente" eran dos botones cada uno
          con su propio position:absolute + un "left" fijo a mano --
          cuando "Gestión" se ensanchaba por la notificación (el
          numerito rojo de solicitudes pendientes), su ancho real ya no
          coincidia con el "left" fijo del siguiente boton y se tocaban
          / superponían. Ahora van juntos en una sola fila flex que se
          acomoda sola sin importar cuánto crezca "Gestión". */}
      <div className="admin-picker-top-left-actions">
        <button
          type="button"
          className="admin-picker-management-btn"
          onClick={() => setGestionAbierta(true)}
          aria-label="Abrir centro de gestión"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          <span>Gestión</span>
          {solicitudesPendientes > 0 && <b>{solicitudesPendientes > 9 ? "9+" : solicitudesPendientes}</b>}
        </button>
        {onToggleVistaCliente && (
          <button
            type="button"
            className={`admin-picker-client-view-btn${vistaClienteActiva ? " active" : ""}`}
            onClick={onToggleVistaCliente}
            aria-pressed={vistaClienteActiva}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.7" />
            </svg>
            <span>Vista cliente</span>
          </button>
        )}
      </div>
      {(estadoPush === "ofrecer" || estadoPush === "activando" || estadoPush === "bloqueado" || estadoPush === "error") && (
        <button
          type="button"
          className="admin-picker-push-btn"
          onClick={() => activarPush(uid)}
          disabled={estadoPush === "activando"}
          aria-label="Activar notificaciones"
          title={estadoPush === "bloqueado"
            ? "Permite las notificaciones para el dominio oficial desde los ajustes del navegador."
            : errorPush || "Activar notificaciones"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span>
            {estadoPush === "activando" ? "Comprobando…" : estadoPush === "bloqueado" ? "Desbloquear" : estadoPush === "error" ? "Reintentar" : "Activar"}
          </span>
        </button>
      )}
      {onOpenPerfil && (
        <button type="button" className="admin-picker-perfil-btn" onClick={onOpenPerfil} title="Mi perfil" aria-label="Mi perfil">
          {miAvatarSrc && !miAvatarFallo ? (
            <img src={miAvatarSrc} alt="" onError={() => setMiAvatarFallo(true)} />
          ) : (
            <span>{adminIniciales || "A"}</span>
          )}
        </button>
      )}
      <div className="admin-picker-stage">
        <section className="admin-picker-editorial" aria-hidden="true">
          <div className="admin-picker-editorial-brand">
            <img src="/logo-player.webp" decoding="async" alt="" draggable={false} />
            <span>PORTAL DE GESTIÓN</span>
          </div>
          <div className="admin-picker-editorial-copy">
            <span className="admin-picker-editorial-kicker">Control centralizado</span>
            <h1>Una operación.<br />Todas tus cuentas.</h1>
            <p>Clientes, campañas y resultados conectados en una sola experiencia.</p>
          </div>
          <div className="admin-picker-editorial-orbit" aria-hidden="true">
            <span className="admin-picker-editorial-orbit-field" />
            <span className="admin-picker-editorial-orbit-ring"><i /></span>
            <b /><b /><b /><b />
          </div>
        </section>
        <div className="admin-picker-console">
          <div className="admin-picker-header">
        <img src="/logo-player.webp" decoding="async" alt="Vista360 Player" className="admin-picker-logo" draggable={false} />
        <div className="admin-picker-badge">
          <span className="admin-picker-badge-dot" />
          {esGerente ? "Modo Gerente" : "Modo Trabajador"}
        </div>
        <div className="admin-picker-title">¿Qué cuenta gestionas?</div>
        <div className="admin-picker-sub">
          {vistaClienteActiva ? "Selecciona el cliente que deseas previsualizar." : "Selecciona un perfil de cliente para continuar."}
        </div>

        <section className="admin-picker-attention" aria-label="Atención ahora">
          <div className="admin-picker-attention-label"><i aria-hidden="true" />Atención ahora</div>
          <div className="admin-picker-attention-actions">
            {solicitudesPendientes > 0 && (
              <button type="button" onClick={onOpenSolicitudes}>
                <strong>{solicitudesPendientes}</strong>
                <span>{solicitudesPendientes === 1 ? "solicitud pendiente" : "solicitudes pendientes"}</span>
                <b>Revisar</b>
              </button>
            )}
            {cuentasConCampana.length > 0 && (
              <button
                type="button"
                className={soloConCampana ? "is-active" : ""}
                aria-pressed={soloConCampana}
                onClick={() => { setTab("activos"); setBusqueda(""); setSoloConCampana((actual) => !actual); }}
              >
                <strong>{cuentasConCampana.length}</strong>
                <span>{cuentasConCampana.length === 1 ? "cuenta con campaña" : "cuentas con campaña"}</span>
                <b>{soloConCampana ? "Ver todas" : "Revisar"}</b>
              </button>
            )}
            {solicitudesPendientes === 0 && cuentasConCampana.length === 0 && (
              <div className="admin-picker-attention-clear">
                <strong>Operación al día</strong>
                <span>No hay acciones pendientes con los datos disponibles.</span>
              </div>
            )}
          </div>
        </section>

        {/* SOLO GERENTE: Usuarios, Analitica y Paneles. El Trabajador
            opera con Solicitudes, Ocupacion y Cotizaciones. El backend ya
            deniega lo demas, pero ensenar una puerta cerrada y contestar
            con un error tecnico en ingles no es respetar el rol. */}
        <div className="admin-picker-actions">
          {esGerente && (
            <button type="button" onClick={onOpenUsuarios} className="admin-picker-action">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></span>
              <span><strong>Usuarios</strong><small>Gestionar accesos</small></span>
            </button>
          )}
          <button type="button" onClick={onOpenSolicitudes} className="admin-picker-action">
            <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg></span>
            <span><strong>Solicitudes</strong><small>Revisar campañas</small></span>
          </button>
          {esGerente && (
            <button type="button" onClick={onOpenAnalitica} className="admin-picker-action">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>
              <span><strong>Analítica</strong><small>Actividad y accesos</small></span>
            </button>
          )}
          {esGerente && (
            <button type="button" onClick={onOpenPaneles} className="admin-picker-action">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg></span>
              <span><strong>Paneles</strong><small>Inventario digital</small></span>
            </button>
          )}
        </div>

        <div className="admin-picker-tabs" role="tablist" aria-label="Perfiles">
          <button type="button" className={tab === "activos" ? "active" : ""} onClick={() => cambiarTab("activos")}>
            Activos <span>{activos.length}</span>
          </button>
          <button type="button" className={tab === "archivados" ? "active" : ""} onClick={() => cambiarTab("archivados")}>
            Archivados <span>{archivados.length}</span>
          </button>
        </div>

        <div className="admin-picker-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" className="admin-picker-search-icon">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar empresa…"
            className="admin-picker-search"
          />
        </div>
          </div>

          <div className="admin-picker-body">
        {state.status === "error" && (
          <div className="admin-picker-empty admin-picker-empty-error">{state.message}</div>
        )}
        {state.status === "ready" && filtrados.length === 0 && (
          <div className="admin-picker-empty">
            {tab === "activos" ? "No se encontró ningún cliente activo." : "No hay perfiles archivados."}
          </div>
        )}
        {errorAccion && <div className="admin-picker-empty admin-picker-empty-error">{errorAccion}</div>}

        <div className="admin-picker-grid">
          {clientesMostrados.map((c, indice) => {
            const { bg } = brandColor(c.empresa ?? "?");
            const busy = accionandoId === c.id;
            const campanasActivas = campanasActivasPorCliente[c.id] ?? 0;
            const detalleCuenta = c.archived
              ? "Perfil archivado"
              : campanasActivas > 0
                ? `${campanasActivas} ${campanasActivas === 1 ? "campaña activa" : "campañas activas"}`
                : c.sector || c.ciudad || "Cuenta cliente";
            return (
              <div
                key={c.id}
                className={`admin-picker-tile ${c.archived ? "archived" : ""}`}
                onClick={() => !c.archived && !busy && onSelect(c.id)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !c.archived && !busy) {
                    event.preventDefault();
                    onSelect(c.id);
                  }
                }}
                role={!c.archived ? "button" : undefined}
                tabIndex={!c.archived && !busy ? 0 : undefined}
                aria-label={!c.archived ? `Entrar a la cuenta de ${c.empresa}` : undefined}
              >
                <div className="admin-picker-tile-avatar-wrap">
                  <button
                    type="button"
                    className="admin-picker-tile-main"
                    disabled={!!c.archived || busy}
                    tabIndex={-1}
                  >
                    <span className="admin-picker-tile-avatar" style={{ background: bg }}>
                      {avatarSrc(c) ? (
                        <img
                          src={avatarSrc(c)}
                          alt=""
                          loading={indice < 4 ? "eager" : "lazy"}
                          fetchPriority={indice < 4 ? "high" : "auto"}
                          decoding="async"
                          onError={() => setAvataresFallidos((prev) => {
                            const siguiente = new Map(prev);
                            const url = avatarSrc(c);
                            if (url) siguiente.set(c.id, url);
                            return siguiente;
                          })}
                        />
                      ) : (
                        <ClientAvatar name={c.empresa ?? c.contacto ?? c.id} avatarKey={c.avatarKey} size={58} />
                      )}
                      <span className="admin-picker-tile-shine" aria-hidden="true" />
                      <span className="admin-picker-tile-copy">
                        <strong>{c.empresa}</strong>
                        <small>{detalleCuenta}</small>
                      </span>
                    </span>
                  </button>
                  {tab === "activos" && (
                    <button
                      type="button"
                      className="admin-picker-tile-gear"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuCliente(c);
                      }}
                      disabled={busy}
                      aria-label={`Opciones de ${c.empresa}`}
                      aria-haspopup="dialog"
                      title="Opciones de cuenta"
                    >
                      <span className="admin-picker-tile-menu-dots" aria-hidden="true">
                        <i /><i /><i />
                      </span>
                    </button>
                  )}
                </div>
                {tab !== "activos" && (
                  <div className="admin-picker-archive-actions">
                    <button type="button" onClick={() => restaurarCliente(c)} disabled={busy} title="Recuperar perfil">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7h18" /><path d="M5 7l2 13h10l2-13" /><path d="M9 7V4h6v3" /><path d="M9 14l3-3 3 3" /><path d="M12 11v6" />
                      </svg>
                    </button>
                    <button type="button" className="danger" onClick={() => eliminarDefinitivo(c)} disabled={busy} title="Eliminar definitivo">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {hayMasClientes && (
            <div
              className="admin-picker-tile admin-picker-tile-vermas"
              onClick={() => setCantidadVisible((v) => v + 8)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setCantidadVisible((v) => v + 8);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Ver ${clientesRestantes} clientes más`}
            >
              <div className="admin-picker-tile-avatar-wrap">
                <span className="admin-picker-tile-avatar admin-picker-tile-avatar-vermas">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </div>
              <span className="admin-picker-tile-name">Ver más ({clientesRestantes})</span>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>

      {menuCliente && (
        <div className="admin-picker-modal-backdrop" onClick={() => setMenuCliente(null)}>
          <div
            className="admin-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-picker-modal-title"
            aria-describedby="admin-picker-modal-copy"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuCliente(null);
            }}
          >
            <div className="admin-picker-modal-kicker">Configuración</div>
            <div id="admin-picker-modal-title" className="admin-picker-modal-title">{menuCliente.empresa}</div>
            <div id="admin-picker-modal-copy" className="admin-picker-modal-copy">
              Al eliminar ahora se moverá a Archivados. Desde Archivados podrás recuperarlo o borrarlo definitivamente.
            </div>
            <button
              type="button"
              className="admin-picker-modal-action danger"
              onClick={() => archivarCliente(menuCliente)}
              disabled={accionandoId === menuCliente.id}
            >
              Eliminar perfil
            </button>
            <button type="button" className="admin-picker-modal-action secondary" onClick={() => setMenuCliente(null)} autoFocus>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {gestionAbierta && (
        <div className="admin-picker-management-screen">
          <div className="admin-picker-management-flow" aria-hidden="true">
            <span />
            <i /><i /><i /><i />
          </div>
          <div className="admin-picker-management-head">
            <button type="button" onClick={() => setGestionAbierta(false)} aria-label="Volver a clientes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <strong>Centro de gestión</strong>
              <span>Administra tu operación desde un solo lugar.</span>
            </div>
            <img src="/logo-player.webp" decoding="async" alt="Vista360 Player" className="admin-picker-management-logo" draggable={false} />
          </div>
          <div className="admin-picker-management-grid">
            <section className="admin-picker-management-group">
              <div className="admin-picker-management-group-head">
                <span>01</span><div><strong>Clientes</strong><small>Personas y solicitudes</small></div>
              </div>
              <div className="admin-picker-management-group-cards">
                {/* SOLO GERENTE. La gestion de cuentas, el inventario de
                    paneles y la analitica de accesos son del Gerente: el
                    Trabajador ni siquiera debe verlas. El backend ya las
                    deniega, pero ensenar una puerta cerrada y responder
                    con un error tecnico en ingles no es respetar el rol. */}
                {esGerente && (
                  <button type="button" onClick={onOpenUsuarios} className="admin-picker-management-card">
                    <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></span>
                    <span><strong>Usuarios</strong><small>Gestionar accesos</small></span><i>›</i>
                  </button>
                )}
                <button type="button" onClick={onOpenSolicitudes} className="admin-picker-management-card">
                  <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg></span>
                  <span><strong>Solicitudes</strong><small>Revisar campañas</small></span>
                  {solicitudesPendientes > 0 && <b>{solicitudesPendientes > 9 ? "9+" : solicitudesPendientes}</b>}<i>›</i>
                </button>
                {esGerente && onOpenAprobaciones && (
                  <button type="button" onClick={onOpenAprobaciones} className="admin-picker-management-card">
                    <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg></span>
                    <span><strong>Aprobaciones</strong><small>Pedidos de tu equipo</small></span><i>›</i>
                  </button>
                )}
                {/* SOLO GERENTE, igual que Usuarios/Aprobaciones -- la
                    papelera puede tener facturas y comprobantes de pago
                    de cualquier cliente, sin el filtrado por cliente que
                    sí tiene el resto de la app. */}
                {esGerente && onOpenPapelera && (
                  <button type="button" onClick={onOpenPapelera} className="admin-picker-management-card">
                    <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></span>
                    <span><strong>Papelera</strong><small>Recuperar archivos borrados</small></span><i>›</i>
                  </button>
                )}
              </div>
            </section>

            <section className="admin-picker-management-group">
              <div className="admin-picker-management-group-head">
                <span>02</span><div><strong>Inventario</strong><small>Disponibilidad operativa</small></div>
              </div>
              <div className="admin-picker-management-group-cards">
                {esGerente && (
                  <button type="button" onClick={onOpenPaneles} className="admin-picker-management-card">
                    <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg></span>
                    <span><strong>Paneles</strong><small>Inventario digital</small></span><i>›</i>
                  </button>
                )}
                <button type="button" onClick={onOpenOcupacion} className="admin-picker-management-card">
                  <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg></span>
                  <span><strong>Ocupación</strong><small>Qué se libera y cuándo</small></span><i>›</i>
                </button>
              </div>
            </section>

            <section className="admin-picker-management-group">
              <div className="admin-picker-management-group-head">
                <span>03</span><div><strong>Negocio</strong><small>Análisis y propuestas</small></div>
              </div>
              <div className="admin-picker-management-group-cards">
                <button type="button" onClick={onOpenCotizaciones} className="admin-picker-management-card">
                  <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg></span>
                  <span><strong>Cotizaciones</strong><small>Crear propuestas comerciales</small></span><i>›</i>
                </button>
                {esGerente && (
                  <button type="button" onClick={onOpenAnalitica} className="admin-picker-management-card">
                    <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>
                    <span><strong>Analítica</strong><small>Actividad y accesos</small></span><i>›</i>
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      <div className="admin-picker-footer">
        <button type="button" onClick={() => logout()} className="admin-picker-logout">
          Cerrar sesión
        </button>
      </div>
        </>
      )}
    </div>
  );
}
