import { lazy, Suspense, startTransition, useEffect, useMemo, useState, useTransition } from "react";
import { envMissing } from "./config/env";
import { anotarRutaActual, useDetectorDeBucles } from "./hooks/useDetectorDeBucles";
import { pantallaLazy, recargarPorVersionDesactualizada } from "./utils/pantallaLazy";

/** Arrays vacios COMPARTIDOS. Un `[]` escrito en el render es un objeto
 *  nuevo cada vez, y basta con eso para disparar efectos en bucle. */
const SIN_CONTRATOS: Contrato[] = [];
const SIN_SOLICITUDES: SolicitudCampana[] = [];

/** Si un cambio de pantalla tarda mas que esto, algo va mal. */
const ESPERA_MAXIMA_CAMBIO_MS = 8000;
import { usePortalAuth } from "./hooks/usePortalAuth";
import { useCliente } from "./hooks/useCliente";
import { useContratos, useSolicitudesDelCliente } from "./hooks/useContratos";
import { usePaneles } from "./hooks/usePaneles";
import { useThemeColor } from "./hooks/useThemeColor";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { logout, cloudFunctions } from "./config/firebase";
import { httpsCallable } from "firebase/functions";
import ConfigMissing from "./components/ConfigMissing";
import OfflineBanner from "./components/OfflineBanner";
import LoginScreen from "./components/LoginScreen";
import BrandLoader from "./components/BrandLoader";


import BottomNav, { type Tab } from "./components/BottomNav";
import Sidebar from "./components/Sidebar";
import Inicio from "./components/screens/Inicio";




import { debeVerOnboarding } from "./utils/onboarding";
import { usePushEstado } from "./hooks/usePushEstado";
import { esMovil } from "./utils/dispositivo";
import { useRegistrarAcceso } from "./hooks/useRegistrarAcceso";
import { useRegistrarVisita } from "./hooks/useRegistrarVisita";
import { useNotificaciones } from "./hooks/useNotificaciones";
import { useSolicitudesPendientes } from "./hooks/useSolicitudesCampana";
import { useAvatarPropio } from "./hooks/useAvatarPropio";
import type { Contrato, SolicitudCampana } from "./types";
import { panelesDeContrato, rucCliente } from "./types";
import { cargarLeaflet } from "./utils/leaflet";

// Pantallas que NO se necesitan de entrada — se piden al navegador solo
// cuando el cliente realmente entra a esa sección (tocar una campaña,
// abrir el menú lateral, etc). Esto es lo que baja el peso del bundle
// inicial: nadie descarga el código de "Cobertura" o "Analítica" solo
// para ver "Inicio".
const DetalleCampana = pantallaLazy(() => import("./components/screens/DetalleCampana"));
const NuevaCampana = pantallaLazy(() => import("./components/screens/NuevaCampana"));
const Cobertura = pantallaLazy(() => import("./components/screens/Cobertura"));
const MisPantallas = pantallaLazy(() => import("./components/screens/MisPantallas"));
const AnaliticaClientes = pantallaLazy(() => import("./components/screens/AnaliticaClientes"));
const AprobacionesGerente = pantallaLazy(() => import("./components/screens/AprobacionesGerente"));
const SolicitudesCampana = pantallaLazy(() => import("./components/screens/SolicitudesCampana"));
const Accesos = pantallaLazy(() => import("./components/screens/Accesos"));
const Facturas = pantallaLazy(() => import("./components/screens/Facturas"));
const Notificaciones = pantallaLazy(() => import("./components/screens/Notificaciones"));
const CrearCliente = pantallaLazy(() => import("./components/screens/CrearCliente"));
const Paneles = pantallaLazy(() => import("./components/screens/Paneles"));
const Ocupacion = pantallaLazy(() => import("./components/screens/Ocupacion"));
const Cotizaciones = pantallaLazy(() => import("./components/screens/Cotizaciones"));
// Estas seis estaban en el bundle inicial: ~2600 líneas que el navegador
// descargaba para poder mostrar la pantalla de login, donde no se usa
// ninguna. Ahora bajan cuando hacen falta, y precargarPantallas() las pide
// apenas la app queda ociosa, así no se nota el cambio al abrirlas.
const AdminClientPicker = pantallaLazy(() => import("./components/AdminClientPicker"));
const AdminPerfil = pantallaLazy(() => import("./components/screens/AdminPerfil"));
const MisCampanas = pantallaLazy(() => import("./components/screens/MisCampanas"));
const Reportes = pantallaLazy(() => import("./components/screens/Reportes"));
const Perfil = pantallaLazy(() => import("./components/screens/Perfil"));
const OnboardingTour = pantallaLazy(() => import("./components/OnboardingTour"));

/** Precarga en segundo plano (cuando el navegador está libre, sin
 *  competir con nada urgente) el código de TODAS las pantallas que
 *  se abren desde el menú lateral o al tocar una campaña. Sin esto,
 *  la PRIMERA vez que se entra a cada una hay que esperar a que el
 *  navegador la descargue -- eso es el "corte"/destello que se ve al
 *  cambiar de sección. Pedirla de antemano hace que, para cuando el
 *  admin realmente toca "Paneles" (o Cobertura, Facturas, etc), el
 *  código ya esté en caché y la pantalla aparezca al toque. */
