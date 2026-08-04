import { useEffect, useRef, useState, useMemo } from "react";
import { campoBase } from "../../styles/campos";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import CampoBusqueda from "../CampoBusqueda";
import MobileSidebarButton from "../MobileSidebarButton";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";
import { modalidadDePanel } from "../../types";
import { cloudFunctions } from "../../config/firebase";
import { mensajeDeError } from "../../utils/errores";
import { cargarLeaflet, zoomMinimoSinGris } from "../../utils/leaflet";
import type { Panel, PanelEstado, PanelModalidad } from "../../types";
import { useDialogos } from "../DialogosProvider";

interface Props {
  onBack: () => void;
  onMenuClick?: () => void;
  /** true para Gerente. Solo el Gerente puede eliminar un panel --
   *  a diferencia de crear/editar, que un Trabajador puede pedir y
   *  queda pendiente de aprobación, borrar es irreversible y puede
   *  afectar contratos históricos, así que directamente no se ofrece
   *  la opción si no sos Gerente. */
  esGerente?: boolean;
}

const ESTADOS: PanelEstado[] = ["Disponible", "Ocupado", "Mantenimiento", "Libre"];

const ESTADO_BADGE: Record<PanelEstado, { bg: string; color: string }> = {
  Disponible: { bg: "rgba(34,197,94,0.12)", color: "#16A34A" },
  Libre: { bg: "rgba(34,197,94,0.12)", color: "#16A34A" },
  Ocupado: { bg: "rgba(8,119,255,0.12)", color: "#0877FF" },
  Mantenimiento: { bg: "rgba(124,58,237,0.12)", color: "#7C3AED" },
};

// Centro por defecto del mapa: Lima, Peru (donde opera el negocio).
const CENTRO_DEFECTO: [number, number] = [-12.0464, -77.0428];

const inputStyle = campoBase;

/** Las 4 opciones fijas de "Tipo" que se pidió que hubiera, cada una
 *  con su modalidad comercial ya pegada (ver PanelModalidad en
 *  types/index.ts): Mural y Paradero son impresos de una sola cara
 *  (cupo 1, exclusivos), Unipolar es impreso de DOS caras (cupo 2),
 *  LED es pantalla digital (sin límite real de anunciantes). */
const TIPOS_PANEL: { tipo: string; modalidad: PanelModalidad; detalle: string }[] = [
  { tipo: "Mural", modalidad: "lona", detalle: "Impreso, una cara: un solo cliente a la vez" },
  { tipo: "Unipolar", modalidad: "unipolar", detalle: "Impreso, dos caras: hasta 2 clientes a la vez" },
  { tipo: "Paradero", modalidad: "lona", detalle: "Mobiliario urbano impreso: un solo cliente a la vez" },
  { tipo: "LED", modalidad: "led", detalle: "Pantalla digital: rota varios clientes a la vez" },
];

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

