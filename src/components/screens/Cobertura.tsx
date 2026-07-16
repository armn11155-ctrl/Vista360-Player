import { useEffect, useMemo, useRef, useState } from "react";
import BackChevron from "../BackChevron";
import type { Contrato, Panel } from "../../types";

declare global {
  interface Window {
    L?: any;
  }
}

interface Props {
  paneles: Record<string, Panel>;
  contratos: Contrato[];
  onBack?: () => void;
}

type PanelConUso = Panel & {
  contrato?: Contrato;
};

type PanelConCoordenadas = PanelConUso & {
  lat: number;
  lng: number;
};

function numeroCoordenada(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function tieneCoordenadas(panel: PanelConUso): panel is PanelConCoordenadas {
  return typeof panel.lat === "number" && typeof panel.lng === "number";
}

function estadoTexto(contrato?: Contrato) {
  if (!contrato) return "Panel asignado";
  const hoy = new Date();
  const inicio = new Date(contrato.inicio);
  const fin = new Date(contrato.fin);
  if (hoy < inicio) return "Programado";
  if (hoy > fin) return "Finalizado";
  return "Activo";
}

function estadoColor(label: string) {
  if (label === "Activo") return "#22C55E";
  if (label === "Programado") return "#F59E0B";
  if (label === "Finalizado") return "#94A3B8";
  return "#60A5FA";
}

function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);

  const cssId = "leaflet-css";
  if (!document.getElementById(cssId)) {
    const link = document.createElement("link");
    link.id = cssId;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  const scriptId = "leaflet-js";
  const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (existing) {
    return new Promise<any>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.L));
      existing.addEventListener("error", reject);
    });
  }

  return new Promise<any>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export default function Cobertura({ paneles, contratos, onBack }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const lista = useMemo<PanelConUso[]>(() => {
    const usados = new Map(contratos.map((contrato) => [contrato.panel_id, contrato]));
    return Object.values(paneles)
      .map((panel) => ({
        ...panel,
        lat: numeroCoordenada((panel as unknown as Record<string, unknown>).lat),
        lng: numeroCoordenada((panel as unknown as Record<string, unknown>).lng),
        contrato: usados.get(panel.id),
      }))
      .sort((a, b) => (a.ciudad || "").localeCompare(b.ciudad || "") || a.nombre.localeCompare(b.nombre));
  }, [contratos, paneles]);

  const conCoordenadas = useMemo(() => lista.filter(tieneCoordenadas), [lista]);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = lista.find((panel) => panel.id === seleccionadoId) ?? conCoordenadas[0] ?? lista[0];

  useEffect(() => {
    let cancelado = false;
    if (!mapEl.current || conCoordenadas.length === 0) return;

    cargarLeaflet()
      .then((L) => {
        if (cancelado || !mapEl.current) return;
        setMapReady(true);
        setMapError(false);

        if (!mapRef.current) {
          mapRef.current = L.map(mapEl.current, {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: false,
          });
          L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
          L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapRef.current);
          L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap &copy; CARTO",
          }).addTo(mapRef.current);
        }

        if (markersRef.current) {
          markersRef.current.remove();
        }
        markersRef.current = L.layerGroup().addTo(mapRef.current);

        conCoordenadas.forEach((panel) => {
          const active = panel.id === seleccionado?.id;
          const marker = L.marker([panel.lat, panel.lng], {
            icon: L.divIcon({
              className: `coverage-leaflet-marker ${active ? "active" : ""}`,
              html: `<span><img src="/vista360-map-marker.png" alt="" /></span>`,
              iconSize: active ? [48, 74] : [38, 58],
              iconAnchor: active ? [24, 72] : [19, 56],
            }),
          })
            .addTo(markersRef.current)
            .on("click", () => setSeleccionadoId(panel.id));
          marker.bindPopup(`<strong>${panel.nombre}</strong><br>${panel.direccion || panel.ciudad || ""}`);
        });

        const seleccionadoConCoords = seleccionado && tieneCoordenadas(seleccionado) ? seleccionado : conCoordenadas[0];
        if (seleccionadoId && seleccionadoConCoords) {
          mapRef.current.setView([seleccionadoConCoords.lat, seleccionadoConCoords.lng], 15, { animate: true });
        } else if (conCoordenadas.length === 1) {
          mapRef.current.setView([conCoordenadas[0].lat, conCoordenadas[0].lng], 15);
        } else {
          mapRef.current.fitBounds(
            L.latLngBounds(conCoordenadas.map((panel) => [panel.lat, panel.lng])),
            { padding: [28, 28] }
          );
        }

        window.setTimeout(() => mapRef.current?.invalidateSize(), 80);
      })
      .catch(() => {
        if (!cancelado) {
          setMapError(true);
          setMapReady(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [conCoordenadas, seleccionado, seleccionadoId]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  return (
    <div className="coverage-screen">
      <div className="detail-header coverage-header-compact">
        {onBack && (
          <div className="back-btn" onClick={onBack}>
            <BackChevron />
          </div>
        )}
        <div className="simple-title">Cobertura</div>
      </div>

      <div className="content-area coverage-premium-area">
        <div className="coverage-hero">
          <div>
            <div className="coverage-kicker">Mapa de campaña</div>
            <div className="coverage-title">Paneles del cliente</div>
            <div className="coverage-sub">
              Ubicación de las pantallas contratadas y estado de cada punto.
            </div>
          </div>
          <div className="coverage-count">
            <span>{lista.length}</span>
            <small>paneles</small>
          </div>
        </div>

        <div className="coverage-map-real coverage-map-osm">
          {conCoordenadas.length > 0 ? (
            <>
              <div ref={mapEl} className="coverage-leaflet-map" />
              {!mapReady && !mapError && (
                <div className="coverage-map-loading">Cargando mapa...</div>
              )}
              {mapError && (
                <div className="coverage-map-loading">No se pudo cargar el mapa. Revisa tu conexión.</div>
              )}
            </>
          ) : (
            <div className="coverage-no-coords">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="1.8">
                <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
                <path d="M9 3v15M15 6v15" />
              </svg>
              <div>Aún no hay coordenadas registradas para estos paneles.</div>
            </div>
          )}
        </div>

        {seleccionado && (
          <div className="coverage-selected-card">
            <div>
              <div className="coverage-selected-name">{seleccionado.nombre}</div>
              <div className="coverage-selected-address">
                {[seleccionado.direccion, seleccionado.ciudad].filter(Boolean).join(" · ") || "Sin dirección registrada"}
              </div>
            </div>
            <div className="coverage-selected-actions">
              <div className="coverage-selected-status" style={{ color: estadoColor(estadoTexto(seleccionado.contrato)) }}>
                <span style={{ background: estadoColor(estadoTexto(seleccionado.contrato)) }} />
                {estadoTexto(seleccionado.contrato)}
              </div>
              {tieneCoordenadas(seleccionado) && (
                <a
                  className="coverage-google-link"
                  href={`https://maps.google.com/?q=${seleccionado.lat},${seleccionado.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Maps
                </a>
              )}
            </div>
          </div>
        )}

        <div className="coverage-panel-card">
          <div className="section-title">Paneles ubicados</div>
          {lista.length === 0 ? (
            <div className="state-sub" style={{ maxWidth: "none" }}>
              Este cliente todavía no tiene paneles asignados.
            </div>
          ) : (
            lista.map((panel) => {
              const label = estadoTexto(panel.contrato);
              const color = estadoColor(label);
              return (
                <button
                  key={panel.id}
                  type="button"
                  className="coverage-panel-row"
                  onClick={() => setSeleccionadoId(panel.id)}
                >
                  <div className="coverage-panel-dot" style={{ background: color }} />
                  <div className="coverage-panel-info">
                    <div className="coverage-panel-name">{panel.nombre}</div>
                    <div className="coverage-panel-meta">
                      {panel.ciudad || "Sin ciudad"} · {tieneCoordenadas(panel) ? "Con coordenadas" : "Sin coordenadas"}
                    </div>
                  </div>
                  <div className="coverage-panel-state" style={{ color }}>
                    {label}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