function precargarPantallas() {
  // OJO con el .catch(): una precarga que falla es TOTALMENTE inofensiva
  // (la pantalla se vuelve a pedir sola cuando la persona entra de
  // verdad), pero sin capturar el error cada fallo se convertía en un
  // "unhandled promise rejection". Y fallan seguido: esto corre al
  // arrancar la app, cuando el celular todavía está enganchándose a la
  // red, y son 19 pedidos de golpe. Peor aún, después de un despliegue
  // nuevo, una pestaña vieja pide chunks que ya no existen -- ahí
  // fallan TODOS a la vez. Ese ruido tapaba errores de verdad en la
  // consola y, en algunos navegadores, llegaba a los reportes de error
  // como si la app se hubiera roto. Ahora se ignoran en silencio, que es
  // exactamente lo que corresponde para una precarga optimista.
  const precargar = (cargar: () => Promise<unknown>) => {
    void cargar().catch(() => {
      /* precarga optimista: si falla, la pantalla se pide de nuevo al abrirla */
    });
  };

  precargar(() => import("./components/screens/DetalleCampana"));
  precargar(() => import("./components/screens/NuevaCampana"));
  precargar(() => import("./components/screens/Cobertura"));
  precargar(() => import("./components/screens/MisPantallas"));
  precargar(() => import("./components/screens/AnaliticaClientes"));
  precargar(() => import("./components/screens/AprobacionesGerente"));
  precargar(() => import("./components/screens/SolicitudesCampana"));
  precargar(() => import("./components/screens/Accesos"));
  precargar(() => import("./components/screens/Facturas"));
  precargar(() => import("./components/screens/Notificaciones"));
  precargar(() => import("./components/screens/CrearCliente"));
  precargar(() => import("./components/screens/Paneles"));
  precargar(() => import("./components/screens/Ocupacion"));
  precargar(() => import("./components/screens/Cotizaciones"));
  precargar(() => import("./components/AdminClientPicker"));
  precargar(() => import("./components/screens/AdminPerfil"));
  precargar(() => import("./components/screens/MisCampanas"));
  precargar(() => import("./components/screens/Reportes"));
  precargar(() => import("./components/screens/Perfil"));
  // Cobertura necesita además el chunk de Leaflet (ahora empaquetado con
  // la app, ya no un CDN externo -- ver utils/leaflet.ts). Pedirlo acá
  // igual sirve: aunque ya esté en el mismo paquete Vite, sigue siendo
  // un chunk aparte que el navegador tiene que buscar en caché/red la
  // primera vez, así que precargarlo evita que el primer ingreso a
  // Cobertura tenga que esperar recién ahí.
  void cargarLeaflet().catch(() => {
    // Si la precarga falla (por ejemplo, por una conexión momentáneamente
    // inestable), Cobertura vuelve a intentarlo normalmente al abrirse.
  });
  // Y no solo el CÓDIGO de Cobertura -- también sus DATOS. Descargar la
  // pantalla de antemano no evitaba el "Cargando paneles" que se veía
  // la primera vez que se entraba en toda la sesión, porque el pedido
  // a Firestore recién arrancaba cuando el componente se montaba. Acá
  // se arranca esa misma escucha (compartida, ver usePanelesDisponibles)
  // de una vez -- así, para cuando la persona realmente toca
  // "Cobertura", lo más probable es que los paneles ya hayan llegado
  // mientras miraba Inicio, y no vea "Cargando" en absoluto.
  precargar(() => import("./hooks/usePanelesDisponibles").then((m) => m.precargarPaneles()));
}

type View =
  | Tab
  | "detalle"
  | "nueva"
  | "mispantallas"
  | "analitica"
  | "solicitudes"
  | "accesos"
  | "facturas"
  | "notificaciones"
  | "nuevoCliente"
  | "miPerfil"
  | "paneles"
  | "ocupacion"
  | "cotizaciones"
  | "aprobaciones";

// Color real del header de cada pantalla — debe coincidir exactamente con
// el background de su header (.header-dark, .header-light, etc). Se usa
// para sincronizar la barra de estado (ver useThemeColor).
const VIEW_COLORS: Record<View, string> = {
  inicio: "#050A12",
  campanas: "#0B1220",
  detalle: "#0B1220",
  reportes: "#0B1220",
  perfil: "#050A12",
  nueva: "#0B1220",
  cobertura: "#0B1220",
  mispantallas: "#0B1220",
  analitica: "#0B1220",
  solicitudes: "#0B1220",
  accesos: "#0B1220",
  facturas: "#0B1220",
  notificaciones: "#0B1220",
  nuevoCliente: "#0B1220",
  miPerfil: "#0B1220",
  paneles: "#0B1220",
  ocupacion: "#0B1220",
  cotizaciones: "#01040B",
  aprobaciones: "#0B1220",
};

// Vistas que se abren desde el menú lateral (☰) y no desde la barra
// inferior — se navegan igual que "detalle"/"nueva": pantalla completa,
// con su propio botón de regreso, sin la barra inferior compitiendo.
const SIDEBAR_VIEWS = new Set<View>([
  "mispantallas",
  "analitica",
  "solicitudes",
  "accesos",
  "facturas",
  "notificaciones",
  "nuevoCliente",
  "paneles",
  "ocupacion",
  "cotizaciones",
  "aprobaciones",
]);

