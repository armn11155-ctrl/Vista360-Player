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
import AdminClientPicker from "./components/AdminClientPicker";
import BottomNav, { type Tab } from "./components/BottomNav";
import Sidebar from "./components/Sidebar";
import Inicio from "./components/screens/Inicio";
import MisCampanas from "./components/screens/MisCampanas";
import Evidencias from "./components/screens/Evidencias";
import Reportes from "./components/screens/Reportes";
import Perfil from "./components/screens/Perfil";
import { useRegistrarAcceso } from "./hooks/useRegistrarAcceso";
import { useRegistrarVisita } from "./hooks/useRegistrarVisita";
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

type View =
  | Tab
  | "detalle"
  | "nueva"
  | "portafolio"
  | "cobertura"
  | "mispantallas"
  | "impacto"
  | "contactanos"
  | "analitica";

// Color real del header de cada pantalla — debe coincidir exactamente con
// el background de su header (.header-dark, .header-light, etc). Se usa
// para sincronizar la barra de estado (ver useThemeColor).
const VIEW_COLORS: Record<View, string> = {
  inicio: "#0D1B2E",
  campanas: "#0D1629",
  detalle: "#0D1629",
  evidencias: "#0D1629",
  reportes: "#0D1629",
  perfil: "#0D1629",
  nueva: "#0D1629",
  portafolio: "#0D1629",
  cobertura: "#0D1629",
  mispantallas: "#0D1629",
  impacto: "#0D1629",
  contactanos: "#0D1629",
  analitica: "#0D1629",
};

// Vistas que se abren desde el menú lateral (☰) y no desde la barra
// inferior — se navegan igual que "detalle"/"nueva": pantalla completa,
// con su propio botón de regreso, sin la barra inferior compitiendo.
const SIDEBAR_VIEWS = new Set<View>([
  "portafolio",
  "cobertura",
  "mispantallas",
  "impacto",
  "contactanos",
  "analitica",
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
        ? "#0D1629"
        : auth.status === "out"
          ? "#060C1A"
          : auth.role === "admin" && !adminClienteId
            ? "#0D1629"
            : VIEW_COLORS[view] ?? "#0D1629";
  useThemeColor(themeColor);

  if (envMissing.length > 0) {
    return <ConfigMissing missing={envMissing} />;
  }

  if (auth.status === "loading") {
    return (
      <div className="app-shell">
        <OfflineBanner online={online} />
        <div className="state-screen">
          <div className="state-title">Cargando…</div>
        </div>
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
      return (
        <div className="app-shell">
          <OfflineBanner online={online} />
          <AdminClientPicker onSelect={(id) => { setAdminClienteId(id); setView("inicio"); }} />
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
  online,
}: AuthenticatedProps) {
  const cliente = useCliente(clienteId);
  const contratosState = useContratos(clienteId);
  const contratos = contratosState.status === "ready" ? contratosState.contratos : [];
  const paneles = usePaneles(contratos.map((c) => c.panel_id));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showBottomNav = view !== "detalle" && view !== "nueva" && !SIDEBAR_VIEWS.has(view);
  const activeTab: Tab =
    view === "detalle" || view === "nueva" || SIDEBAR_VIEWS.has(view) ? "inicio" : (view as Tab);

  function abrirContrato(c: Contrato) {
    setContratoAbierto(c);
    setView("detalle");
  }

  let content: React.ReactNode = null;

  if (contratosState.status === "loading") {
    content = (
      <div className="state-screen">
        <div className="state-title">Cargando campañas…</div>
      </div>
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
            contratos={contratos}
            paneles={paneles}
            onGoTo={(tab) => setView(tab)}
            onMenuClick={() => setSidebarOpen(true)}
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
          />
        );
        break;
      case "detalle":
        content = contratoAbierto ? (
          <DetalleCampana
            contrato={contratoAbierto}
            panel={paneles[contratoAbierto.panel_id]}
            clienteNombre={cliente?.empresa ?? ""}
            onBack={() => setView("campanas")}
            isAdmin={isAdmin}
          />
        ) : null;
        break;
      case "evidencias":
        content = <Evidencias contratos={contratos} paneles={paneles} isAdmin={isAdmin} />;
        break;
      case "reportes":
        content = <Reportes clienteId={clienteId} hayContratos={contratos.length > 0} />;
        break;
      case "perfil":
        content = (
          <Perfil cliente={cliente} email={email} isAdmin={isAdmin} onCambiarCliente={onCambiarCliente} />
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
        content = <Cobertura onBack={() => setView("inicio")} />;
        break;
      case "mispantallas":
        content = <MisPantallas paneles={paneles} onBack={() => setView("inicio")} />;
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
    }
  }

  return (
    <div className="app-shell">
      <OfflineBanner online={online} />
      <div className="screens">
        <div className="screen active">
          <Suspense
            fallback={
              <div className="state-screen">
                <div className="state-title">Cargando…</div>
              </div>
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
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={(v) => setView(v)}
        onLogout={() => logout()}
        isAdmin={isAdmin}
      />
    </div>
  );
}
