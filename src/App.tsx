import { lazy, Suspense, useState } from "react";
import { envMissing } from "./config/env";
import { usePortalAuth } from "./hooks/usePortalAuth";
import { useCliente } from "./hooks/useCliente";
import { useContratos } from "./hooks/useContratos";
import { usePaneles } from "./hooks/usePaneles";
import { useThemeColor } from "./hooks/useThemeColor";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { logout } from "./config/firebase";
import ConfigMissing from "./components/ConfigMissing";
import OfflineBanner from "./components/OfflineBanner";
import LoginScreen from "./components/LoginScreen";
import BrandLoader from "./components/BrandLoader";
import AdminClientPicker from "./components/AdminClientPicker";
import AdminPerfil from "./components/screens/AdminPerfil";
import BottomNav, { type Tab } from "./components/BottomNav";
import Sidebar from "./components/Sidebar";
import Inicio from "./components/screens/Inicio";
import MisCampanas from "./components/screens/MisCampanas";
import Evidencias from "./components/screens/Evidencias";
import Reportes from "./components/screens/Reportes";
import Perfil from "./components/screens/Perfil";
import OnboardingTour, { debeVerOnboarding } from "./components/OnboardingTour";
import { useRegistrarAcceso } from "./hooks/useRegistrarAcceso";
import { useRegistrarVisita } from "./hooks/useRegistrarVisita";
import { useNotificaciones } from "./hooks/useNotificaciones";
import { useSolicitudesCampana } from "./hooks/useSolicitudesCampana";
import type { Contrato } from "./types";

// Pantallas que NO se necesitan de entrada — se piden al navegador solo
// cuando el cliente realmente entra a esa sección (tocar una campaña,
// abrir el menú lateral, etc). Esto es lo que baja el peso del bundle
// inicial: nadie descarga el código de "Cobertura" o "Analítica" solo
// para ver "Inicio".
const DetalleCampana = lazy(() => import("./components/screens/DetalleCampana"));
const NuevaCampana = lazy(() => import("./components/screens/NuevaCampana"));
const Portafolio = lazy(() => import("./components/screens/Portafolio"));
const Cobertura = lazy(() => import("./components/screens/Cobertura"));
const MisPantallas = lazy(() => import("./components/screens/MisPantallas"));
const Impacto = lazy(() => import("./components/screens/Impacto"));
const Contactanos = lazy(() => import("./components/screens/Contactanos"));
const AnaliticaClientes = lazy(() => import("./components/screens/AnaliticaClientes"));
const SolicitudesCampana = lazy(() => import("./components/screens/SolicitudesCampana"));
const Accesos = lazy(() => import("./components/screens/Accesos"));
const Facturas = lazy(() => import("./components/screens/Facturas"));
const Notificaciones = lazy(() => import("./components/screens/Notificaciones"));
const CrearCliente = lazy(() => import("./components/screens/CrearCliente"));

type View =
  | Tab
  | "detalle"
  | "evidencias"
  | "nueva"
  | "portafolio"
  | "mispantallas"
  | "impacto"
  | "contactanos"
  | "analitica"
  | "solicitudes"
  | "accesos"
  | "facturas"
  | "notificaciones"
  | "nuevoCliente"
  | "miPerfil";

// Color real del header de cada pantalla — debe coincidir exactamente con
// el background de su header (.header-dark, .header-light, etc). Se usa
// para sincronizar la barra de estado (ver useThemeColor).
const VIEW_COLORS: Record<View, string> = {
  inicio: "#050A12",
  campanas: "#0B1220",
  detalle: "#0B1220",
  evidencias: "#0B1220",
  reportes: "#0B1220",
  perfil: "#050A12",
  nueva: "#0B1220",
  portafolio: "#0B1220",
  cobertura: "#0B1220",
  mispantallas: "#0B1220",
  impacto: "#0B1220",
  contactanos: "#0B1220",
  analitica: "#0B1220",
  solicitudes: "#0B1220",
  accesos: "#0B1220",
  facturas: "#0B1220",
  notificaciones: "#0B1220",
  nuevoCliente: "#0B1220",
  miPerfil: "#0B1220",
};