export default function App() {
  // Red de seguridad en tiempo de ejecución: avisa si algo desboca los
  // renders. Los detectores estáticos solo ven los patrones conocidos y
  // dentro de un archivo; un bucle puede formarse entre varios.
  useDetectorDeBucles("App");
  const auth = usePortalAuth();
  const online = useOnlineStatus();
  const uid = auth.status === "in" ? auth.user.uid : undefined;
  useRegistrarAcceso(uid);
  // La cuenta Gerente original (armn.101@hotmail.com) se creó a mano
  // antes de que existiera este sistema de roles y su documento en
  // portalUsers nunca tuvo un campo "nombre" -- por eso caía siempre
  // al nombre del rol ("Gerente") en vez de al nombre real. Pedido
  // explícito: que se corrija solo, sin que la persona tenga que
  // tocar nada. Como no hay forma de escribir Firestore directo desde
  // acá, esto llama una sola vez (mientras nombre siga vacío) a la
  // misma Cloud Function que usa "Mi perfil" para guardar el nombre
  // propio -- en cuanto se guarda, usePortalAuth lo refleja solo (ver
  // ese hook) y este efecto no vuelve a dispararse.
  useEffect(() => {
    if (auth.status !== "in" || auth.nombre || !cloudFunctions) return;
    if ((auth.user.email ?? "").trim().toLowerCase() !== "armn.101@hotmail.com") return;
    const fn = httpsCallable<{ nombre: string }, { nombre: string }>(cloudFunctions, "actualizarNombrePropio");
    void fn({ nombre: "Alan Martínez" }).catch(() => {
      // Si la función todavía no está desplegada, no pasa nada -- se
      // reintenta solo la próxima vez que entre a la app.
    });
  }, [auth]);
  const [view, setViewInmediato] = useState<View>("inicio");
  // Las pantallas se cargan bajo demanda (lazy) para no descargar toda la
  // app de una -- eso significa que cambiar de pantalla a veces implica
  // esperar a que React termine de traer el código de la pantalla nueva.
  // Un clic es una actualización "sincrona" para React; si esa espera
  // (Suspense) ocurre justo respondiendo a un clic así, sin avisarle a
  // React que puede tomarse su tiempo, React 18 tira el error #426 ("A
  // component suspended while responding to synchronous input") en vez
  // de mostrar el loader y esperar -- se vio en vivo entrando de "Vista
  // de clientes" a un cliente. startTransition es la solución que la
  // propia documentación de React da para este caso puntual: le avisa
  // que el cambio puede demorar, así que muestra el loader (BrandLoader,
  // ya puesto en el Suspense) en vez de romperse. setView sigue
  // llamándose igual en los ~38 lugares que ya la usan en este archivo.
  // EL CAMBIO DE PANTALLA NO PUEDE QUEDARSE COLGADO EN SILENCIO.
  //
  // setView usa startTransition: React NO cambia la pantalla hasta tener
  // el codigo de la pantalla nueva (cada una es un .js aparte). Eso es
  // bueno -- evita un parpadeo -- pero tiene un modo de fallo horrible:
  // si ese codigo NO llega, React se queda mostrando la pantalla
  // anterior. Sin error, sin aviso, sin nada en la consola. La persona
  // pulsa un boton y no pasa absolutamente nada.
  //
  // Pasa despues de un despliegue: una pestana abierta desde antes pide
  // archivos con nombres que ya no existen. Y es dificilisimo de
  // diagnosticar precisamente porque no deja rastro: la app "funciona",
  // solo que no se mueve.
  //
  // Con isPending sabemos que hay un cambio en curso. Si pasan varios
  // segundos y sigue sin completarse, algo va mal: se recarga, que es lo
  // unico que trae el index.html nuevo con los nombres correctos.
  const [cambioEnCurso, comenzarCambioDePantalla] = useTransition();
  useEffect(() => {
    if (!cambioEnCurso) return;
    const reloj = setTimeout(() => {
      console.error("El cambio de pantalla no se completa; se recarga la aplicacion.");
      recargarPorVersionDesactualizada();
    }, ESPERA_MAXIMA_CAMBIO_MS);
    return () => clearTimeout(reloj);
  }, [cambioEnCurso]);

  function setView(v: View) {
    comenzarCambioDePantalla(() => setViewInmediato(v));
  }
  // Solo el NOMBRE de la pantalla, para que el aviso de bucle diga dónde
  // pasó. Nada de identificadores de cliente ni contenido.
  anotarRutaActual(view);
  useRegistrarVisita(uid, view);
  // Estos 4 estados (contratoAbierto, adminClienteId, volverAGestion,
  // adminVistaCliente) casi siempre cambian JUNTO con la pantalla
  // (setView) en el mismo clic -- por ejemplo, entrar a un cliente desde
  // "Vista de clientes" cambia adminClienteId Y view a la vez. Si
  // adminClienteId se actualizara de forma síncrona normal mientras view
  // se actualiza con startTransition, React 18 igual tira el error #426
  // (ver el comentario de setView más arriba): el cambio de pantalla
  // "espera su turno" pero el de adminClienteId no, así que la
  // renderización que se dispara con adminClienteId ya actualizado sigue
  // siendo síncrona y sigue reventando si la pantalla nueva todavía no
  // cargó su código. Por eso los 4 llevan el mismo envoltorio con
  // startTransition que setView, para que TODO el cambio (pantalla +
  // estos datos) se trate como una sola transición.
  const [contratoAbierto, setContratoAbiertoInmediato] = useState<Contrato | null>(null);
  function setContratoAbierto(c: Contrato | null) {
    comenzarCambioDePantalla(() => setContratoAbiertoInmediato(c));
  }
  // Solo lo usa el admin: a qué cliente está viendo ahora. null = todavía
  // no eligió ninguno -> se le muestra el selector.
  const [adminClienteId, setAdminClienteIdInmediato] = useState<string | null>(null);
  function setAdminClienteId(id: string | null) {
    comenzarCambioDePantalla(() => setAdminClienteIdInmediato(id));
  }
  // Cuando se vuelve con "atrás" desde Usuarios/Solicitudes/Analítica/
  // Paneles, hay que reabrir Centro de gestión (de donde salió esta
  // navegación), no la Selección de clientes de cero -- ver
  // AdminClientPicker.tsx (gestionInicial).
  const [volverAGestion, setVolverAGestionInmediato] = useState(false);
  function setVolverAGestion(v: boolean) {
    comenzarCambioDePantalla(() => setVolverAGestionInmediato(v));
  }
  const [adminVistaCliente, setAdminVistaClienteInmediato] = useState(false);
  function setAdminVistaCliente(v: boolean | ((activa: boolean) => boolean)) {
    comenzarCambioDePantalla(() => setAdminVistaClienteInmediato(v));
  }

  // Color de la pantalla que se está mostrando AHORA MISMO, sin importar
  // el estado (login, cargando, selector de cliente, o ya adentro) — debe
  // calcularse antes de cualquier "return" de abajo porque los hooks no
  // pueden ser condicionales.
  const themeColor =
    envMissing.length > 0
      ? "#1a0707"
      : auth.status === "loading"
        ? "#050A12"
        : auth.status === "error"
          ? "#0B1220"
        : auth.status === "out"
          ? "#050A12"
          : (auth.role === "admin" || auth.role === "trabajador") && !adminClienteId
            ? "#050A12"
            : VIEW_COLORS[view] ?? "#0B1220";
  const pageBackground =
    auth.status === "in" && !((auth.role === "admin" || auth.role === "trabajador") && !adminClienteId)
      ? "#FFFFFF"
      : themeColor;
  useThemeColor(themeColor, pageBackground);

  if (envMissing.length > 0) {
    return <ConfigMissing missing={envMissing} />;
  }

  if (auth.status === "loading") {
    return (
      <div className="app-shell">
        <OfflineBanner online={online} />
        <BrandLoader dark />
      </div>
    );
  }

  if (auth.status === "out") {
    return (
      <div className="app-shell">
        <OfflineBanner online={online} />
        <LoginScreen onLoggedIn={() => setView("inicio")} />
      </div>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="app-shell">
        <OfflineBanner online={online} />
        <div className="state-screen">
          <div className="state-title">No se pudo cargar tu cuenta</div>
          <div className="state-sub">{auth.message}</div>
        </div>
      </div>
    );
  }

  // auth.status === "in"
  // "trabajador" entra al mismo shell que "admin" (selector de
  // clientes, Centro de gestión, etc) -- lo que cambia es qué puede
  // hacer una vez adentro, no qué pantallas puede ABRIR. Ver el
  // comentario grande sobre roles en types/index.ts.
  if (auth.role === "admin" || auth.role === "trabajador") {
    // "esGerente" (antes "admin" a secas) es el único de los dos roles
    // internos que puede: aprobar/rechazar solicitudes de un
    // Trabajador, crear cuentas de Trabajador, y archivar/restaurar
    // accesos de usuarios. Todo lo demás (gestionar campañas, crear/
    // editar clientes, publicar reportes, y pedir --con aprobación--
    // eliminar campañas/clientes/usuarios o tocar el inventario de
    // paneles) lo puede hacer también un Trabajador.
    const esGerente = auth.role === "admin";
    if (!adminClienteId) {
      if (view === "solicitudes" || view === "accesos" || view === "analitica" || view === "miPerfil" || view === "paneles" || view === "ocupacion" || view === "cotizaciones" || (view === "aprobaciones" && esGerente)) {
        return (
          // no-bottom-nav: sin esta clase el .app-shell se queda sin la
          // regla que absorbe los 160px de "sangrado" extra (ver el
          // comentario grande de app.css sobre Safari/la barra de URL) --
          // .main-area se estira esos 160px de más y lo que está anclado
          // abajo (acá, "Cerrar sesión" en Mi perfil) queda renderizado
          // fuera de la pantalla, sin poder llegar por scroll. Mismo bug
          // que ya se había resuelto antes para "Enviar solicitud", solo
          // que a esta rama (pantallas que se abren desde el menú
          // lateral) nunca le habían puesto la clase.
          <div className="app-shell no-bottom-nav">
            <OfflineBanner online={online} />
            <Suspense
              fallback={
                <BrandLoader />
              }
            >
              {view === "solicitudes"
                ? <SolicitudesCampana
                    onBack={() => { setVolverAGestion(true); setView("inicio"); }}
                    onCrearCampana={(id) => {
                      setAdminClienteId(id);
                      setView("nueva");
                    }}
                  />
                : view === "accesos"
                  ? <Accesos onBack={() => { setVolverAGestion(true); setView("inicio"); }} esGerente={esGerente} />
                  : view === "miPerfil"
                    ? <AdminPerfil uid={auth.user.uid} nombre={auth.nombre ?? ""} email={auth.user.email ?? ""} esGerente={esGerente} onBack={() => setView("inicio")} />
                    : view === "paneles"
                      ? <Paneles onBack={() => { setVolverAGestion(true); setView("inicio"); }} esGerente={esGerente} />
                      : view === "cotizaciones"
                        ? <Cotizaciones onBack={() => { setVolverAGestion(true); setView("inicio"); }} />
                      : view === "ocupacion"
                        ? <Ocupacion onBack={() => { setVolverAGestion(true); setView("inicio"); }} />
                      : view === "aprobaciones"
                        ? <AprobacionesGerente onBack={() => { setVolverAGestion(true); setView("inicio"); }} />
                        : <AnaliticaClientes onBack={() => { setVolverAGestion(true); setView("inicio"); }} />}
            </Suspense>
          </div>
        );
      }
      return (
        <div className="app-shell">
          <OfflineBanner online={online} />
          {/* Suspense porque AdminClientPicker ahora se carga bajo demanda
              (antes venía en el bundle inicial). Sin esto, React lanza al
              suspenderse. */}
          <Suspense fallback={<BrandLoader />}>
          <AdminClientPicker
            onSelect={(id) => { setAdminClienteId(id); setView("inicio"); }}
            onOpenUsuarios={() => setView("accesos")}
            onOpenSolicitudes={() => setView("solicitudes")}
            onOpenAnalitica={() => setView("analitica")}
            onOpenPerfil={() => setView("miPerfil")}
            onOpenPaneles={() => setView("paneles")}
            onOpenOcupacion={() => setView("ocupacion")}
            onOpenCotizaciones={() => setView("cotizaciones")}
            onOpenAprobaciones={esGerente ? () => setView("aprobaciones") : undefined}
            esGerente={esGerente}
            adminIniciales={(auth.nombre ?? "A").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")}
            uid={uid}
            vistaClienteActiva={adminVistaCliente}
            onToggleVistaCliente={() => setAdminVistaCliente((activa) => !activa)}
            gestionInicial={volverAGestion}
            onGestionInicialConsumida={() => setVolverAGestion(false)}
          />
          </Suspense>
        </div>
      );
    }
    return (
      <AuthenticatedApp
        clienteId={adminClienteId}
        uid={uid}
        email={auth.user.email ?? ""}
        view={view}
        setView={setView}
        contratoAbierto={contratoAbierto}
        setContratoAbierto={setContratoAbierto}
        isAdmin={!adminVistaCliente}
        // Antes esto se ponía undefined mientras el Gerente veía la
        // app "como cliente" -- por eso el sidebar se ponía a mostrar
        // el nombre/logo de la empresa del cliente en vez del propio.
        // El nombre de quien está REALMENTE conectado no depende del
        // modo de vista, así que siempre va el propio.
        adminNombre={auth.nombre}
        esGerente={esGerente}
        online={online}
        onSeleccionarCliente={adminVistaCliente ? undefined : (id) => {
          setAdminClienteId(id);
          setView("nueva");
        }}
        onCambiarCliente={() => {
          setAdminClienteId(null);
          setAdminVistaCliente(false);
          setView("inicio");
        }}
        onOpenAdminPerfil={() => {
          setAdminClienteId(null);
          setAdminVistaCliente(false);
          setView("miPerfil");
        }}
      />
    );
  }

  return (
    <AuthenticatedApp
      clienteId={auth.clienteId ?? ""}
      uid={uid}
      email={auth.user.email ?? ""}
      view={view}
      setView={setView}
      contratoAbierto={contratoAbierto}
      setContratoAbierto={setContratoAbierto}
      isAdmin={false}
      online={online}
    />
  );
}

interface AuthenticatedProps {
  clienteId: string;
  uid?: string;
  email: string;
  view: View;
  setView: (v: View) => void;
  contratoAbierto: Contrato | null;
  setContratoAbierto: (c: Contrato | null) => void;
  isAdmin: boolean;
  adminNombre?: string | null;
  esGerente?: boolean;
  onCambiarCliente?: () => void;
  onOpenAdminPerfil?: () => void;
  onSeleccionarCliente?: (clienteId: string) => void;
  online: boolean;
}

function AuthenticatedApp({
  clienteId,
  uid,
  email,
  view,
  setView,
  contratoAbierto,
  setContratoAbierto,
  isAdmin,
  adminNombre,
  esGerente,
  onCambiarCliente,
  onOpenAdminPerfil,
  onSeleccionarCliente,
  online,
}: AuthenticatedProps) {
  useDetectorDeBucles("AuthenticatedApp");
  const cliente = useCliente(clienteId);
  const contratosState = useContratos(clienteId);
  // VACIO ESTABLE. `? x : []` crea un array nuevo en CADA render, y ese
  // array es dependencia del efecto de useNotificaciones: efecto ->
  // setState -> render -> array nuevo -> efecto... Un bucle infinito sin
  // ningun error visible. Ver el comentario largo en useContratos.ts.
  const contratos = useMemo(
    () => (contratosState.status === "ready" ? contratosState.contratos : SIN_CONTRATOS),
    [contratosState]
  );
  // Las solicitudes salen del MISMO documento resumen que las campanas:
  // no cuestan ninguna lectura extra.
  const solicitudesCliente = useSolicitudesDelCliente(clienteId);
  const misSolicitudes = useMemo(
    () => (solicitudesCliente.status === "ready" ? solicitudesCliente.solicitudes : SIN_SOLICITUDES),
    [solicitudesCliente]
  );
  const notifState = useNotificaciones(clienteId, contratos, misSolicitudes);
  const totalNotifs = notifState.status === "ready" ? notifState.total : 0;
  // Igual que en el selector: para el contador de la barra lateral
  // bastan las pendientes.
  const solCampState = useSolicitudesPendientes(!!isAdmin);
  const solCampPendientes = solCampState.status === "ready"
    ? solCampState.solicitudes.length
    : 0;
  const paneles = usePaneles(contratos.flatMap((c) => panelesDeContrato(c)));
  // "esInterno" identifica una sesión REAL de Gerente/Trabajador, sin
  // importar si en este momento está en modo "ver como cliente"
  // (adminVistaCliente). A diferencia de "isAdmin" -- que sí cambia con
  // ese modo de vista y controla qué PANTALLA se muestra -- "esGerente"
  // solo llega definido (true/false) cuando quien entró es personal
  // interno; en el llamador para clientes reales nunca se pasa (queda
  // undefined). Sirve para que el chip de perfil del sidebar siempre
  // muestre la identidad de quien está REALMENTE conectado.
  const esInterno = esGerente !== undefined;
  // El sidebar del admin debe usar la misma foto guardada en Mi perfil.
  // Antes se enviaba avatarUrl=undefined de forma explícita, por eso
  // siempre aparecía el ícono genérico aunque la cuenta sí tuviera foto.
  const adminAvatarUrl = useAvatarPropio(esInterno ? uid : undefined);

  useEffect(() => {
    // timeout:1500 es la parte importante acá -- sin él,
    // requestIdleCallback puede demorar mucho más de lo que parece
    // "ocioso" (el navegador nunca lo considera libre de verdad si hay
    // animaciones corriendo, como el logo de BrandLoader, o la persona
    // sigue tocando la pantalla) y la precarga podía terminar
    // disparándose recién cuando la persona YA estaba navegando entre
    // pantallas -- exactamente el "cargando, cargando" que se quiere
    // evitar. Con el timeout, el navegador SÍ o SÍ la corre antes de
    // 1.5s, esté "libre" o no, aunque sea compitiendo un poco con otra
    // cosa -- mejor eso que dejar la app entera sintiéndose pesada.
    const idle = (window as any).requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 800));
    const cancelar = (window as any).cancelIdleCallback ?? window.clearTimeout;
    const id = idle(precargarPantallas, { timeout: 1500 });
    return () => cancelar(id);
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Precarga del formulario de Nueva campaña cuando se pide desde un
  // pin de Cobertura ("Solicitar disponibilidad"/"Solicitar
  // renovación") -- así la persona no escribe todo de cero.
  // Mismo motivo que contratoAbierto/adminClienteId en App(): esto
  // cambia junto con setView("nueva") en el mismo clic (botón
  // "Solicitar renovación/disponibilidad" del mapa de Cobertura), así
  // que también necesita ir envuelto en startTransition -- si no,
  // React 18 revienta con el error #426 igual, aunque setView ya esté
  // envuelto (ver ese comentario en App() para el detalle completo).
  const [prefillNueva, setPrefillNuevaInmediato] = useState<{ nombre?: string; ciudad?: string; comentarios?: string; panelId?: string; panelNombre?: string } | null>(null);
  function setPrefillNueva(p: { nombre?: string; ciudad?: string; comentarios?: string; panelId?: string; panelNombre?: string } | null) {
    startTransition(() => setPrefillNuevaInmediato(p));
  }
  const [mostrarOnboarding, setMostrarOnboarding] = useState(() => !isAdmin && debeVerOnboarding(uid));
  const pushEstadoGlobal = usePushEstado(uid);
  // Foco de luz para activar push -- a propósito NO se guarda "ya lo vi"
  // en ningún lado: se pidió que aparezca SIEMPRE que la cuenta entra sin
  // notificaciones activadas todavía (celular nuevo, reinstaló la app,
  // etc.), no solo la primera vez. Por eso "abierto" no depende de un
  // flag persistido -- se prende cuando el push pasa a "ofrecer" (se
  // puede ofrecer y todavía no se decidió) O "bloqueado" (el navegador
  // ya lo tiene rechazado) -- en ambos casos hay que seguir mostrando
  // el aviso; solo se apaga cuando el propio NotifPrompt llama a
  // onClose (esto ahora solo pasa si de verdad quedó "activado", ver
  // NotifPrompt.tsx). Se mantiene "enganchado" (abierto) una vez que se
  // prende para que no desaparezca de golpe apenas se toca el botón y
  // el estado pasa de "ofrecer" a "activando" a mitad de camino.
  //
  // Pedido explícito: esto aplica a TODAS las cuentas, incluido el
  // admin -- y si rechaza el permiso ("No permitir"), la app tiene que
  // seguir bloqueada -- antes, si eso pasaba a mitad de la MISMA
  // sesión (sin recargar la página), el aviso se cerraba solo y dejaba
  // entrar a la app sin haber aceptado nunca; y si volvía a entrar más
  // tarde (celular ya bloqueado desde antes), tampoco se volvía a
  // mostrar nada porque el efecto de abajo solo miraba "ofrecer".
  // "bloqueado" en COMPUTADORA ya no es obligatorio -- pedido
  // explícito: los pasos para desbloquear varían mucho entre
  // navegadores/versiones de escritorio (ya hubo un caso real con
  // instrucciones de Safari que no aplicaban), y si salen mal la
  // persona se queda sin poder ni entrar a la app. En celular sí
  // sigue siendo obligatorio -- ahí los pasos son siempre los mismos
  // (Ajustes del sistema) y son confiables.
  const [notifPromptAbierto, setNotifPromptAbierto] = useState(false);
  useEffect(() => {
    if (mostrarOnboarding) return;
    if (pushEstadoGlobal.estado === "ofrecer") {
      setNotifPromptAbierto(true);
    } else if (pushEstadoGlobal.estado === "bloqueado" && esMovil()) {
      setNotifPromptAbierto(true);
    }
  }, [mostrarOnboarding, pushEstadoGlobal.estado]);
  const mostrarNotifPrompt = notifPromptAbierto;

  const showBottomNav = view !== "detalle" && view !== "nueva" && !SIDEBAR_VIEWS.has(view);
  const activeTab: Tab =
    view === "detalle" || view === "nueva" || SIDEBAR_VIEWS.has(view) ? "inicio" : (view as Tab);

  function abrirContrato(c: Contrato) {
    setContratoAbierto(c);
    setView("detalle");
  }

  let content: React.ReactNode = null;

  // SOLO SE TAPAN LAS PANTALLAS QUE SON CAMPAÑAS.
  //
  // Antes, mientras las campañas cargaban, este loader tapaba la
  // aplicación ENTERA: no se podía ir a Cobertura, ni a Reportes, ni a
  // Perfil, ni a Facturas -- pantallas que no necesitan las campañas
  // para nada. Si la carga se atascaba (una conexión mala, un permiso
  // que falta, un respaldo que tarda), la persona se quedaba mirando un
  // spinner sin poder navegar a ningún sitio.
  //
  // Ahora solo esperan las vistas cuyo CONTENIDO son las campañas. Las
  // demás se pintan igual; Cobertura ya sabe manejarlo por su cuenta con
  // `contratosListos`, y Notificaciones y Facturas funcionan con la
  // lista vacía mientras llega.
  const NECESITAN_CAMPANAS = new Set<View>(["inicio", "campanas", "detalle", "nueva"]);
  const esperandoCampanas = contratosState.status !== "ready" && NECESITAN_CAMPANAS.has(view);

  if (esperandoCampanas && contratosState.status === "loading") {
    content = (
      <BrandLoader label="Cargando campañas" />
    );
  } else if (esperandoCampanas && contratosState.status === "error") {
    content = (
      <div className="state-screen">
        <div className="state-title">No se pudieron cargar las campañas</div>
        <div className="state-sub">{contratosState.message}</div>
        <button type="button" className="retry-btn" onClick={contratosState.retry}>
          Reintentar
        </button>
      </div>
    );
  } else {
    switch (view) {
      case "inicio":
        content = (
          <Inicio
            cliente={cliente}
            clienteId={clienteId}
            contratos={contratos}
            paneles={paneles}
            onGoTo={(tab) => setView(tab)}
            onAbrirCampana={abrirContrato}
            onMenuClick={() => setSidebarOpen(true)}
            onNotifClick={() => setView("notificaciones")}
            onCambiarCliente={onCambiarCliente}
            totalNotifs={totalNotifs}
            isAdmin={isAdmin}
            adminNombre={adminNombre}
            esGerente={esGerente}
            uid={uid}
            mostrarNotifSpotlight={mostrarNotifPrompt}
            onCerrarNotifSpotlight={() => setNotifPromptAbierto(false)}
          />
        );
        break;
      case "campanas":
        content = (
          <MisCampanas
            contratos={contratos}
            paneles={paneles}
            clienteNombre={cliente?.empresa ?? ""}
            onAbrir={abrirContrato}
            onNueva={() => setView("nueva")}
            isAdmin={isAdmin}
            clienteId={clienteId}
            onMenuClick={() => setSidebarOpen(true)}
          />
        );
        break;
      case "detalle":
        content = contratoAbierto ? (
          <DetalleCampana
            contrato={contratoAbierto}
            paneles={paneles}
            clienteNombre={cliente?.empresa ?? ""}
            cliente={cliente}
            onBack={() => setView("campanas")}
            isAdmin={isAdmin}
          />
        ) : null;
        break;
      case "reportes":
        content = (
          <Reportes
            cliente={cliente}
            clienteId={clienteId}
            hayContratos={contratos.length > 0}
            contratos={contratos}
            paneles={paneles}
            isAdmin={isAdmin}
            onMenuClick={() => setSidebarOpen(true)}
          />
        );
        break;
      case "perfil":
        content = (
          <Perfil
            cliente={cliente}
            contratos={contratos}
            email={email}
            isAdmin={isAdmin}
            esInterno={esInterno}
            onCambiarCliente={onCambiarCliente}
            onNotifClick={() => setView("notificaciones")}
            totalNotifs={totalNotifs}
          />
        );
        break;
      case "nueva":
        content = (
          <NuevaCampana
            clienteId={clienteId}
            onBack={() => { setPrefillNueva(null); setView("campanas"); }}
            onEnviada={() => { setPrefillNueva(null); setView("campanas"); }}
            // Si venimos de "Solicitar disponibilidad/renovación" en
            // Cobertura (prefillNueva viene cargado), siempre es el
            // formulario simple de SOLICITUD -- aunque quien esté
            // viendo el cliente sea el admin, acá no correspondía
            // abrir el formulario completo de "Nuevo contrato" (eso
            // crea el contrato real de una, con selector de paneles y
            // fechas obligatorias). Este botón es para pedir, no para
            // crear directo.
            isAdmin={isAdmin && !prefillNueva}
            prefill={prefillNueva ?? undefined}
          />
        );
        break;
      case "cobertura":
        content = (
          <Cobertura
            contratos={contratos}
            contratosListos={contratosState.status === "ready"}
            onMenuClick={() => setSidebarOpen(true)}
            onSolicitarPanel={(panel, tipo) => {
              setPrefillNueva({
                nombre: tipo === "renovacion" ? `Renovación - ${panel.nombre}` : `Consulta - ${panel.nombre}`,
                ciudad: panel.ciudad,
                panelId: panel.id,
                panelNombre: panel.nombre,
                comentarios:
                  tipo === "renovacion"
                    ? `Quiero renovar mi campaña en el panel "${panel.nombre}" (${panel.ciudad}).`
                    : `Consulta de disponibilidad para el panel "${panel.nombre}" (${panel.ciudad}).`,
              });
              setView("nueva");
            }}
          />
        );
        break;
      case "mispantallas":
        content = <MisPantallas paneles={paneles} onBack={() => setView("inicio")} onMenuClick={() => setSidebarOpen(true)} />;
        break;
      case "analitica":
        content = isAdmin ? <AnaliticaClientes onBack={() => setView("inicio")} /> : null;
        break;
      case "solicitudes":
        content = isAdmin ? (
          <SolicitudesCampana
            onBack={() => setView("inicio")}
            onCrearCampana={(id) => {
              if (id !== clienteId) onSeleccionarCliente?.(id);
              else setView("nueva");
            }}
          />
        ) : null;
        break;
      case "accesos":
        content = isAdmin ? <Accesos onBack={() => setView("inicio")} esGerente={esGerente} /> : null;
        break;
      case "paneles":
        content = isAdmin ? <Paneles onBack={() => setView("inicio")} esGerente={esGerente} /> : null;
        break;
      case "ocupacion":
        content = isAdmin ? <Ocupacion onBack={() => setView("inicio")} /> : null;
        break;
      case "facturas":
        content = <Facturas ruc={rucCliente(cliente)} clienteId={clienteId} cliente={cliente} onBack={() => setView("inicio")} isAdmin={isAdmin} onMenuClick={() => setSidebarOpen(true)} contratos={contratos} />;
        break;
      case "notificaciones":
        content = <Notificaciones clienteId={clienteId} contratos={contratos} uid={uid} onBack={() => setView("inicio")} />;
        break;
      case "nuevoCliente":
        content = isAdmin ? (
          <CrearCliente
            cliente={cliente}
            clienteId={clienteId}
            onBack={() => setView("inicio")}
          />
        ) : null;
        break;
    }
  }

  return (
    <div className={`app-shell ${showBottomNav ? "has-bottom-nav" : "no-bottom-nav"}`}>
      <OfflineBanner online={online} />
      {mostrarOnboarding && <OnboardingTour uid={uid} onClose={() => setMostrarOnboarding(false)} />}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={(v) => setView(v)}
        onLogout={() => logout()}
        onCambiarCliente={onCambiarCliente}
        isAdmin={isAdmin}
        esGerente={esGerente}
        esInterno={esInterno}
        solicitudesPendientes={solCampPendientes}
        active={view}
        // El chip de perfil siempre muestra la identidad de quien está
        // REALMENTE conectado (esInterno), no la del modo de vista
        // actual (isAdmin) -- así, si el Gerente está "viendo como
        // cliente", el sidebar sigue mostrando su propio nombre/foto en
        // vez de saltar al logo/nombre de la empresa del cliente. Un
        // cliente real (esInterno=false) siempre ve su propia empresa.
        // Si no hay nombre propio guardado, se cae al rol (Gerente o
        // Trabajador) en vez de un genérico "Admin".
        perfilNombre={esInterno
          ? (esGerente === false ? (adminNombre || "Trabajador") : (adminNombre || "Gerente"))
          : (cliente?.empresa ?? "Cliente")}
        perfilAvatarKey={esInterno ? undefined : cliente?.avatarKey}
        perfilAvatarUrl={esInterno ? adminAvatarUrl : cliente?.avatarUrl}
        onOpenPerfil={() => {
          if (esInterno && onOpenAdminPerfil) onOpenAdminPerfil();
          else setView("perfil");
          setSidebarOpen(false);
        }}
      />
      <div className="main-area">
        <div className="screens">
          <div className="screen active">
            <Suspense
              fallback={
                <BrandLoader />
              }
            >
              {content}
            </Suspense>
          </div>
        </div>
        {showBottomNav && (
          <BottomNav
            active={activeTab}
            onChange={(tab) => setView(tab)}
            isAdmin={isAdmin}
            onCambiarCliente={onCambiarCliente}
          />
        )}
      </div>
    </div>
  );
}
