import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import MobileSidebarButton from "../MobileSidebarButton";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";
import { cloudFunctions } from "../../config/firebase";
import { cargarLeaflet } from "../../utils/leaflet";
import type { Panel, PanelEstado } from "../../types";

interface Props {
  onBack: () => void;
  onMenuClick?: () => void;
}

const ESTADOS: PanelEstado[] = ["Disponible", "Ocupado", "Mantenimiento", "Libre"];

const ESTADO_BADGE: Record<PanelEstado, { bg: string; color: string }> = {
  Disponible: { bg: "rgba(34,197,94,0.12)", color: "#16A34A" },
  Libre: { bg: "rgba(34,197,94,0.12)", color: "#16A34A" },
  Ocupado: { bg: "rgba(8,119,255,0.12)", color: "#0877FF" },
  Mantenimiento: { bg: "rgba(245,158,11,0.12)", color: "#D97706" },
};

// Centro por defecto del mapa: Lima, Peru (donde opera el negocio).
const CENTRO_DEFECTO: [number, number] = [-12.0464, -77.0428];

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "11px",
  boxSizing: "border-box",
  fontSize: 13.5,
};

/** Convierte lo que haya escrito el admin en un numero valido o
 *  undefined -- nunca NaN. Acepta coma decimal (12,345) ademas de
 *  punto, porque es como muchos escriben coordenadas en español. Antes
 *  esto mandaba NaN directo al cloud function si el texto no era un
 *  numero valido, y la app fallaba con "Data cannot be encoded in
 *  JSON: NaN" (JSON no soporta NaN). */
function numeroCoordenada(value: string): number | undefined {
  const limpio = value.trim().replace(",", ".");
  if (!limpio) return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
}