// Vistas que se abren desde el menú lateral (☰) y no desde la barra
// inferior — se navegan igual que "detalle"/"nueva": pantalla completa,
// con su propio botón de regreso, sin la barra inferior compitiendo.
const SIDEBAR_VIEWS = new Set<View>([
  "portafolio",
  "mispantallas",
  "impacto",
  "contactanos",
  "analitica",
  "solicitudes",
  "accesos",
  "facturas",
  "notificaciones",
  "nuevoCliente",
]);

export default function App() {
  const auth = usePortalAuth();
  const online = useOnlineStatus();
  const uid = auth.status === "in" ? auth.user.uid : undefined;
  useRegistrarAcceso(uid);
  const [view, setView] = useState<View>("inicio");
  useRegistrarVisita(uid, view);
  const [contratoAbierto, setContratoAbierto] = useState<Contrato | null>(null);
  // Solo lo usa el admin: a qué cliente está viendo ahora. null = todavía
  // no eligió ninguno -> se le muestra el selector.
  const [adminClienteId, setAdminClienteId] = useState<string | null>(null);

  // Color de la pantalla que se está mostrando AHORA MISMO, sin importar
  // el estado (login, cargando, selector de cliente, o ya adentro) — debe
  // calcularse antes de cualquier "return" de abajo porque los hooks no
  // pueden ser condicionales.
  const themeColor =
    envMissing.length > 0
      ? "#1a0707"
      : auth.status === "loading" || auth.status === "error"
        ? "#0B1220"
        : auth.status === "out"
          ? "#050A12"
          : auth.role === "admin" && !adminClienteId
            ? "#050A12"
            : VIEW_COLORS[view] ?? "#0B1220";
  const pageBackground =
    auth.status === "in" && !(auth.role === "admin" && !adminClienteId)
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
        <BrandLoader />
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
  if (auth.role === "admin") {
    if (!adminClienteId) {
      if (view === "solicitudes" || view === "accesos" || view === "analitica" || view === "miPerfil") {
        return (
          <div className="app-shell">
            <OfflineBanner online={online} />
            <Suspense
              fallback={
                <BrandLoader />
              }
            >
              {view === "solicitudes"
                ? <SolicitudesCampana
                    onBack={() => setView("inicio")}
                    onCrearCampana={(id) => {
                      setAdminClienteId(id);
                      setView("nueva");
                    }}
                  />
                : view === "accesos"
                  ? <Accesos onBack={() => setView("inicio")} />
                  : view === "miPerfil"
                    ? <AdminPerfil uid={auth.user.uid} nombre={auth.nombre ?? ""} email={auth.user.email ?? ""} onBack={() => setView("inicio")} />
                    : <AnaliticaClientes onBack={() => setView("inicio")} />}
            </Suspense>
          </div>
        );
      }
      return (
        <div className="app-shell">
          <OfflineBanner online={online} />
          <AdminClientPicker
            onSelect={(id) => { setAdminClienteId(id); setView("inicio"); }}
            onOpenUsuarios={() => setView("accesos")}
            onOpenSolicitudes={() => setView("solicitudes")}
            onOpenAnalitica={() => setView("analitica")}
            onOpenPerfil={() => setView("miPerfil")}
            adminIniciales={(auth.nombre ?? "A").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")}
            uid={uid}
          />
        </div>
      );
    }
    return (
      <AuthenticatedApp
        clienteId={adminClienteId}
        email={auth.user.email ?? ""}
        view={view}
        setView={setView}
        contratoAbierto={contratoAbierto}
        setContratoAbierto={setContratoAbierto}
        isAdmin
        adminNombre={auth.nombre}
        online={online}
        onSeleccionarCliente={(id) => {
          setAdminClienteId(id);
          setView("nueva");
        }}
        onCambiarCliente={() => {
          setAdminClienteId(null);
          setView("inicio");
        }}
      />
    );
  }

  return (
    <AuthenticatedApp
      clienteId={auth.clienteId ?? ""}
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
  email: string;
  view: View;
  setView: (v: View) => void;
  contratoAbierto: Contrato | null;
  setContratoAbierto: (c: Contrato | null) => void;
  isAdmin: boolean;
  adminNombre?: string | null;
  onCambiarCliente?: () => void;
  onSeleccionarCliente?: (clienteId: string) => void;
  online: boolean;
}

function AuthenticatedApp({
  clienteId,
  email,
  view,
  setView,
  contratoAbierto,
  setContratoAbierto,
  isAdmin,
  adminNombre,
  onCambiarCliente,
  onSeleccionarCliente,
  online,
}: AuthenticatedProps) {
  const cliente = useCliente(clienteId);
  const contratosState = useContratos(clienteId);
  const contratos = contratosState.status === "ready" ? contratosState.contratos : [];
  const notifState = useNotificaciones(clienteId);
  const totalNotifs = notifState.status === "ready" ? notifState.total : 0;
  const solCampState = useSolicitudesCampana(!!isAdmin);
  const solCampPendientes = solCampState.status === "ready"
    ? solCampState.solicitudes.filter((s) => s.estado === "Pendiente").length
    : 0;
  const paneles = usePaneles(contratos.map((c) => c.panel_id));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(() => !isAdmin && debeVerOnboarding());

  const showBottomNav = view !== "detalle" && view !== "nueva" && !SIDEBAR_VIEWS.has(view);
  const activeTab: Tab =
    view === "detalle" || view === "evidencias" || view === "nueva" || SIDEBAR_VIEWS.has(view) ? "inicio" : (view as Tab);

  function abrirContrato(c: Contrato) {
    setContratoAbierto(c);
    setView("detalle");
  }

  let content: React.ReactNode = null;

  if (contratosState.status === "loading") {
    content = (
      <BrandLoader label="Cargando campañas" />
    );
  } else if (contratosState.status === "error") {
    content = (
      <div className="state-screen">
        <div className="state-title">No se pudieron cargar las campañas</div>
        <div className="state-sub">{contratosState.message}</div>
        <button className="retry-btn" onClick={contratosState.retry}>
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
            onMenuClick={() => setSidebarOpen(true)}
            onNotifClick={() => setView("notificaciones")}
            onCambiarCliente={onCambiarCliente}
            totalNotifs={totalNotifs}
            isAdmin={isAdmin}
            adminNombre={adminNombre}
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
            panel={paneles[contratoAbierto.panel_id]}
            clienteNombre={cliente?.empresa ?? ""}
            cliente={cliente}
            onBack={() => setView("campanas")}
            isAdmin={isAdmin}
          />
        ) : null;
        break;
      case "evidencias":
        content = <Evidencias contratos={contratos} paneles={paneles} isAdmin={isAdmin} />;
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
            onCambiarCliente={onCambiarCliente}
            onContactanos={() => setView("contactanos")}
            onNotifClick={() => setView("notificaciones")}
            totalNotifs={totalNotifs}
          />
        );
        break;
      case "nueva":
        content = (
          <NuevaCampana
            clienteId={clienteId}
            onBack={() => setView("campanas")}
            onEnviada={() => setView("campanas")}
            isAdmin={isAdmin}
          />
        );
        break;
      case "portafolio":
        content = <Portafolio onBack={() => setView("inicio")} onContactar={() => setView("contactanos")} />;
        break;
      case "cobertura":
        content = <Cobertura paneles={paneles} contratos={contratos} onMenuClick={() => setSidebarOpen(true)} />;
        break;
      case "mispantallas":
        content = <MisPantallas paneles={paneles} onBack={() => setView("inicio")} onMenuClick={() => setSidebarOpen(true)} />;
        break;
      case "impacto":
        content = <Impacto onBack={() => setView("inicio")} />;
        break;
      case "contactanos":
        content = <Contactanos cliente={cliente} onBack={() => setView("inicio")} />;
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
        content = isAdmin ? <Accesos onBack={() => setView("inicio")} /> : null;
        break;
      case "facturas":
        content = <Facturas ruc={cliente?.ruc} onBack={() => setView("inicio")} isAdmin={isAdmin} onMenuClick={() => setSidebarOpen(true)} />;
        break;
      case "notificaciones":
        content = <Notificaciones clienteId={clienteId} onBack={() => setView("inicio")} />;
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
      {mostrarOnboarding && <OnboardingTour onClose={() => setMostrarOnboarding(false)} />}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={(v) => setView(v)}
        onLogout={() => logout()}
        onCambiarCliente={onCambiarCliente}
        isAdmin={isAdmin}
        solicitudesPendientes={solCampPendientes}
        active={view}
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
