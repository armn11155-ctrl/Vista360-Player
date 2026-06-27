import { useState } from "react";
import { envMissing } from "./config/env";
import { usePortalAuth } from "./hooks/usePortalAuth";
import { useCliente } from "./hooks/useCliente";
import { useContratos } from "./hooks/useContratos";
import { usePaneles } from "./hooks/usePaneles";
import ConfigMissing from "./components/ConfigMissing";
import LoginScreen from "./components/LoginScreen";
import BottomNav, { type Tab } from "./components/BottomNav";
import Inicio from "./components/screens/Inicio";
import MisCampanas from "./components/screens/MisCampanas";
import DetalleCampana from "./components/screens/DetalleCampana";
import Evidencias from "./components/screens/Evidencias";
import Reportes from "./components/screens/Reportes";
import Perfil from "./components/screens/Perfil";
import NuevaCampana from "./components/screens/NuevaCampana";
import type { Contrato } from "./types";

type View = Tab | "detalle" | "nueva";

export default function App() {
  const auth = usePortalAuth();
  const [view, setView] = useState<View>("inicio");
  const [contratoAbierto, setContratoAbierto] = useState<Contrato | null>(null);

  if (envMissing.length > 0) {
    return <ConfigMissing missing={envMissing} />;
  }

  if (auth.status === "loading") {
    return (
      <div className="app-shell">
        <div className="state-screen">
          <div className="state-title">Cargando…</div>
        </div>
      </div>
    );
  }

  if (auth.status === "out") {
    return (
      <div className="app-shell">
        <LoginScreen onLoggedIn={() => setView("inicio")} />
      </div>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="app-shell">
        <div className="state-screen">
          <div className="state-title">No se pudo cargar tu cuenta</div>
          <div className="state-sub">{auth.message}</div>
        </div>
      </div>
    );
  }

  // auth.status === "in"
  return (
    <AuthenticatedApp
      clienteId={auth.clienteId}
      email={auth.user.email ?? ""}
      view={view}
      setView={setView}
      contratoAbierto={contratoAbierto}
      setContratoAbierto={setContratoAbierto}
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
}

function AuthenticatedApp({
  clienteId,
  email,
  view,
  setView,
  contratoAbierto,
  setContratoAbierto,
}: AuthenticatedProps) {
  const cliente = useCliente(clienteId);
  const contratosState = useContratos(clienteId);
  const contratos = contratosState.status === "ready" ? contratosState.contratos : [];
  const paneles = usePaneles(contratos.map((c) => c.panel_id));

  const showBottomNav = view !== "detalle" && view !== "nueva";
  const activeTab: Tab = view === "detalle" || view === "nueva" ? "campanas" : view;

  function abrirContrato(c: Contrato) {
    setContratoAbierto(c);
    setView("detalle");
  }

  let content: React.ReactNode = null;

  if (contratosState.status === "loading") {
    content = (
      <div className="state-screen">
        <div className="state-title">Cargando tus campañas…</div>
      </div>
    );
  } else if (contratosState.status === "error") {
    content = (
      <div className="state-screen">
        <div className="state-title">No se pudieron cargar tus campañas</div>
        <div className="state-sub">{contratosState.message}</div>
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
          />
        );
        break;
      case "campanas":
        content = (
          <MisCampanas
            contratos={contratos}
            paneles={paneles}
            onAbrir={abrirContrato}
            onNueva={() => setView("nueva")}
          />
        );
        break;
      case "detalle":
        content = contratoAbierto ? (
          <DetalleCampana
            contrato={contratoAbierto}
            panel={paneles[contratoAbierto.panel_id]}
            onBack={() => setView("campanas")}
          />
        ) : null;
        break;
      case "evidencias":
        content = <Evidencias contratos={contratos} paneles={paneles} />;
        break;
      case "reportes":
        content = <Reportes hayContratos={contratos.length > 0} />;
        break;
      case "perfil":
        content = <Perfil cliente={cliente} email={email} />;
        break;
      case "nueva":
        content = (
          <NuevaCampana
            clienteId={clienteId}
            onBack={() => setView("campanas")}
            onEnviada={() => setView("campanas")}
          />
        );
        break;
    }
  }

  return (
    <div className="app-shell">
      <div className="screens">
        <div className="screen active">{content}</div>
      </div>
      {showBottomNav && (
        <BottomNav
          active={activeTab}
          onChange={(tab) => setView(tab)}
        />
      )}
    </div>
  );
}