export default function Paneles({ onBack, onMenuClick, esGerente = true }: Props) {
  const { confirmar } = useDialogos();
  const state = usePanelesDisponibles(true);
  const panelesTodos = state.status === "ready" ? state.paneles : [];
  const [busqueda, setBusqueda] = useState("");
  // Busca por nombre, ciudad, tipo y dirección: cuando el inventario
  // crece, encontrar "el de la avenida" es más rápido escribiendo que
  // scrolleando.
  const paneles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return panelesTodos;
    return panelesTodos.filter((p) =>
      [p.nombre, p.ciudad, p.tipo, (p as { direccion?: string }).direccion]
        .some((campo) => String(campo ?? "").toLowerCase().includes(q))
    );
  }, [panelesTodos, busqueda]);

  // ── Eliminar panel (solo Gerente) -- botón de tres puntos, mismo
  // patrón que Usuarios (Accesos.tsx). ──
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState("");

  async function eliminarPanel(panel: Panel) {
    if (!cloudFunctions) { setErrorEliminar("Sin conexión. Intenta de nuevo."); return; }
    const confirmado = await confirmar({
      titulo: "¿Eliminar este panel?",
      mensaje: `Se eliminará "${panel.nombre}" del inventario. No se puede deshacer.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
    });
    if (!confirmado) return;
    setMenuAbiertoId(null);
    setErrorEliminar("");
    setEliminandoId(panel.id);
    try {
      const fn = httpsCallable<{ panelId: string }, { ok: boolean }>(cloudFunctions, "eliminarPanel");
      await fn({ panelId: panel.id });
    } catch (error) {
      setErrorEliminar(mensajeDeError(error, "No se pudo eliminar el panel. Si acabas de actualizar la app, puede que falte desplegar la función en GitHub Actions."));
    } finally {
      setEliminandoId(null);
    }
  }

  const [mostrarForm, setMostrarForm] = useState(false);
  const [panelEditando, setPanelEditando] = useState<Panel | null>(null);
  const [nombre, setNombre] = useState("");
  // Tipo: ahora una lista fija (antes texto libre -- terminaba con
  // datos como "LDELE" cargados a mano sin querer). Cada opción trae
  // ya su modalidad comercial pegada (ver TIPOS_PANEL abajo), así que
  // tipo y modalidad no pueden quedar desalineados entre sí nunca más.
  const [tipo, setTipo] = useState("");
  const [modalidad, setModalidad] = useState<PanelModalidad>("led");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [estado, setEstado] = useState<PanelEstado>("Disponible");
  const [impactoDiario, setImpactoDiario] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [mensajeOk, setMensajeOk] = useState("");
  const [mapError, setMapError] = useState(false);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const observadorRef = useRef<ResizeObserver | null>(null);
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
        // Antes esto usaba el pin celeste genérico que trae Leaflet por
        // defecto (ni siquiera se veía bien -- Vite no empaqueta esas
        // imágenes automáticamente, así que ni cargaba el ícono).
        // Ahora usa el mismo pin V360 de Cobertura, así el admin ve acá,
        // al elegir la ubicación, el mismo pin que después va a
        // aparecer en el mapa real.
        markerRef.current = L.marker(latLng, {
          draggable: true,
          icon: L.divIcon({
            className: "coverage-leaflet-marker active",
            html: '<span><img src="/vista360-map-marker-v4.png" alt="" /></span>',
            iconSize: [48, 74],
            iconAnchor: [24, 72],
          }),
        }).addTo(mapRef.current);
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
          // Se pidió que este mapa (elegir dónde va un panel) sea
          // exactamente el mismo que el de Cobertura -- antes tenía su
          // propia configuración a medias (otro proveedor de mosaicos,
          // sin límites de zoom/arrastre) y se sentía como un mapa
          // distinto, de menor calidad. Ahora usa la misma configuración
          // fila por fila: mismos mosaicos (OpenStreetMap liso, no el
          // CARTO Voyager de antes), mismo límite de zoom calculado con
          // zoomMinimoSinGris() para no dejar ver gris al alejarse, mismo
          // freno duro en el borde del mundo (maxBounds/viscosity/
          // worldCopyJump) y mismo apagado del rebote elástico al tocar
          // ese límite. Ver Cobertura.tsx para el detalle de cada una.
          mapRef.current = L.map(mapEl.current, {
            zoomControl: false,
            attributionControl: false,
            // Mismo motivo que en Cobertura.tsx: zoom con rueda/pad
            // habilitado para escritorio -- Leaflet ya lo limita solo
            // al recuadro del mapa.
            scrollWheelZoom: true,
            doubleClickZoom: false,
            minZoom: zoomMinimoSinGris(mapEl.current.clientWidth, mapEl.current.clientHeight),
            maxBounds: [[-85, -180], [85, 180]],
            maxBoundsViscosity: 1.0,
            worldCopyJump: false,
            bounceAtZoomLimits: false,
          }).setView(inicial, 13);
          L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
          L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapRef.current);
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            // Mismo motivo que en Cobertura.tsx: mas margen de mosaicos
            // precargados alrededor de lo visible, para que un arrastre
            // normal no se tope con una franja gris recien cargando.
            keepBuffer: 4,
          }).addTo(mapRef.current);
          mapRef.current.on("click", (ev: any) => colocarMarcador(L, ev.latlng));

          if (numeroCoordenada(latRef.current) !== undefined && numeroCoordenada(lngRef.current) !== undefined) {
            colocarMarcador(L, { lat: numeroCoordenada(latRef.current)!, lng: numeroCoordenada(lngRef.current)! });
          }
        }

        // Mismo problema que en Cobertura: el contenedor todavía no tiene
        // su tamaño final cuando Leaflet lo mide, y el mapa queda gris.
        // Se observa el contenedor en vez de adivinar un retraso -- y,
        // igual que en Cobertura, se reajusta el zoom mínimo cada vez
        // que el tamaño real del recuadro cambia (entrada de pantalla,
        // giro del teléfono, teclado que se abre).
        mapRef.current.invalidateSize();
        if (mapEl.current && typeof ResizeObserver !== "undefined") {
          observadorRef.current?.disconnect();
          observadorRef.current = new ResizeObserver((entradas) => {
            mapRef.current?.invalidateSize();
            const recuadro = entradas[0]?.target as HTMLElement | undefined;
            if (recuadro && mapRef.current) {
              mapRef.current.setMinZoom(zoomMinimoSinGris(recuadro.clientWidth, recuadro.clientHeight));
            }
          });
          observadorRef.current.observe(mapEl.current);
        } else {
          window.setTimeout(() => mapRef.current?.invalidateSize(), 300);
        }
      })
      .catch(() => {
        if (!cancelado) setMapError(true);
      });

    return () => {
      cancelado = true;
      observadorRef.current?.disconnect();
      observadorRef.current = null;
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
    setModalidad("led");
    setPanelEditando(null);
    setNombre("");
    setTipo("");
    setCiudad("");
    setDireccion("");
    setLat("");
    setLng("");
    setEstado("Disponible");
    setImpactoDiario("");
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
    setModalidad(modalidadDePanel(p));
    setCiudad(p.ciudad ?? "");
    setDireccion(p.direccion ?? "");
    setLat(p.lat !== undefined ? String(p.lat) : "");
    setLng(p.lng !== undefined ? String(p.lng) : "");
    setEstado(p.estado ?? "Disponible");
    setImpactoDiario(p.impactoDiario !== undefined ? String(p.impactoDiario) : "");
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
      const impactoNum = numeroCoordenada(impactoDiario);
      if (panelEditando) {
        const fn = httpsCallable<
          { panelId: string; nombre: string; tipo: string; modalidad: string; ciudad: string; direccion: string; lat?: number; lng?: number; estado: string; impactoDiario?: number },
          { ok: boolean; pendiente?: boolean }
        >(cloudFunctions, "actualizarPanel");
        const res = await fn({
          panelId: panelEditando.id,
          nombre: nombre.trim(),
          tipo: tipo.trim(),
          modalidad,
          ciudad: ciudad.trim(),
          direccion: direccion.trim(),
          lat: numeroCoordenada(lat),
          lng: numeroCoordenada(lng),
          estado,
          impactoDiario: impactoNum,
        });
        setMensajeOk(res.data.pendiente ? "Enviado a tu Gerente para aprobación." : "Panel actualizado.");
      } else {
        const fn = httpsCallable<
          { nombre: string; tipo: string; modalidad: string; ciudad: string; direccion: string; lat?: number; lng?: number; estado: string; impactoDiario?: number },
          { id?: string; pendiente?: boolean }
        >(cloudFunctions, "crearPanel");
        const res = await fn({
          nombre: nombre.trim(),
          tipo: tipo.trim(),
          modalidad,
          ciudad: ciudad.trim(),
          direccion: direccion.trim(),
          lat: numeroCoordenada(lat),
          lng: numeroCoordenada(lng),
          estado,
          impactoDiario: impactoNum,
        });
        setMensajeOk(res.data.pendiente ? "Enviado a tu Gerente para aprobación." : "Panel creado.");
      }
      // No hace falta recargar a mano: la lista escucha en tiempo real,
      // así que el panel recién guardado aparece solo.
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
        <button type="button"
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
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Nombre del panel" style={inputStyle} />
              <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} maxLength={60} placeholder="Ciudad" style={inputStyle} />

              {/* Tipo fijo, no texto libre -- antes esto era un input
                  de texto y terminaba con datos cargados sin querer
                  (p. ej. "LDELE" en vez de "LED"). Elegir acá define A
                  LA VEZ el tipo que se muestra y la modalidad comercial
                  (cuántos clientes admite el soporte a la vez), así los
                  dos campos ya no pueden quedar desalineados entre sí. */}
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800, marginBottom: 8 }}>
                  Tipo de soporte
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {TIPOS_PANEL.map(({ tipo: valorTipo, modalidad: valorModalidad, detalle }) => (
                    <button
                      key={valorTipo}
                      type="button"
                      onClick={() => {
                        setTipo(valorTipo);
                        setModalidad(valorModalidad);
                      }}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 12,
                        cursor: "pointer",
                        border: tipo === valorTipo ? "1.5px solid #0877FF" : "1.5px solid #E5E7EB",
                        background: tipo === valorTipo ? "rgba(8,119,255,0.07)" : "#fff",
                      }}
                    >
                      <span style={{
                        display: "block", fontSize: 13, fontWeight: 800,
                        color: tipo === valorTipo ? "#0877FF" : "#0B1220",
                      }}>
                        {valorTipo}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "#64748B", marginTop: 3, lineHeight: 1.35 }}>
                        {detalle}
                      </span>
                    </button>
                  ))}
                </div>
                {tipo && !TIPOS_PANEL.some((t) => t.tipo === tipo) ? (
                  <div style={{ fontSize: 11, color: "#B45309", marginTop: 8 }}>
                    Este panel tiene un tipo antiguo ("{tipo}") que ya no es una opción -- elige uno de arriba para corregirlo.
                  </div>
                ) : null}
              </div>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={160} placeholder="Dirección (opcional)" style={inputStyle} />

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
              {/* Disponible/Ocupado ya no se guarda tal cual se elija
                  acá -- el sistema lo recalcula solo a partir de los
                  contratos vigentes apenas se guarda el panel, así que
                  elegir uno de esos dos acá no tiene efecto real (queda
                  como está el panel de verdad). Mantenimiento sí sigue
                  siendo 100% manual. */}
              {estado !== "Mantenimiento" && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: -4 }}>
                  Ocupado/Disponible se recalcula solo según los contratos vigentes -- esta lista no lo cambia. Solo "Mantenimiento" es manual.
                </div>
              )}
              <div>
                <input
                  value={impactoDiario}
                  onChange={(e) => setImpactoDiario(e.target.value)}
                  placeholder="Impacto diario aprox. (personas o vehículos, opcional)"
                  inputMode="numeric"
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5, lineHeight: 1.4 }}>
                  Estimado de cuánta gente pasa por acá en un día -- se usa para calcular el
                  impacto aproximado de las campañas en este panel. No hace falta un sensor,
                  puede ser un número de referencia (tránsito de la zona, etc).
                </div>
              </div>
            </div>
            {error && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 10 }}>{error}</div>}
            <button type="button"
              onClick={guardarPanel}
              disabled={creando}
              style={{ width: "100%", marginTop: 12, background: creando ? "#93C5FD" : "#0B1220", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, cursor: creando ? "not-allowed" : "pointer" }}
            >
              {creando
                ? (panelEditando ? "Guardando..." : "Creando...")
                : (panelEditando ? "Guardar cambios" : "Crear panel")}
            </button>
          </div>
        )}

        {mensajeOk && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", color: "#16A34A", borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
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
        {state.status === "ready" && panelesTodos.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Aún no hay paneles registrados.
          </div>
        )}

        {errorEliminar && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#DC2626", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "10px 12px" }}>
            {errorEliminar}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {panelesTodos.length > 0 && (
            <CampoBusqueda
              valor={busqueda}
              onCambio={setBusqueda}
              placeholder="Buscar por nombre, ciudad o dirección"
              resultados={paneles.length}
            />
          )}
          {paneles.map((p) => {
            const badge = ESTADO_BADGE[p.estado] ?? ESTADO_BADGE.Disponible;
            return (
              <div
                className="card"
                key={p.id}
                onClick={() => abrirEdicion(p)}
                style={{ padding: 14, cursor: "pointer", position: "relative" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{p.tipo} · {p.ciudad}</div>
                    {p.direccion && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.direccion}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      padding: "3px 9px", borderRadius: 20, background: badge.bg, color: badge.color,
                    }}>
                      {p.estado}
                    </span>
                    {esGerente && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMenuAbiertoId((id) => id === p.id ? null : p.id); }}
                        style={{
                          width: 30, height: 30, borderRadius: 14, border: "1px solid #E5E7EB",
                          background: "#fff", color: "#64748B", fontSize: 17, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0, lineHeight: 1,
                        }}
                        aria-label="Opciones del panel"
                      >
                        ⋯
                      </button>
                    )}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
                {eliminandoId === p.id && (
                  <div style={{ marginTop: 9, fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                    Eliminando...
                  </div>
                )}
                {menuAbiertoId === p.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", top: 44, right: 12, zIndex: 20, minWidth: 168,
                      background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                      boxShadow: "0 18px 38px rgba(15,23,42,0.16)", padding: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void eliminarPanel(p)}
                      style={{
                        width: "100%", border: "none", background: "transparent", borderRadius: 8,
                        padding: "14px 11px", textAlign: "left", fontSize: 12, fontWeight: 800,
                        color: "#DC2626", cursor: "pointer",
                      }}
                    >
                      Eliminar panel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