export default function Paneles({ onBack, onMenuClick }: Props) {
  const state = usePanelesDisponibles(true);
  const paneles = state.status === "ready" ? state.paneles : [];

  const [mostrarForm, setMostrarForm] = useState(false);
  const [panelEditando, setPanelEditando] = useState<Panel | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [estado, setEstado] = useState<PanelEstado>("Disponible");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [mensajeOk, setMensajeOk] = useState("");
  const [mapError, setMapError] = useState(false);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  latRef.current = lat;
  lngRef.current = lng;

  // ── Mapa: click o arrastre del marcador fija lat/lng -- ya no hace
  // falta escribir coordenadas a mano (esa era la otra parte del
  // pedido: "quiero un mapa para seleccionar exactamente la ubicación,
  // como en Vista360"). ──
  useEffect(() => {
    if (!mostrarForm || !mapEl.current) return;
    let cancelado = false;

    function colocarMarcador(L: any, latLng: { lat: number; lng: number }) {
      if (!mapRef.current) return;
      if (markerRef.current) {
        markerRef.current.setLatLng(latLng);
      } else {
        markerRef.current = L.marker(latLng, { draggable: true }).addTo(mapRef.current);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current.getLatLng();
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
        });
      }
      setLat(latLng.lat.toFixed(6));
      setLng(latLng.lng.toFixed(6));
    }

    cargarLeaflet()
      .then((L) => {
        if (cancelado || !mapEl.current) return;
        setMapError(false);

        if (!mapRef.current) {
          const inicial = numeroCoordenada(latRef.current) !== undefined && numeroCoordenada(lngRef.current) !== undefined
            ? ([numeroCoordenada(latRef.current)!, numeroCoordenada(lngRef.current)!] as [number, number])
            : CENTRO_DEFECTO;
          mapRef.current = L.map(mapEl.current, { zoomControl: false, attributionControl: false }).setView(inicial, 13);
          L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
          L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapRef.current);
          L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap &copy; CARTO",
          }).addTo(mapRef.current);
          mapRef.current.on("click", (ev: any) => colocarMarcador(L, ev.latlng));

          if (numeroCoordenada(latRef.current) !== undefined && numeroCoordenada(lngRef.current) !== undefined) {
            colocarMarcador(L, { lat: numeroCoordenada(latRef.current)!, lng: numeroCoordenada(lngRef.current)! });
          }
        }

        window.setTimeout(() => mapRef.current?.invalidateSize(), 80);
      })
      .catch(() => {
        if (!cancelado) setMapError(true);
      });

    return () => {
      cancelado = true;
    };
  }, [mostrarForm]);

  useEffect(() => {
    if (!mostrarForm && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }
  }, [mostrarForm]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  function limpiarForm() {
    setPanelEditando(null);
    setNombre("");
    setTipo("");
    setCiudad("");
    setDireccion("");
    setLat("");
    setLng("");
    setEstado("Disponible");
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }

  function abrirEdicion(p: Panel) {
    setError("");
    setMensajeOk("");
    setPanelEditando(p);
    setNombre(p.nombre ?? "");
    setTipo(p.tipo ?? "");
    setCiudad(p.ciudad ?? "");
    setDireccion(p.direccion ?? "");
    setLat(p.lat !== undefined ? String(p.lat) : "");
    setLng(p.lng !== undefined ? String(p.lng) : "");
    setEstado(p.estado ?? "Disponible");
    setMostrarForm(true);

    // Si el mapa ya estaba abierto (se toco otro panel sin cerrar el
    // formulario), el efecto que lo crea no se vuelve a disparar --
    // hay que mover el pin a mano para que no se quede con la
    // ubicacion del panel anterior.
    if (mapRef.current) {
      if (p.lat !== undefined && p.lng !== undefined) {
        mapRef.current.setView([p.lat, p.lng], 13);
        if (markerRef.current) {
          markerRef.current.setLatLng([p.lat, p.lng]);
        }
      } else if (markerRef.current) {
        mapRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    }
  }

  async function guardarPanel() {
    if (!cloudFunctions) {
      setError("Firebase Functions no está configurado.");
      return;
    }
    if (!nombre.trim() || !ciudad.trim()) {
      setError("Escribe al menos el nombre y la ciudad del panel.");
      return;
    }
    setError("");
    setMensajeOk("");
    setCreando(true);
    try {
      if (panelEditando) {
        const fn = httpsCallable<
          { panelId: string; nombre: string; tipo: string; ciudad: string; direccion: string; lat?: number; lng?: number; estado: string },
          { ok: boolean }
        >(cloudFunctions, "actualizarPanel");
        await fn({
          panelId: panelEditando.id,
          nombre: nombre.trim(),
          tipo: tipo.trim(),
          ciudad: ciudad.trim(),
          direccion: direccion.trim(),
          lat: numeroCoordenada(lat),
          lng: numeroCoordenada(lng),
          estado,
        });
        setMensajeOk("Panel actualizado.");
      } else {
        const fn = httpsCallable<
          { nombre: string; tipo: string; ciudad: string; direccion: string; lat?: number; lng?: number; estado: string },
          { id: string }
        >(cloudFunctions, "crearPanel");
        await fn({
          nombre: nombre.trim(),
          tipo: tipo.trim(),
          ciudad: ciudad.trim(),
          direccion: direccion.trim(),
          lat: numeroCoordenada(lat),
          lng: numeroCoordenada(lng),
          estado,
        });
        setMensajeOk("Panel creado.");
      }
      limpiarForm();
      setMostrarForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el panel.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="admin-tool-screen paneles-screen">
      <div className="detail-header">
        <MobileSidebarButton onClick={onMenuClick} />
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Paneles</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <button
          onClick={() => {
            if (mostrarForm) {
              limpiarForm();
              setMostrarForm(false);
            } else {
              limpiarForm();
              setMostrarForm(true);
            }
            setMensajeOk("");
          }}
          style={{
            width: "100%", margin: "4px 0 12px", background: "#0877FF", color: "#fff",
            border: "none", borderRadius: 12, padding: "13px", fontSize: 13,
            fontWeight: 800, cursor: "pointer",
          }}
        >
          {mostrarForm ? "Cerrar formulario" : "+ Crear panel"}
        </button>

        {mostrarForm && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>
              {panelEditando ? `Editar panel — ${panelEditando.nombre}` : "Panel nuevo"}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del panel" style={inputStyle} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Tipo (ej. Valla, LED)" style={inputStyle} />
                <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ciudad" style={inputStyle} />
              </div>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección (opcional)" style={inputStyle} />

              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800, marginBottom: 8 }}>
                  Ubicación — toca el mapa o arrastra el pin para marcarla
                </div>
                {mapError ? (
                  <div style={{ fontSize: 12, color: "var(--red)" }}>No se pudo cargar el mapa. Escribe la latitud/longitud manualmente abajo.</div>
                ) : (
                  <div ref={mapEl} style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }} />
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitud" inputMode="decimal" style={inputStyle} />
                <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitud" inputMode="decimal" style={inputStyle} />
              </div>
              <select value={estado} onChange={(e) => setEstado(e.target.value as PanelEstado)} style={{ ...inputStyle, background: "#fff", color: "var(--text)" }}>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            {error && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 10 }}>{error}</div>}
            <button
              onClick={guardarPanel}
              disabled={creando}
              style={{ width: "100%", marginTop: 12, background: creando ? "#93C5FD" : "#0B1220", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, cursor: creando ? "not-allowed" : "pointer" }}
            >
              {creando
                ? (panelEditando ? "Guardando..." : "Creando...")
                : (panelEditando ? "Guardar cambios" : "Crear panel")}
            </button>
          </div>
        )}

        {mensajeOk && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", color: "#16A34A", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
            {mensajeOk}
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
        {state.status === "ready" && paneles.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Aún no hay paneles registrados.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {paneles.map((p) => {
            const badge = ESTADO_BADGE[p.estado] ?? ESTADO_BADGE.Disponible;
            return (
              <div
                className="card"
                key={p.id}
                onClick={() => abrirEdicion(p)}
                style={{ padding: 14, cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{p.tipo} · {p.ciudad}</div>
                    {p.direccion && (
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{p.direccion}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      padding: "3px 9px", borderRadius: 20, background: badge.bg, color: badge.color,
                    }}>
                      {p.estado}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
