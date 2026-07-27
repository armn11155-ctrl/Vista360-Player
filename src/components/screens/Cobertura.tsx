import { useEffect, useMemo, useRef, useState } from "react";
import BackChevron from "../BackChevron";
import MobileSidebarButton from "../MobileSidebarButton";
import type { Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { diasHasta } from "../../utils/fechas";
import { cargarLeaflet } from "../../utils/leaflet";
import { campaignCityImage } from "../../utils/campaignCity";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";

interface Props {
  contratos: Contrato[];
  onBack?: () => void;
  onMenuClick?: () => void;
  /** Se dispara cuando la persona toca "Solicitar disponibilidad" o
   *  "Solicitar renovación" en el popup de un pin -- App.tsx la usa
   *  para precargar y abrir el formulario de Nueva campaña con el
   *  panel ya mencionado, en vez de hacer que lo escriba de cero. */
  onSolicitarPanel?: (panel: PanelConUso, tipo: "disponibilidad" | "renovacion") => void;
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

/** Ahora Cobertura muestra TODO el inventario de paneles, no solo los
 *  que este cliente ya tiene contratados -- así que "contrato" puede
 *  no existir aunque el panel sí. Antes, sin contrato, se mostraba
 *  "Panel asignado" (tenía sentido cuando SOLO llegaban paneles ya
 *  asignados a este cliente); ahora sin contrato se muestra el estado
 *  propio del panel (Disponible/Ocupado/Mantenimiento, el mismo campo
 *  que administra el admin en Paneles), que sí describe la realidad. */
function estadoTexto(panel: PanelConUso) {
  const contrato = panel.contrato;
  if (contrato) {
    // Se delega en estadoCampana (types/index.ts) para no tener una
    // cuarta copia de esta regla -- antes acá se comparaban objetos
    // Date construidos desde "YYYY-MM-DD", que en Perú adelantaban el
    // cambio de estado casi un día (ver utils/fechas.ts).
    const estado = estadoCampana(contrato);
    if (estado === "Programada") return "Programado";
    if (estado === "Finalizada") return "Finalizado";
    return "Activo";
  }
  return panel.estado === "Ocupado" ? "Ocupado" : panel.estado === "Mantenimiento" ? "Mantenimiento" : "Disponible";
}

function estadoColor(label: string) {
  if (label === "Activo") return "#22C55E";
  if (label === "Programado") return "#0877FF"; // antes naranja -- se pidió que no haya naranjas, todo en la paleta azul de la marca
  if (label === "Finalizado") return "#64748B";
  if (label === "Disponible") return "#16A34A";
  if (label === "Ocupado") return "#0877FF";
  if (label === "Mantenimiento") return "#7C3AED";
  return "#60A5FA";
}

/** Negro = contratado por este cliente y todavía vigente/programado.
 *  Blanco = disponible para contratar (incluye una campaña del cliente
 *  que ya finalizó y puede volver a contratarse). */
function esPanelActivoCliente(panel: PanelConUso) {
  return Boolean(panel.contrato && estadoCampana(panel.contrato) !== "Finalizada");
}

function esPanelContratable(panel: PanelConUso) {
  if (esPanelActivoCliente(panel)) return false;
  if (panel.contrato && estadoCampana(panel.contrato) === "Finalizada") return true;
  return panel.estado === "Disponible" || panel.estado === "Libre";
}

// Mismo umbral que usa recordatorioVencimientoCampanas (Cloud
// Function) para avisarle al cliente que su campaña vence pronto --
// acá se usa para mostrar el botón "Solicitar renovación" en el popup.
const DIAS_AVISO_RENOVACION = 10;



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
 *  direccion en texto plano, sin nada de diseño). Layout horizontal
 *  (imagen a la izquierda, texto a la derecha) a pedido -- antes era
 *  vertical (imagen arriba). La foto es la MISMA que usa la campaña
 *  que esta usando este panel (campaignCityImage keyed por el id del
 *  contrato, igual que en Mis Campañas) -- si el panel no tiene
 *  campaña asignada, se usa el id del panel como reemplazo, para que
 *  siempre se vea una foto en vez de un cuadro vacio. */
function popupHtml(panel: PanelConUso, permitirSolicitar: boolean) {
  const nombre = escapeHtml(panel.nombre);
  const direccion = escapeHtml(panel.direccion || panel.ciudad || "Sin dirección registrada");
  const label = estadoTexto(panel);
  const color = estadoColor(label);
  const contrato = panel.contrato;
  const fotoUrl = campaignCityImage(contrato?.id ?? panel.id);

  // Sin contrato de ESTE cliente en este panel -- se pidió que se
  // pueda "Solicitar disponibilidad" directo desde el pin, en vez de
  // solo mostrar el estado sin poder hacer nada.
  //
  // Con contrato Activo y cerca de vencer -- se pidió que también
  // aparezca "Solicitar renovación", además de la fecha de vigencia
  // (no en reemplazo).
  //
  // Y con contrato YA FINALIZADO también: antes ese caso se quedaba sin
  // ningún botón (no entraba en "sin contrato" porque el contrato existe,
  // ni en "por vencer" porque ya no estaba activo), así que un cliente
  // cuya campaña acababa de terminar no tenía forma de volver a
  // contratar desde el mapa -- justo cuando más sentido tiene ofrecérselo.
  const enRenovacion = Boolean(
    contrato &&
      (label === "Finalizado" ||
        (label === "Activo" && diasHasta(contrato.fin) <= DIAS_AVISO_RENOVACION))
  );

  const vigenciaHtml = contrato
    ? `
        <div class="coverage-popup-divider"></div>
        <div class="coverage-popup-until">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#64748B" stroke-width="1.6"/><path d="M3 9h18M8 2v4M16 2v4" stroke="#64748B" stroke-width="1.6" stroke-linecap="round"/></svg>
          <div class="coverage-popup-until-body">
            <span class="coverage-popup-until-label">${label === "Finalizado" ? "Finalizó" : "Vigente hasta"}</span>
            <span class="coverage-popup-until-value">${escapeHtml(fechaLarga(contrato.fin))}</span>
          </div>
        </div>
      `
    : "";

  const accionHtml = !permitirSolicitar
    ? ""
    : !contrato
    ? `
        <button type="button" class="coverage-popup-action" data-cobertura-accion="disponibilidad" data-panel-id="${panel.id}">
          Solicitar disponibilidad
        </button>
      `
    : enRenovacion
    ? `
        <button type="button" class="coverage-popup-action" data-cobertura-accion="renovacion" data-panel-id="${panel.id}">
          ${label === "Finalizado" ? "Volver a contratar" : "Solicitar renovación"}
        </button>
      `
    : "";

  return `
    <div class="coverage-popup-card">
      <div class="coverage-popup-media" style="background-image:url('${fotoUrl}')">
        <span class="coverage-popup-panel-icon" aria-hidden="true">
          <svg viewBox="0 0 512 512" fill="#FFFFFF" aria-hidden="true">
            <rect x="76.043" y="122.165" width="359.916" height="115.585"/>
            <path d="M451.795,46.121L425.953,0H372.42v30.417h35.71l8.799,15.703H95.071l8.799-15.703h35.71V0H86.046L60.205,46.121H0v277.812
              h512V46.121H451.795z M466.374,268.167H45.626V91.746h420.748V268.167z"/>
            <polygon points="299.715,481.583 299.715,354.352 212.284,354.352 212.284,481.583 103.914,481.583 103.914,512 212.284,512
              299.715,512 408.086,512 408.086,481.583"/>
          </svg>
        </span>
        <span class="coverage-popup-badge" style="color:${color}"><i style="background:${color}"></i>${escapeHtml(label)}</span>
      </div>
      <div class="coverage-popup-body">
        <div class="coverage-popup-name">${nombre}</div>
        <div class="coverage-popup-address">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z" stroke="#64748B" stroke-width="1.6"/><circle cx="12" cy="10" r="1.8" stroke="#64748B" stroke-width="1.6"/></svg>
          <span>${direccion}</span>
        </div>
        ${vigenciaHtml}
        ${accionHtml}
      </div>
    </div>
  `;
}

export default function Cobertura({ contratos, onBack, onMenuClick, onSolicitarPanel }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Se pidió que en Cobertura se vea TODO el inventario de paneles (no
  // solo los que este cliente ya tiene contratados), para que pueda
  // descubrir y pedir disponibilidad de otros puntos. Antes acá
  // llegaba un "paneles" ya filtrado por los contratos del cliente
  // (prop, ahora eliminada); ahora se trae la lista completa igual
  // que hace el admin en la pantalla Paneles.
  const panelesState = usePanelesDisponibles(true);
  const todosPaneles = panelesState.status === "ready" ? panelesState.paneles : [];

  const lista = useMemo<PanelConUso[]>(() => {
    // Un contrato multi-panel ocupa TODOS sus paneles en el mapa, no
    // solo el primero.
    const usados = new Map<string, Contrato>();
    contratos.forEach((contrato) => {
      panelesDeContrato(contrato).forEach((panelId) => usados.set(panelId, contrato));
    });
    return todosPaneles
      .map((panel) => ({
        ...panel,
        lat: numeroCoordenada((panel as unknown as Record<string, unknown>).lat),
        lng: numeroCoordenada((panel as unknown as Record<string, unknown>).lng),
        contrato: usados.get(panel.id),
      }))
      // El mapa comercial enseña los paneles del cliente y los que
      // realmente puede solicitar. Un panel ajeno ocupado o en
      // mantenimiento no debe aparecer como si estuviera disponible.
      .filter((panel) => Boolean(panel.contrato) || esPanelContratable(panel))
      .sort((a, b) => (a.ciudad || "").localeCompare(b.ciudad || "") || a.nombre.localeCompare(b.nombre));
  }, [contratos, todosPaneles]);

  const conCoordenadas = useMemo(() => lista.filter(tieneCoordenadas), [lista]);
  const panelesActivos = useMemo(() => conCoordenadas.filter(esPanelActivoCliente).length, [conCoordenadas]);
  const panelesContratables = useMemo(() => conCoordenadas.filter(esPanelContratable).length, [conCoordenadas]);
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
          const selected = panel.id === seleccionado?.id;
          const contratado = esPanelActivoCliente(panel);
          const pinUrl = contratado ? "/vista360-map-marker-v4.png" : "/vista360-map-marker-available.png";
          const marker = L.marker([panel.lat, panel.lng], {
            icon: L.divIcon({
              className: `coverage-leaflet-marker ${selected ? "active" : ""} ${contratado ? "is-contracted" : "is-available"}`,
              html: `<span><img src="${pinUrl}" alt="" /></span>`,
              iconSize: selected ? [48, 74] : [38, 58],
              iconAnchor: selected ? [24, 72] : [19, 56],
            }),
          })
            .addTo(markersRef.current)
            .on("click", () => setSeleccionadoId(panel.id));
          marker.bindPopup(popupHtml(panel, Boolean(onSolicitarPanel)), {
            className: "coverage-popup",
            maxWidth: 320,
            minWidth: 296,
            offset: [0, -6],
          });
          // El popup es HTML plano (Leaflet no acepta JSX), así que el
          // botón "Solicitar disponibilidad/renovación" de adentro no
          // tiene forma de disparar React directo -- se engancha a
          // mano apenas Leaflet abre el popup y mete su contenido en
          // el DOM real.
          if (onSolicitarPanel) {
            marker.on("popupopen", (evento: any) => {
              const el: HTMLElement | undefined = evento?.popup?.getElement?.();
              const boton = el?.querySelector<HTMLButtonElement>("[data-cobertura-accion]");
              if (!boton) return;
              // En móvil el "click" sintético adentro de un popup de Leaflet
              // a veces no llega a disparar (el mapa se queda con el toque
              // por el gesto táctil, o el popup se cierra solo antes de que
              // el evento se propague) -- se pidió que el botón funcione
              // igual en el celular, así que se engancha también a
              // touchend/pointerup como respaldo, con una bandera para no
              // disparar la acción dos veces si ambos sí llegan a sonar.
              let disparado = false;
              const disparar = (ev: Event) => {
                if (disparado) return;
                disparado = true;
                ev.preventDefault();
                const tipo = boton.dataset.coberturaAccion === "renovacion" ? "renovacion" : "disponibilidad";
                onSolicitarPanel(panel, tipo);
              };
              boton.addEventListener("click", disparar);
              boton.addEventListener("touchend", disparar, { passive: false });
            });
          }
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
            <div className="coverage-title">Cobertura de paneles</div>
            <div className="coverage-sub">
              Ubicación de todos los paneles disponibles y el estado de los tuyos.
            </div>
          </div>
          <div className="coverage-count">
            <span>{panelesState.status === "loading" ? "…" : lista.length}</span>
            <small>paneles</small>
          </div>
        </div>

        <div className="coverage-map-real coverage-map-osm">
          <div ref={mapEl} className="coverage-leaflet-map" />
          {mapReady && !mapError && panelesState.status === "ready" && (
            <div className="coverage-map-legend coverage-map-legend-desktop" aria-label="Leyenda del mapa">
              <div>
                <img src="/vista360-map-marker-available.png" alt="" aria-hidden="true" />
                <span>Pantallas que podrías contratar</span>
                <strong>{panelesContratables}</strong>
              </div>
              <div>
                <img src="/vista360-map-marker-v4.png" alt="" aria-hidden="true" />
                <span>Pantallas contratadas</span>
                <strong>{panelesActivos}</strong>
              </div>
            </div>
          )}
          {!mapReady && !mapError && (
            <div className="coverage-map-loading">
              <span aria-hidden="true" />
              Preparando mapa
            </div>
          )}
          {mapError && (
            <div className="coverage-map-loading is-error">No se pudo cargar el mapa. Revisa tu conexión.</div>
          )}
          {/* Antes, mientras los paneles todavía estaban cargando desde
             Firestore (onSnapshot tarda un instante en la primera
             respuesta), conCoordenadas.length === 0 era indistinguible
             de "de verdad no hay paneles" -- por eso se veía, por un
             segundo, "Sin paneles registrados" antes de que aparecieran
             los pines de golpe. Se ve poco elegante/poco pulido. Ahora
             se distingue el estado "cargando" del estado "ready pero
             vacío" para no mostrar ese mensaje hasta estar seguros. */}
          {mapReady && !mapError && panelesState.status === "loading" && (
            <div className="coverage-map-loading">
              <span aria-hidden="true" />
              Cargando paneles
            </div>
          )}
          {mapReady && !mapError && panelesState.status === "error" && (
            <div className="coverage-map-loading is-error">No se pudieron cargar los paneles. Revisa tu conexión.</div>
          )}
          {mapReady && !mapError && panelesState.status === "ready" && conCoordenadas.length === 0 && (
            <div className="coverage-no-coords">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z" />
                <circle cx="12" cy="10" r="2.2" />
              </svg>
              <div>
                <strong>{lista.length === 0 ? "Sin paneles registrados" : "Ubicaciones por registrar"}</strong>
                <span>
                  {lista.length === 0
                    ? "Cuando se registre un panel, su ubicación aparecerá aquí."
                    : "Los paneles aparecerán aquí cuando tengan una ubicación registrada."}
                </span>
              </div>
            </div>
          )}
        </div>

        {mapReady && !mapError && panelesState.status === "ready" && (
          <div className="coverage-map-legend coverage-map-legend-mobile" aria-label="Leyenda del mapa">
            <div>
              <img src="/vista360-map-marker-available.png" alt="" aria-hidden="true" />
              <span>Pantallas que podrías contratar</span>
              <strong>{panelesContratables}</strong>
            </div>
            <div>
              <img src="/vista360-map-marker-v4.png" alt="" aria-hidden="true" />
              <span>Pantallas contratadas</span>
              <strong>{panelesActivos}</strong>
            </div>
          </div>
        )}

        {seleccionado && (
          <div className="coverage-selected-card">
            <div>
              <div className="coverage-selected-name">{seleccionado.nombre}</div>
              <div className="coverage-selected-address">
                {[seleccionado.direccion, seleccionado.ciudad].filter(Boolean).join(" · ") || "Sin dirección registrada"}
              </div>
            </div>
            <div className="coverage-selected-actions">
              <div className="coverage-selected-status" style={{ color: estadoColor(estadoTexto(seleccionado)) }}>
                <span style={{ background: estadoColor(estadoTexto(seleccionado)) }} />
                {estadoTexto(seleccionado)}
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
          {panelesState.status === "loading" ? (
            <div className="state-sub" style={{ maxWidth: "none" }}>
              Cargando paneles…
            </div>
          ) : lista.length === 0 ? (
            <div className="state-sub" style={{ maxWidth: "none" }}>
              Todavía no hay paneles registrados.
            </div>
          ) : (
            lista.map((panel) => {
              const label = estadoTexto(panel);
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
