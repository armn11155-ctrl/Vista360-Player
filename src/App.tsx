import { Suspense, startTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { envMissing } from "./config/env";
import { useTareasPeriodicas } from "./hooks/useTareasPeriodicas";
import { anotarRutaActual, useDetectorDeBucles } from "./hooks/useDetectorDeBucles";
import { pantallaLazy, recargarPorVersionDesactualizada } from "./utils/pantallaLazy";

/** Arrays vacios COMPARTIDOS. Un `[]` escrito en el render es un objeto
 *  nuevo cada vez, y basta con eso para disparar efectos en bucle. */
const SIN_CONTRATOS: Contrato[] = [];
const SIN_SOLICITUDES: SolicitudCampana[] = [];

/** Si un cambio de pantalla tarda mas que esto, algo va mal. */
const ESPERA_MAXIMA_CAMBIO_MS = 8000;
/** Tiempo que tarda la cortina azul en cubrir por completo el contexto anterior. */
const CIERRE_VISUAL_MS = 260;
/** Dos cuadros dan tiempo al commit sin convertir la animación en espera. */
const PAUSA_VISUAL_MS = 20;
/** La salida hacia la izquierda revela el contexto nuevo ya renderizado. */
const APERTURA_VISUAL_MS = 300;
import { usePortalAuth, type AuthState } from "./hooks/usePortalAuth";
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
import RouteLoader from "./components/RouteLoader";


import BottomNav, { type Tab } from "./components/BottomNav";
import Sidebar from "./components/Sidebar";
import Inicio from "./components/screens/Inicio";




import { debeVerOnboarding } from "./utils/onboarding";
import { usePushEstado } from "./hooks/usePushEstado";
import { useRegistrarAcceso } from "./hooks/useRegistrarAcceso";
import { useRegistrarVisita } from "./hooks/useRegistrarVisita";
import { useNotificaciones } from "./hooks/useNotificaciones";
import { useSolicitudesPendientes } from "./hooks/useSolicitudesCampana";
import { useAvatarPropio } from "./hooks/useAvatarPropio";
import type { Contrato, SolicitudCampana } from "./types";
import { panelesDeContrato, rucCliente } from "./types";
import { cargarLeaflet } from "./utils/leaflet";
import { precargarPaneles } from "./hooks/usePanelesDisponibles";
import { reproducirSonidoInterfaz } from "./utils/sonidosInterfaz";

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
const Papelera = pantallaLazy(() => import("./components/screens/Papelera"));
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

type CargaPantalla = () => Promise<unknown>;

const PANTALLAS_PRIORITARIAS: CargaPantalla[] = [
  () => import("./components/screens/MisCampanas"),
  () => import("./components/screens/DetalleCampana"),
  () => import("./components/AdminClientPicker"),
  () => import("./components/screens/Cobertura"),
];

// Reportes y Facturas son destinos de navegación directa y sus chunks son
// pequeños (~5.5 kB y ~3.1 kB gzip). Esperar a requestIdleCallback para
// pedirlos funciona bien en escritorio, pero Safari/PWA puede postergar ese
// callback mientras termina de pintar la pantalla inicial. Se descargan apenas
// la sesión está lista, sin montar los componentes ni abrir consultas: cero
// lecturas adicionales y el primer toque ya encuentra el código en caché.
function precargarDocumentos() {
  void Promise.allSettled([
    import("./components/screens/Reportes"),
    import("./components/screens/Facturas"),
  ]);
}

const PANTALLAS_SECUNDARIAS: CargaPantalla[] = [
  () => import("./components/screens/NuevaCampana"),
  () => import("./components/screens/MisPantallas"),
  () => import("./components/screens/AnaliticaClientes"),
  () => import("./components/screens/AprobacionesGerente"),
  () => import("./components/screens/SolicitudesCampana"),
  () => import("./components/screens/Accesos"),
  () => import("./components/screens/Notificaciones"),
  () => import("./components/screens/CrearCliente"),
  () => import("./components/screens/Paneles"),
  () => import("./components/screens/Ocupacion"),
  () => import("./components/screens/Cotizaciones"),
  () => import("./components/screens/AdminPerfil"),
  () => import("./components/screens/Perfil"),
];

/** Deja todas las pantallas en caché apenas la sesión ya está lista.
 * Primero se solicitan las rutas más usadas y, en el siguiente microtask,
 * todas las demás. Así no se retrasa el login, pero una vez dentro los
 * cambios de pestaña no esperan una descarga por primera vez. */
function precargarTodasLasPantallas() {
  const prioritarias = Promise.allSettled(PANTALLAS_PRIORITARIAS.map((cargar) => cargar()));

  // La version anterior disparaba las 19 rutas casi en el mismo instante:
  // primero seis y, en el microtask siguiente, todas las demas. En una red
  // movil eso hace que las pantallas importantes compitan con herramientas
  // raras y con jsPDF/Leaflet. Se siguen descargando TODAS en segundo plano,
  // pero las secundarias van en lotes de cuatro cuando termina el grupo
  // prioritario. El usuario conserva cambios instantaneos sin ahogar la
  // conexion justo despues de iniciar sesion.
  void prioritarias.then(async () => {
    for (let inicio = 0; inicio < PANTALLAS_SECUNDARIAS.length; inicio += 4) {
      const lote = PANTALLAS_SECUNDARIAS.slice(inicio, inicio + 4);
      await Promise.allSettled(lote.map((cargar) => cargar()));
    }
  });

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
  precargarPaneles();
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
  | "aprobaciones"
  | "papelera";

const CARGADORES_POR_VISTA: Partial<Record<View, CargaPantalla>> = {
  campanas: () => import("./components/screens/MisCampanas"),
  detalle: () => import("./components/screens/DetalleCampana"),
  nueva: () => import("./components/screens/NuevaCampana"),
  cobertura: () => import("./components/screens/Cobertura"),
  mispantallas: () => import("./components/screens/MisPantallas"),
  reportes: () => import("./components/screens/Reportes"),
  facturas: () => import("./components/screens/Facturas"),
  perfil: () => import("./components/screens/Perfil"),
  analitica: () => import("./components/screens/AnaliticaClientes"),
  solicitudes: () => import("./components/screens/SolicitudesCampana"),
  accesos: () => import("./components/screens/Accesos"),
  notificaciones: () => import("./components/screens/Notificaciones"),
  nuevoCliente: () => import("./components/screens/CrearCliente"),
  miPerfil: () => import("./components/screens/AdminPerfil"),
  paneles: () => import("./components/screens/Paneles"),
  ocupacion: () => import("./components/screens/Ocupacion"),
  cotizaciones: () => import("./components/screens/Cotizaciones"),
  aprobaciones: () => import("./components/screens/AprobacionesGerente"),
  papelera: () => import("./components/screens/Papelera"),
};

function precargarVista(vista: View) {
  const cargar = CARGADORES_POR_VISTA[vista];
  if (cargar) void cargar().catch(() => undefined);
  if (vista === "cobertura") {
    void cargarLeaflet().catch(() => undefined);
    precargarPaneles();
  }
}

function NavigationProgress({ visible }: { visible: boolean }) {
  return (
    <div
      className={`navigation-progress${visible ? " is-visible" : ""}`}
      role="status"
      aria-label="Preparando la sección"
      aria-hidden={visible ? undefined : true}
    >
      <span />
    </div>
  );
}

// Color real del header de cada pantalla — debe coincidir exactamente con
// el background de su header (.header-dark, .header-light, etc). Se usa
// para sincronizar la barra de estado (ver useThemeColor).
const VIEW_COLORS: Record<View, string> = {
  inicio: "#050A12",
  campanas: "#050A12",
  detalle: "#0B1220",
  reportes: "#050A12",
  perfil: "#050A12",
  nueva: "#0B1220",
  cobertura: "#050A12",
  mispantallas: "#0B1220",
  analitica: "#0B1220",
  solicitudes: "#0B1220",
  accesos: "#0B1220",
  facturas: "#050A12",
  notificaciones: "#0B1220",
  nuevoCliente: "#0B1220",
  miPerfil: "#0B1220",
  paneles: "#0B1220",
  ocupacion: "#0B1220",
  cotizaciones: "#01040B",
  aprobaciones: "#0B1220",
  papelera: "#0B1220",
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
  "papelera",
]);

export default function App() {
  // Red de seguridad en tiempo de ejecución: avisa si algo desboca los
  // renders. Los detectores estáticos solo ven los patrones conocidos y
  // dentro de un archivo; un bucle puede formarse entre varios.
  useDetectorDeBucles("App");
  const authActual = usePortalAuth();
  // La autenticación real puede resolver antes que la cortina visual. Mantener
  // una copia presentada permite cerrar primero el login, sustituirlo mientras
  // está cubierto y revelar recién entonces la aplicación ya cargada.
  const [auth, setAuthPresentada] = useState<AuthState>(authActual);
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
  const [vistaSolicitada, setVistaSolicitada] = useState<View | null>(null);
  const [mostrarIndicadorNavegacion, setMostrarIndicadorNavegacion] = useState(false);
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
  const cambioEnCursoRef = useRef(cambioEnCurso);
  const cambiosVisualesPendientesRef = useRef<Array<() => void>>([]);
  const relojCierreVisualRef = useRef<number | null>(null);
  const relojPausaVisualRef = useRef<number | null>(null);
  const relojLimpiezaVisualRef = useRef<number | null>(null);
  const revelarAlCompletarRef = useRef(false);
  const authEnTransicionRef = useRef<AuthState | null>(null);

  cambioEnCursoRef.current = cambioEnCurso;

  function finalizarTransicionVisual() {
    if (!revelarAlCompletarRef.current || typeof document === "undefined") return;
    revelarAlCompletarRef.current = false;
    const raiz = document.documentElement;
    if (relojPausaVisualRef.current !== null) window.clearTimeout(relojPausaVisualRef.current);
    relojPausaVisualRef.current = window.setTimeout(() => {
      relojPausaVisualRef.current = null;
      raiz.dataset.v360PageTransition = "revealing";
      if (relojLimpiezaVisualRef.current !== null) window.clearTimeout(relojLimpiezaVisualRef.current);
      relojLimpiezaVisualRef.current = window.setTimeout(() => {
        delete raiz.dataset.v360PageTransition;
        relojLimpiezaVisualRef.current = null;
      }, APERTURA_VISUAL_MS);
    }, PAUSA_VISUAL_MS);
  }

  /**
   * Reserva la cortina para cambios de contexto reales: iniciar/cerrar sesión
   * y entrar/salir de una cuenta. Las pestañas internas conservan la navegación
   * rápida de React y no pasan por esta animación de producto.
   */
  function programarCambioDePantalla(actualizar: () => void) {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      comenzarCambioDePantalla(actualizar);
      return;
    }

    cambiosVisualesPendientesRef.current.push(actualizar);
    if (relojCierreVisualRef.current !== null) return;

    if (relojLimpiezaVisualRef.current !== null) {
      window.clearTimeout(relojLimpiezaVisualRef.current);
      relojLimpiezaVisualRef.current = null;
    }
    if (relojPausaVisualRef.current !== null) {
      window.clearTimeout(relojPausaVisualRef.current);
      relojPausaVisualRef.current = null;
    }
    document.documentElement.dataset.v360PageTransition = "covering";

    relojCierreVisualRef.current = window.setTimeout(() => {
      relojCierreVisualRef.current = null;
      const actualizaciones = cambiosVisualesPendientesRef.current.splice(0);
      revelarAlCompletarRef.current = true;
      comenzarCambioDePantalla(() => actualizaciones.forEach((cambiar) => cambiar()));

      // Una pantalla ya precargada puede completar la transición de React sin
      // exponer un render intermedio con isPending=true. Dos frames garantizan
      // que la vista nueva se haya pintado antes de abrir la cortina.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!cambioEnCursoRef.current) finalizarTransicionVisual();
      }));
    }, CIERRE_VISUAL_MS);
  }

  useEffect(() => {
    if (authActual === auth) return;

    const cambiaContextoDeSesion =
      (auth.status === "out" && authActual.status === "in") ||
      (auth.status === "in" && authActual.status === "out");

    if (!cambiaContextoDeSesion) {
      setAuthPresentada(authActual);
      return;
    }

    // React StrictMode puede ejecutar el efecto dos veces en desarrollo; esta
    // referencia impide apilar dos cortinas para el mismo cambio de sesión.
    if (authEnTransicionRef.current === authActual) return;
    authEnTransicionRef.current = authActual;
    if (auth.status === "out" && authActual.status === "in") {
      reproducirSonidoInterfaz("acceso");
    }
    programarCambioDePantalla(() => {
      setAuthPresentada(authActual);
      authEnTransicionRef.current = null;
    });
    // programarCambioDePantalla opera únicamente sobre refs estables y el DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authActual, auth.status]);

  useEffect(() => {
    if (!cambioEnCurso) return;
    const reloj = setTimeout(() => {
      console.error("El cambio de pantalla no se completa; se recarga la aplicacion.");
      recargarPorVersionDesactualizada();
    }, ESPERA_MAXIMA_CAMBIO_MS);
    return () => clearTimeout(reloj);
  }, [cambioEnCurso]);

  useEffect(() => {
    if (!cambioEnCurso) finalizarTransicionVisual();
    // finalizarTransicionVisual solo opera sobre refs y el dataset global.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cambioEnCurso]);

  useEffect(() => {
    if (!cambioEnCurso) {
      setMostrarIndicadorNavegacion(false);
      return;
    }
    const reloj = window.setTimeout(() => setMostrarIndicadorNavegacion(true), 140);
    return () => window.clearTimeout(reloj);
  }, [cambioEnCurso]);

  useEffect(() => () => {
    if (relojCierreVisualRef.current !== null) window.clearTimeout(relojCierreVisualRef.current);
    if (relojPausaVisualRef.current !== null) window.clearTimeout(relojPausaVisualRef.current);
    if (relojLimpiezaVisualRef.current !== null) window.clearTimeout(relojLimpiezaVisualRef.current);
    delete document.documentElement.dataset.v360PageTransition;
  }, []);

  function setView(v: View) {
    if (v === view && !cambioEnCurso) return;
    setVistaSolicitada(v);
    precargarVista(v);
    comenzarCambioDePantalla(() => setViewInmediato(v));
  }
  // Solo el NOMBRE de la pantalla, para que el aviso de bucle diga dónde
  // pasó. Nada de identificadores de cliente ni contenido.
  anotarRutaActual(view);
  // Guardián de las tareas periódicas: una lectura por sesión de
  // personal interno. Los clientes no pagan nada por esto.
  useTareasPeriodicas(auth.status === "in" && auth.role !== "cliente");
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
    programarCambioDePantalla(() => setAdminClienteIdInmediato(id));
  }
  // El selector ya tiene los clientes en memoria y las pantallas de uso
  // frecuente están precargadas. Para cambiar entre cuentas no se necesita la
  // cortina breve reservada al login/logout: se actualizan cuenta y vista
  // en la misma transición de React y el listener revalida detrás.
  function cambiarClienteSinEspera(id: string | null, destino: View = "inicio") {
    setVistaSolicitada(destino);
    precargarVista(destino);
    comenzarCambioDePantalla(() => {
      setAdminClienteIdInmediato(id);
      setViewInmediato(destino);
    });
  }
  // Cuando se vuelve con "atrás" desde Usuarios/Solicitudes/Analítica/
  // Paneles, hay que reabrir Centro de gestión (de donde salió esta
  // navegación), no la Selección de clientes de cero -- ver
  // AdminClientPicker.tsx (gestionInicial).
  const [volverAGestion, setVolverAGestionInmediato] = useState(false);
  function setVolverAGestion(v: boolean) {
    // Es una bandera interna que se consume al montar el selector; animarla
    // produciría una segunda cortina después de haber llegado a Gestión.
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
        ? "#071D48"
        : auth.status === "error"
          ? "#0B1220"
        : auth.status === "out"
          ? "#050A12"
          : (auth.role === "admin" || auth.role === "trabajador") && !adminClienteId
            ? "#071D48"
            : VIEW_COLORS[view] ?? "#0B1220";
  // El lienzo que queda DETRÁS de las pantallas siempre conserva el color
  // del header. Cada módulo sigue pintando su contenido claro por encima,
  // pero iOS ya no alcanza a enseñar un fondo blanco en el safe-area o
  // durante el instante en que React cambia un chunk por otro.
  const pageBackground = themeColor;
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
        <LoginScreen onLoggedIn={() => setViewInmediato("inicio")} />
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
      if (view === "solicitudes" || view === "accesos" || view === "analitica" || view === "miPerfil" || view === "paneles" || view === "ocupacion" || view === "cotizaciones" || (view === "aprobaciones" && esGerente) || (view === "papelera" && esGerente)) {
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
            <NavigationProgress visible={mostrarIndicadorNavegacion} />
            <Suspense
              fallback={
                <RouteLoader />
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
                  ? <Accesos onBack={() => { setVolverAGestion(true); setView("inicio"); }} esGerente={esGerente} uidPropio={auth.user.uid} />
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
                        : view === "papelera"
                          ? <Papelera onBack={() => { setVolverAGestion(true); setView("inicio"); }} />
                          : <AnaliticaClientes onBack={() => { setVolverAGestion(true); setView("inicio"); }} />}
            </Suspense>
          </div>
        );
      }
      return (
        <div className="app-shell">
          <OfflineBanner online={online} />
          <NavigationProgress visible={mostrarIndicadorNavegacion} />
          {/* Suspense porque AdminClientPicker ahora se carga bajo demanda
              (antes venía en el bundle inicial). Sin esto, React lanza al
              suspenderse. */}
          <Suspense fallback={<BrandLoader />}>
          <AdminClientPicker
            onSelect={(id) => {
              reproducirSonidoInterfaz("cuenta");
              cambiarClienteSinEspera(id);
            }}
            onOpenUsuarios={() => setView("accesos")}
            onOpenSolicitudes={() => setView("solicitudes")}
            onOpenAnalitica={() => setView("analitica")}
            onOpenPerfil={() => setView("miPerfil")}
            onOpenPaneles={() => setView("paneles")}
            onOpenOcupacion={() => setView("ocupacion")}
            onOpenCotizaciones={() => setView("cotizaciones")}
            onOpenAprobaciones={esGerente ? () => setView("aprobaciones") : undefined}
            onOpenPapelera={esGerente ? () => setView("papelera") : undefined}
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
        vistaPendiente={vistaSolicitada}
        mostrarIndicadorNavegacion={mostrarIndicadorNavegacion}
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
          cambiarClienteSinEspera(null);
          setAdminVistaCliente(false);
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
      vistaPendiente={vistaSolicitada}
      mostrarIndicadorNavegacion={mostrarIndicadorNavegacion}
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
  vistaPendiente: View | null;
  mostrarIndicadorNavegacion: boolean;
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
  vistaPendiente,
  mostrarIndicadorNavegacion,
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
  // Tras el login (y al entrar a otra cuenta), la cortina de continuidad
  // permanece encima hasta que la primera pantalla ya tiene sus campañas. Cuando los
  // datos están listos se esperan dos frames para que React pinte el destino
  // detrás y recién entonces se retira la cortina: nunca se revela un
  // esqueleto intermedio por culpa de una conexión lenta.
  const [clienteLoaderId, setClienteLoaderId] = useState(clienteId);
  const [loaderInicialVisible, setLoaderInicialVisible] = useState(true);
  const [loaderInicialSaliendo, setLoaderInicialSaliendo] = useState(false);
  useEffect(() => {
    setClienteLoaderId(clienteId);
    setLoaderInicialVisible(true);
    setLoaderInicialSaliendo(false);
  }, [clienteId]);
  useEffect(() => {
    if (clienteLoaderId !== clienteId || contratosState.status === "loading") return;
    if (contratosState.status === "error") {
      setLoaderInicialSaliendo(false);
      setLoaderInicialVisible(false);
      return;
    }

    let segundoFrame = 0;
    let relojSalida = 0;
    const primerFrame = window.requestAnimationFrame(() => {
      segundoFrame = window.requestAnimationFrame(() => {
        setLoaderInicialSaliendo(true);
        relojSalida = window.setTimeout(() => setLoaderInicialVisible(false), 300);
      });
    });
    return () => {
      window.cancelAnimationFrame(primerFrame);
      if (segundoFrame) window.cancelAnimationFrame(segundoFrame);
      if (relojSalida) window.clearTimeout(relojSalida);
    };
  }, [clienteId, clienteLoaderId, contratosState.status]);
  const mostrarLoaderInicial = clienteLoaderId !== clienteId || loaderInicialVisible;
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
  const panelIdsContratados = useMemo(
    () => contratos.flatMap((contrato) => panelesDeContrato(contrato)),
    [contratos],
  );
  const paneles = usePaneles(panelIdsContratados);
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
    // No competir con la autenticación. En cuanto ya existe una sesión,
    // Reportes/Facturas se piden de inmediato porque son destinos frecuentes;
    // el resto conserva la precarga ociosa y escalonada para no saturar móvil.
    if (!uid) return;
    precargarDocumentos();
    const idle = (window as any).requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 800));
    const cancelar = (window as any).cancelIdleCallback ?? window.clearTimeout;
    const id = idle(precargarTodasLasPantallas, { timeout: 1200 });
    return () => cancelar(id);
  }, [uid]);

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
  // el aviso; se apaga cuando quedó activado o, solo en laptop, cuando
  // la persona decide configurarlo después. Se mantiene "enganchado"
  // (abierto) una vez que se
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
  // En computadora también se explica el desbloqueo, pero el aviso trae
  // una salida explícita para continuar sin activarlo. En celular sigue
  // siendo obligatorio y se dirige a Ajustes del sistema.
  const [notifPromptAbierto, setNotifPromptAbierto] = useState(false);
  useEffect(() => {
    if (mostrarOnboarding) return;
    if (pushEstadoGlobal.estado === "ofrecer") {
      setNotifPromptAbierto(true);
    } else if (pushEstadoGlobal.estado === "bloqueado") {
      setNotifPromptAbierto(true);
    }
  }, [mostrarOnboarding, pushEstadoGlobal.estado]);
  const mostrarNotifPrompt = notifPromptAbierto;

  const showBottomNav = view !== "detalle" && view !== "nueva" && !SIDEBAR_VIEWS.has(view);
  const rutaNavegacion = vistaPendiente ?? view;
  const activeTab: Tab =
    rutaNavegacion === "detalle" || rutaNavegacion === "nueva" || SIDEBAR_VIEWS.has(rutaNavegacion)
      ? "inicio"
      : (rutaNavegacion as Tab);

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
      <RouteLoader label="Actualizando campañas" />
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
            onNotifClick={() => setView("notificaciones")}
            totalNotifs={totalNotifs}
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
            onUpdated={(cambios) => {
              setContratoAbierto({ ...contratoAbierto, ...cambios });
            }}
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
            onNotifClick={() => setView("notificaciones")}
            totalNotifs={totalNotifs}
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
            onNotifClick={() => setView("notificaciones")}
            totalNotifs={totalNotifs}
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
        content = isAdmin ? <Accesos onBack={() => setView("inicio")} esGerente={esGerente} uidPropio={uid} /> : null;
        break;
      case "paneles":
        content = isAdmin ? <Paneles onBack={() => setView("inicio")} esGerente={esGerente} /> : null;
        break;
      case "ocupacion":
        content = isAdmin ? <Ocupacion onBack={() => setView("inicio")} /> : null;
        break;
      case "facturas":
        content = <Facturas ruc={rucCliente(cliente)} clienteId={clienteId} cliente={cliente} onBack={() => setView("inicio")} isAdmin={isAdmin} onMenuClick={() => setSidebarOpen(true)} onNotifClick={() => setView("notificaciones")} totalNotifs={totalNotifs} contratos={contratos} />;
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
    <div
      className={`app-shell ${showBottomNav ? "has-bottom-nav" : "no-bottom-nav"}${vistaPendiente && vistaPendiente !== view ? " navigation-is-pending" : ""}`}
      aria-busy={vistaPendiente && vistaPendiente !== view ? true : undefined}
    >
      <OfflineBanner online={online} />
      <NavigationProgress visible={mostrarIndicadorNavegacion} />
      {mostrarLoaderInicial && contratosState.status !== "error" && (
        <BrandLoader label="Preparando tu cuenta" leaving={loaderInicialSaliendo} />
      )}
      {mostrarOnboarding && <OnboardingTour uid={uid} onClose={() => setMostrarOnboarding(false)} />}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={(v) => setView(v)}
        onIntentNavigate={(v) => precargarVista(v)}
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
                <RouteLoader />
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
            onIntent={(tab) => precargarVista(tab)}
            isAdmin={isAdmin}
            onCambiarCliente={onCambiarCliente}
          />
        )}
      </div>
    </div>
  );
}
