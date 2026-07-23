import { useEffect, useMemo, useRef, useState } from "react";
import BackChevron from "../BackChevron";
import MobileSidebarButton from "../MobileSidebarButton";
import type { Contrato, Panel } from "../../types";
import { panelesDeContrato } from "../../types";
import { cargarLeaflet } from "../../utils/leaflet";

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

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "15 de agosto de 2026" -- para la fecha de vigencia del popup del
 *  pin. Distinto al formato corto que usa Mis Campañas porque acá hay
 *  espacio de sobra (la tarjeta es mas chica) y se pidió que se vea
 *  elegante, no apretado. */
function fechaLarga(fecha: string) {
  if (!fecha) return "";
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} de ${MESES_LARGOS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** El popup del pin se arma como HTML plano (Leaflet no acepta JSX) --
 *  escapamos nombre/direccion/ciudad porque vienen de datos cargados
 *  por el admin, no queremos que un "<" o "&" suelto rompa el markup. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Mini tarjeta premium que se abre al hacer click en un pin del mapa
 *  -- antes era el popup por defecto de Leaflet (solo nombre y
 *  direccion en texto plano, sin nada de diseño). No hay fotos reales
 *  de los paneles en el modelo de datos todavia, asi que la "imagen"
 *  de la tarjeta es un icono de valla ilustrado sobre un degradado de
 *  marca en vez de una foto -- el mismo lenguaje visual (degradado
 *  azul oscuro-claro) que ya se uso en el pie del PDF y en las lineas
 *  de los headers. */
function popupHtml(panel: PanelConUso) {
  const nombre = escapeHtml(panel.nombre);
  const direccion = escapeHtml(panel.direccion || panel.ciudad || "Sin dirección registrada");
  const label = estadoTexto(panel.contrato);
  const color = estadoColor(label);
  const contrato = panel.contrato;
  // Fila de vigencia (fecha "hasta cuando") -- solo si el panel tiene
  // una campaña/contrato asignado; si no, no hay fecha que mostrar.
  const vigenciaHtml = contrato
    ? `
        <div class="coverage-popup-divider"></div>
        <div class="coverage-popup-until">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" stroke-width="1.6"/><path d="M3 9h18M8 2v4M16 2v4" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round"/></svg>
          <div class="coverage-popup-until-body">
            <span class="coverage-popup-until-label">${label === "Finalizado" ? "Finalizó" : "Vigente hasta"}</span>
            <span class="coverage-popup-until-value">${escapeHtml(fechaLarga(contrato.fin))}</span>
          </div>
        </div>
      `
    : "";
  return `
    <div class="coverage-popup-card">
      <div class="coverage-popup-media">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2.5" y="4.5" width="19" height="12.5" rx="1.6" stroke="#FFFFFF" stroke-width="1.5"/>
          <circle cx="7.6" cy="9.2" r="1.35" stroke="#FFFFFF" stroke-width="1.2"/>
          <path d="M4 14.3l3.6-3.7 2.6 2.4 3.4-4 4.9 5.3" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8.3 21l1-4.2M15.7 21l-1-4.2" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M18.4 3c1.15.5 1.95 1.45 2.2 2.7M16.9 4.05c.75.35 1.25.95 1.4 1.75" stroke="rgba(255,255,255,.8)" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="coverage-popup-badge" style="color:${color}"><i style="background:${color}"></i>${escapeHtml(label)}</span>
      </div>
      <div class="coverage-popup-body">
        <div class="coverage-popup-name">${nombre}</div>
        <div class="coverage-popup-address">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z" stroke="#94A3B8" stroke-width="1.6"/><circle cx="12" cy="10" r="1.8" stroke="#94A3B8" stroke-width="1.6"/></svg>
          <span>${direccion}</span>
        </div>
        ${vigenciaHtml}
      </div>
    </div>
  `;
}

export default function Cobertura({ paneles, contratos, onBack, onMenuClick }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const lista = useMemo<PanelConUso[]>(() => {
    // Un contrato multi-panel ocupa TODOS sus paneles en el mapa, no
    // solo el primero.
    const usados = new Map<string, Contrato>();
    contratos.forEach((contrato) => {
      panelesDeContrato(contrato).forEach((panelId) => usados.set(panelId, contrato));
    });
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
    if (!mapEl.current) return;

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
            // Sin esto, al alejar el zoom se veia gris arriba/abajo (zonas
            // sin tiles cerca de los polos) y arrastrando el mapa a los
            // lados se podia seguir de largo viendo el mismo mapa repetido
            // sin fin. maxBounds + viscosity "frena" el arrastre justo en
            // el borde del mundo, minZoom no deja alejarse tanto como para
            // que aparezca esa zona gris, y worldCopyJump:false evita que
            // Leaflet dibuje copias repetidas del mapa al cruzar los 180°.
            minZoom: 3,
            maxBounds: [[-85, -180], [85, 180]],
            maxBoundsViscosity: 1.0,
            worldCopyJump: false,
          });
          L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
          L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapRef.current);
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          }).addTo(mapRef.current);
        }

        markersRef.current?.remove();
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
          marker.bindPopup(popupHtml(panel), { className: "coverage-popup", maxWidth: 288, minWidth: 258, offset: [0, -6] });
        });

        const seleccionadoConCoords = seleccionado && tieneCoordenadas(seleccionado) ? seleccionado : conCoordenadas[0];
        if (conCoordenadas.length === 0) {
          mapRef.current.setView(CENTRO_MAPA_INICIAL, 11);
        } else if (seleccionadoId && seleccionadoConCoords) {
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
    markersRef.current?.remove();
    markersRef.current = null;
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
          <div ref={mapEl} className="coverage-leaflet-map" />
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
