import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import BackChevron from "../BackChevron";
import MobileSidebarButton from "../MobileSidebarButton";
import type { Contrato, Panel } from "../../types";

interface Props {
  paneles: Record<string, Panel>;
  contratos: Contrato[];
  onBack?: () => void;
  onMenuClick?: () => void;
}

type PanelConUso = Panel & {
  contrato?: Contrato;
};

type PanelConCoordenadas = PanelConUso & {
  lat: number;
  lng: number;
};

const CENTRO_MAPA_INICIAL: [number, number] = [-12.0464, -77.0428];
const ESTILO_MAPA_RESPALDO: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
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
  if (label === "Programado") return "#0877FF"; // antes naranja -- se pidió que no haya naranjas, todo en la paleta azul de la marca
  if (label === "Finalizado") return "#94A3B8";
  return "#60A5FA";
}

export default function Cobertura({ paneles, contratos, onBack, onMenuClick }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
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
    if (!mapEl.current) return;

    if (!mapRef.current) {
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [CENTRO_MAPA_INICIAL[1], CENTRO_MAPA_INICIAL[0]],
        zoom: 11,
        attributionControl: false,
      });
      map.scrollZoom.disable();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      let estiloListo = false;
      const mostrarMapa = () => {
        estiloListo = true;
        setMapReady(true);
        setMapError(false);
      };
      map.once("style.load", mostrarMapa);

      // La instancia pública de Liberty puede tardar según la red. Si el
      // estilo vectorial no responde pronto, mantenemos el mapa operativo
      // con teselas OSM y evitamos dejar al cliente frente a un fondo vacío.
      window.setTimeout(() => {
        if (!estiloListo && mapRef.current === map) {
          map.setStyle(ESTILO_MAPA_RESPALDO);
          mostrarMapa();
        }
      }, 3500);
      mapRef.current = map;
    }

    const map = mapRef.current;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = conCoordenadas.map((panel) => {
      const active = panel.id === seleccionado?.id;
      const element = document.createElement("button");
      element.type = "button";
      element.className = `coverage-maplibre-marker${active ? " active" : ""}`;
      element.setAttribute("aria-label", `Ver ${panel.nombre}`);

      const image = document.createElement("img");
      image.src = "/vista360-map-marker.png";
      image.alt = "";
      element.appendChild(image);
      element.addEventListener("click", () => setSeleccionadoId(panel.id));

      const popupContent = document.createElement("div");
      const popupTitle = document.createElement("strong");
      popupTitle.textContent = panel.nombre;
      const popupAddress = document.createElement("span");
      popupAddress.textContent = panel.direccion || panel.ciudad || "";
      popupContent.append(popupTitle, popupAddress);

      return new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat([panel.lng, panel.lat])
        .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setDOMContent(popupContent))
        .addTo(map);
    });

    const seleccionadoConCoords = seleccionado && tieneCoordenadas(seleccionado) ? seleccionado : conCoordenadas[0];
    if (conCoordenadas.length === 0) {
      map.jumpTo({ center: [CENTRO_MAPA_INICIAL[1], CENTRO_MAPA_INICIAL[0]], zoom: 11 });
    } else if (seleccionadoId && seleccionadoConCoords) {
      map.flyTo({ center: [seleccionadoConCoords.lng, seleccionadoConCoords.lat], zoom: 15, essential: true });
    } else if (conCoordenadas.length === 1) {
      map.jumpTo({ center: [conCoordenadas[0].lng, conCoordenadas[0].lat], zoom: 15 });
    } else {
      const bounds = new maplibregl.LngLatBounds();
      conCoordenadas.forEach((panel) => bounds.extend([panel.lng, panel.lat]));
      map.fitBounds(bounds, { padding: 36, maxZoom: 15 });
    }

    window.setTimeout(() => map.resize(), 80);
  }, [conCoordenadas, seleccionado, seleccionadoId]);

  useEffect(() => () => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  return (
    <div className="coverage-screen">
      <div className="detail-header coverage-header-compact">
        <MobileSidebarButton onClick={onMenuClick} />
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
          <div ref={mapEl} className="coverage-maplibre-map" />
          {!mapReady && !mapError && (
            <div className="coverage-map-loading">
              <span aria-hidden="true" />
              Preparando mapa
            </div>
          )}
          {mapError && (
            <div className="coverage-map-loading is-error">No se pudo cargar el mapa. Revisa tu conexión.</div>
          )}
          {mapReady && conCoordenadas.length === 0 && (
            <div className="coverage-no-coords">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z" />
                <circle cx="12" cy="10" r="2.2" />
              </svg>
              <div>
                <strong>{lista.length === 0 ? "Tu mapa está listo" : "Ubicaciones por registrar"}</strong>
                <span>
                  {lista.length === 0
                    ? "Cuando tengas un panel, su ubicación aparecerá aquí."
                    : "Tus paneles aparecerán aquí cuando tengan una ubicación registrada."}
                </span>
              </div>
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
