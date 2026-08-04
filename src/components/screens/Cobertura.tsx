import { useEffect, useMemo, useRef, useState } from "react";
import BackChevron from "../BackChevron";
import MobileSidebarButton from "../MobileSidebarButton";
import type { Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { diasHasta, fechaLarga } from "../../utils/fechas";
import { agruparPorCercania, cargarLeaflet, offsetsCirculares, zoomMinimoSinGris } from "../../utils/leaflet";
import { campaignCityImage } from "../../utils/campaignCity";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";

interface Props {
  contratos: Contrato[];
  /** true solo cuando `contratos` ya es la respuesta REAL de Firestore
   *  para este cliente -- false mientras useContratos() todavía está
   *  cargando (recién logueado, o el admin acaba de cambiar de cliente
   *  en "vista cliente"). App.tsx colapsa ese estado de carga a un
   *  array vacío `[]` (contratosState.status === "ready" ? ... : []),
   *  así que sin esta bandera Cobertura no puede distinguir "este
   *  cliente de verdad no tiene ninguna campaña" de "todavía no sé
   *  cuáles son sus campañas". Esa confusión era real: por un instante
   *  cada panel se ve SIN contrato propio, así que hasta un panel que
   *  sí es del cliente se pinta azul ("ocupado por otro") en vez de
   *  negro ("mío"), hasta que llega el snapshot de verdad y se
   *  corrige solo. Con esta bandera, ese instante se cubre con
   *  "Cargando paneles" en vez de mostrar colores equivocados. */
  contratosListos: boolean;
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
    // OJO: si la campaña PROPIA ya "Finalizada", NO se corta acá con
    // "Finalizado" -- ese texto tapaba que el soporte pudiera estar
    // ocupado AHORA por otro cliente (o por una campaña más nueva).
    // Bug real reportado: un cliente con una campaña vieja ya
    // terminada en un mural seguía viendo "Finalizado" + "Volver a
    // contratar" aunque el panel ya lo tuviera otro cliente activo --
    // el pin/tarjeta nunca llegaban a mirar panel.estado porque tener
    // *cualquier* contrato propio (aunque fuera viejo) ganaba siempre.
    // Ahora, con la propia finalizada, sigue de largo y se apoya en el
    // estado real del panel, igual que cuando no hay contrato propio.
    if (estado !== "Finalizada") return "Activo";
  }
  return panel.estado === "Ocupado" ? "Ocupado" : panel.estado === "Mantenimiento" ? "Mantenimiento" : "Disponible";
}

// "Finalizado" a propósito NO es una de las etiquetas que puede devolver
// estadoTexto() -- una campaña propia ya terminada no tiene NINGÚN peso
// en el estado actual del panel (ver el comentario grande en
// estadoTexto): una vez que termina, es como si esa campaña no
// existiera para efectos de color/disponibilidad, punto. Lo único que
// queda de ella es informativo, solo dentro del popup (fecha en que
// "Finalizó" + botón "Volver a contratar") -- eso no pasa por acá.
function estadoColor(label: string) {
  if (label === "Activo") return "#22C55E";
  if (label === "Programado") return "#0877FF"; // antes naranja -- se pidió que no haya naranjas, todo en la paleta azul de la marca
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
  // OJO: antes había acá un atajo "si mi propio contrato en este panel
  // ya está Finalizada, es contratable" SIN mirar el estado real del
  // panel -- bug real reportado y confirmado con capturas: un cliente
  // con una campaña vieja ya terminada en un mural seguía viendo ese
  // panel como contratable/disponible aunque OTRO cliente lo tuviera
  // ocupado ahora mismo, porque tener cualquier contrato propio (aunque
  // fuera viejo) ganaba siempre y nunca se llegaba a mirar panel.estado.
  // Se quita ese atajo: con la propia Finalizada, sigue de largo y cae
  // en los mismos chequeos de abajo (libreDesde / panel.estado), igual
  // que un panel sin ningún contrato propio.
  //
  // Un soporte ocupado por otro cliente PERO con fecha de liberación
  // conocida también se puede pedir: se reserva para cuando quede libre.
  // Sigue mostrándose con su estado real ("Ocupado" + "Se libera el ...")
  // -- no aparece como si estuviera disponible hoy. OJO: esto solo debe
  // usarse para decidir si el botón "Solicitar"/el contador de
  // "pantallas que podrías contratar" aparecen -- NO para pintar el pin
  // (ver esPanelDisponibleAhora más abajo, que es la que manda ahí).
  if (panel.libreDesde) return true;
  // Antes esto exigía panel.estado === "Disponible" || "Libre" -- si
  // el panel no tenía ese campo seteado (undefined/""), quedaba NO
  // contratable, aunque estadoTexto() (arriba) SÍ lo mostrara como
  // "Disponible" (su propio fallback es tratar cualquier cosa que no
  // sea "Ocupado"/"Mantenimiento" como disponible). Esa inconsistencia
  // hacía que un panel con estado vacío apareciera etiquetado
  // "Disponible" en su pin/tarjeta, pero el contador "Pantallas que
  // podrías contratar" igual se quedara en 0 sin incluirlo. Ahora usa
  // el mismo criterio que estadoTexto para que ambos coincidan
  // siempre.
  return panel.estado !== "Ocupado" && panel.estado !== "Mantenimiento";
}

/** Si el panel está DE VERDAD libre HOY -- a diferencia de
 *  esPanelContratable() (arriba), acá NO cuenta panel.libreDesde como
 *  "disponible": libreDesde solo se guarda (ver estadoDesdeActivos en
 *  estadoPaneles.ts, backend) CUANDO el panel está lleno ahora mismo y
 *  se calcula la fecha en que se libera un cupo -- o sea que su sola
 *  presencia YA significa que está ocupado hoy, no que esté disponible.
 *  Esta es la función que tiene que mandar en el color del PIN: antes
 *  el pin usaba esPanelContratable(panel) directo, y como CUALQUIER
 *  panel ocupado con libreDesde conocido cae en el "if (panel.libreDesde)
 *  return true" de esa función, el pin se pintaba BLANCO (disponible)
 *  para paneles que en realidad estaban ocupados por otro cliente --
 *  exactamente el bug reportado ("el pin sigue en blanco"). El botón
 *  "Solicitar"/"Reservar para cuando se libere" sigue funcionando igual
 *  (usa esPanelContratable), lo único que cambia es qué pinta el pin. */
function esPanelDisponibleAhora(panel: PanelConUso) {
  if (esPanelActivoCliente(panel)) return false;
  // Mismo atajo roto que esPanelContratable (ver comentario ahí) --
  // este era el bug real detrás del pin blanco reportado: un cliente
  // con una campaña propia ya Finalizada en un panel exclusivo hacía
  // que ESTA función devolviera true (disponible/blanco) sin importar
  // que panel.estado dijera "Ocupado" por otro cliente. Se quita, cae
  // en el chequeo real de abajo igual que sin contrato propio.
  return panel.estado !== "Ocupado" && panel.estado !== "Mantenimiento";
}

/** Los 3 casos que puede mostrar un pin -- se pidió distinguir a
 *  simple vista "mío" de "ocupado por otro cliente" (antes los dos
 *  se veían negros por igual, y varias veces se confundió uno con
 *  otro). "mio": tengo una campaña propia vigente/programada acá.
 *  "ocupado": no es mío, pero no está disponible (otro cliente lo
 *  tiene, o está en Mantenimiento). "disponible": nadie lo tiene hoy. */
type EstadoPinPanel = "mio" | "ocupado" | "disponible";

function estadoPinPanel(panel: PanelConUso): EstadoPinPanel {
  if (esPanelActivoCliente(panel)) return "mio";
  return esPanelDisponibleAhora(panel) ? "disponible" : "ocupado";
}

const PIN_URL: Record<EstadoPinPanel, string> = {
  mio: "/vista360-map-marker-v4.png",
  ocupado: "/vista360-map-marker-occupied.png",
  disponible: "/vista360-map-marker-available.png",
};

const PIN_CLASE: Record<EstadoPinPanel, string> = {
  mio: "is-contracted",
  ocupado: "is-occupied",
  disponible: "is-available",
};

// Mismo umbral que usa recordatorioVencimientoCampanas (Cloud
// Function) para avisarle al cliente que su campaña vence pronto --
// acá se usa para mostrar el botón "Solicitar renovación" en el popup.
const DIAS_AVISO_RENOVACION = 10;



/** El popup del pin se arma como HTML plano (Leaflet no acepta JSX) --
 *  escapamos nombre/direccion/ciudad porque vienen de datos cargados
 *  por el admin, no queremos que un "<" o "&" suelto rompa el markup. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // La comilla simple también: el popup se arma como HTML crudo y hay
    // atributos con comillas simples (style="...url('X')"). Hoy ningún
    // dato del usuario cae ahí, pero el día que caiga sería inyección
    // directa y nadie lo notaría.
    .replace(/'/g, "&#39;");
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
  // Se pidió, explícitamente y varias veces, que una campaña propia ya
  // Finalizada "no tenga nada que ver" con lo que se muestra en el pin
  // -- ni su fecha de fin, ni un botón de "volver a contratar" ligado a
  // ella, nada. Antes acá se guardaba igual (para mostrar "Finalizó
  // [fecha]" + "Volver a contratar" como mensaje informativo/nostálgico)
  // aunque ya no afectara el color -- pero eso es justo lo que se pidió
  // sacar: mezclaba la fecha en que ESTE cliente terminó con la fecha en
  // que se libera el panel para QUIEN SEA que lo tenga ahora (a veces
  // otro cliente entero), y se veía como si todavía hubiera alguna
  // relación vigente cuando no la hay. Por eso, para todo lo que sigue
  // (foto, fecha de vigencia, botón), un contrato propio Finalizado se
  // trata exactamente IGUAL que no tener ningún contrato: como si esta
  // campaña nunca hubiera existido para efectos de lo que se muestra hoy.
  const contrato = panel.contrato && estadoCampana(panel.contrato) !== "Finalizada" ? panel.contrato : undefined;
  const fotoUrl = campaignCityImage(contrato?.id ?? panel.id);

  // Con contrato Activo y cerca de vencer -- se pidió que además de la
  // fecha de vigencia aparezca "Solicitar renovación" (no en reemplazo).
  const enRenovacion = Boolean(contrato && label === "Activo" && diasHasta(contrato.fin) <= DIAS_AVISO_RENOVACION);

  const vigenciaHtml = contrato
    ? `
        <div class="coverage-popup-divider"></div>
        <div class="coverage-popup-until">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#64748B" stroke-width="1.6"/><path d="M3 9h18M8 2v4M16 2v4" stroke="#64748B" stroke-width="1.6" stroke-linecap="round"/></svg>
          <div class="coverage-popup-until-body">
            <span class="coverage-popup-until-label">Vigente hasta</span>
            <span class="coverage-popup-until-value">${escapeHtml(fechaLarga(contrato.fin))}</span>
          </div>
        </div>
      `
    : "";

  // Cuándo se libera un soporte exclusivo ocupado -- por otro cliente,
  // o por alguien más aunque este cliente haya tenido antes (ya
  // Finalizada, así que para esta pantalla es como si no la hubiera
  // tenido) una campaña acá. Es la pregunta que más se hace al ver un
  // pin ocupado ("¿y para noviembre?"), y hasta ahora no había dónde
  // responderla.
  const libreDesde = !contrato && panel.libreDesde ? String(panel.libreDesde) : "";
  const libreDesdeHtml = libreDesde
    ? `
        <div class="coverage-popup-divider"></div>
        <div class="coverage-popup-until">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#64748B" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="#64748B" stroke-width="1.6" stroke-linecap="round"/></svg>
          <div class="coverage-popup-until-body">
            <span class="coverage-popup-until-label">Se libera</span>
            <span class="coverage-popup-until-value">${escapeHtml(fechaLarga(libreDesde))}</span>
          </div>
        </div>
      `
    : "";

  const accionHtml = !permitirSolicitar
    ? ""
    : !contrato
    ? `
        <button type="button" class="coverage-popup-action" data-cobertura-accion="disponibilidad" data-panel-id="${panel.id}">
          ${libreDesde ? "Reservar para cuando se libere" : "Solicitar disponibilidad"}
        </button>
      `
    : enRenovacion
    ? `
        <button type="button" class="coverage-popup-action" data-cobertura-accion="renovacion" data-panel-id="${panel.id}">
          Solicitar renovación
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
        ${panel.tipo ? `<div class="coverage-popup-tipo">${escapeHtml(panel.tipo)}</div>` : ""}
        <div class="coverage-popup-address">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z" stroke="#64748B" stroke-width="1.6"/><circle cx="12" cy="10" r="1.8" stroke="#64748B" stroke-width="1.6"/></svg>
          <span>${direccion}</span>
        </div>
        ${vigenciaHtml}
        ${libreDesdeHtml}
        ${accionHtml}
      </div>
    </div>
  `;
}

export default function Cobertura({ contratos, contratosListos, onBack, onMenuClick, onSolicitarPanel }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const observadorRef = useRef<ResizeObserver | null>(null);
  // Markers de Leaflet ya creados, guardados en un ref (no en estado)
  // para que el listener de zoom pueda leer siempre la versión más
  // reciente sin quedar "pegado" a los valores de cuando se enganchó
  // por primera vez.
  const markersPorIdRef = useRef<Map<string, any>>(new Map());
  const reposicionarSolapadosRef = useRef<(zoomObjetivo?: number) => void>(() => undefined);
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
    //
    // Un mismo panel puede tener MÁS DE UN contrato de este cliente a
    // lo largo del tiempo -- típicamente uno viejo ya Finalizado y uno
    // nuevo recién creado (renovación en el mismo punto). Antes acá se
    // hacía usados.set(panelId, contrato) sin más, así que el ÚLTIMO
    // contrato de ese panel recorrido en el forEach ganaba SIEMPRE --
    // y como la query de useContratos() viene ordenada por
    // inicio DESCENDENTE (el más nuevo primero), el contrato viejo
    // terminaba procesándose después y pisaba al nuevo en el Map. El
    // resultado: con una campaña nueva recién creada en un panel que
    // ya habías tenido antes, "panel.contrato" quedaba apuntando al
    // contrato VIEJO (Finalizado) -- así que esPanelActivoCliente()
    // decía que no era tuyo, y el pin se pintaba azul ("ocupado por
    // otro") en vez de negro, aunque el panel sí mostrara bien la
    // fecha de liberación de la campaña nueva (esa sí sale de
    // panel.estado/libreDesde, que no depende de este Map).
    //
    // Ahora, si un panel ya tiene un contrato asignado en el Map, uno
    // nuevo solo lo reemplaza si es "mejor" para representar el
    // estado actual: se prefiere cualquiera que NO esté Finalizado
    // por sobre uno que sí lo esté, y entre dos con el mismo estado,
    // el que termina más tarde (el más vigente/reciente).
    const usados = new Map<string, Contrato>();
    const esMejorParaPin = (nuevo: Contrato, existente: Contrato) => {
      const nuevoFinalizado = estadoCampana(nuevo) === "Finalizada";
      const existenteFinalizado = estadoCampana(existente) === "Finalizada";
      if (nuevoFinalizado !== existenteFinalizado) return existenteFinalizado;
      return nuevo.fin > existente.fin;
    };
    contratos.forEach((contrato) => {
      panelesDeContrato(contrato).forEach((panelId) => {
        const existente = usados.get(panelId);
        if (!existente || esMejorParaPin(contrato, existente)) usados.set(panelId, contrato);
      });
    });
    return todosPaneles
      .map((panel) => ({
        ...panel,
        lat: numeroCoordenada((panel as unknown as Record<string, unknown>).lat),
        lng: numeroCoordenada((panel as unknown as Record<string, unknown>).lng),
        contrato: usados.get(panel.id),
      }))
      // Antes acá se filtraban los paneles que no eran ni del cliente
      // ni "contratables" (esPanelContratable) -- en la práctica eso
      // escondía cualquier panel en Mantenimiento (u ocupado por otro
      // cliente sin fecha de liberación) aunque el comentario de
      // arriba dijera explícitamente que Cobertura debía mostrar TODO
      // el inventario. Ese filtro es justo el que hacía que, con 4
      // paneles reales, el mapa dijera "3 paneles" y uno quedara
      // invisible sin ningún aviso. El popup de cada pin ya arma su
      // propio botón de acción según el estado real del panel (ver
      // popupHtml más abajo), así que no depende de este filtro para
      // verse bien -- ahora se muestra el inventario completo, tal
      // como se pidió.
      .sort((a, b) => (a.ciudad || "").localeCompare(b.ciudad || "") || a.nombre.localeCompare(b.nombre));
  }, [contratos, todosPaneles]);

  const conCoordenadas = useMemo(() => lista.filter(tieneCoordenadas), [lista]);
  // Ver el comentario de `contratosListos` en Props -- mientras esto
  // sea false, "lista" ya tiene todos los paneles (vienen del
  // inventario global, no de los contratos) pero su campo `contrato`
  // todavía puede estar vacío para paneles que SÍ son del cliente. No
  // alcanza con `panelesState.status === "ready"` solo: ese es el
  // inventario de paneles, un listener totalmente aparte del de
  // contratos, así que puede estar "ready" mucho antes de que
  // useContratos() responda (sobre todo al cambiar de cliente sin
  // recargar la página, como hace el admin en "vista cliente").
  const datosListos = panelesState.status === "ready" && contratosListos;
  // Paneles distintos pueden compartir la misma ubicación, o estar a
  // pocos metros uno del otro (ej. un mediano y un grande en el mismo
  // poste/edificio de Pacífico, o en veredas opuestas de la misma
  // cuadra) -- puestos en pixeles casi iguales, uno queda tapando al
  // otro por completo, así que solo se veía el que se dibujaba
  // último.
  //
  // Antes esto se resolvía agrupando por coincidencia EXACTA de
  // coordenada (redondeada a 5 decimales, ~1m) y separando ~13m fijos
  // alrededor del punto. Dos problemas: (1) un par a más de ~1m de
  // distancia real ya no se detectaba como "el mismo punto" aunque en
  // pantalla, con el mapa alejado, cayera sobre los mismos pixeles
  // igual -- así se veía un pin tapando al otro por completo sin que
  // el código lo separara nunca (el caso de Guadalupe); y (2) 13m
  // reales son una separación enorme en pantalla con zoom cercano,
  // pero con el mapa alejado esos mismos 13m ocupan menos de un
  // pixel -- los pines seguían encimados, solo que invisiblemente.
  //
  // Ahora el agrupamiento se calcula por distancia real en PIXELES de
  // pantalla al zoom actual (no por coordenada), dentro del efecto
  // que dibuja el mapa (ver reposicionarSolapados más abajo) -- así
  // cualquier par que se vea pegado se separa, sea cual sea la
  // distancia real entre ellos, y se recalcula solo cada vez que
  // cambia el zoom.
  const panelesActivos = useMemo(() => conCoordenadas.filter(esPanelActivoCliente).length, [conCoordenadas]);
  const panelesContratables = useMemo(() => conCoordenadas.filter(esPanelContratable).length, [conCoordenadas]);
  // Cuántos paneles están ocupados por OTRO cliente (ni son míos ni
  // están libres) -- para la fila nueva de la leyenda con el pin azul.
  const panelesOcupadosPorOtros = useMemo(
    () => conCoordenadas.filter((panel) => estadoPinPanel(panel) === "ocupado").length,
    [conCoordenadas]
  );
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
            // Zoom con la rueda del mouse o con el pad (dos dedos,
            // gesto de pellizcar) -- se pidió habilitarlo para
            // escritorio/laptop, donde no hay pantalla táctil. Leaflet
            // ya lo limita solo al recuadro del mapa (mueve el mouse
            // afuera y el resto de la página scrollea normal), así que
            // no hace falta ninguna condición extra para que no
            // "atrape" el scroll del resto de la pantalla.
            scrollWheelZoom: true,
            // Doble click/doble toque para hacer zoom IN estaba activado
            // por defecto. En un mapa chico, un pellizco para alejar que
            // no sale perfectamente limpio (los dos dedos tocan casi a la
            // vez, no exactamente juntos) se puede leer como un doble
            // toque -- y el mapa hacia zoom IN justo cuando el usuario
            // queria alejarse. Ya estan los botones +/- para zoom
            // explicito, asi que se apaga el doble click/doble toque.
            doubleClickZoom: false,
            // Sin esto, al alejar el zoom se veia gris arriba/abajo (zonas
            // sin tiles cerca de los polos) y arrastrando el mapa a los
            // lados se podia seguir de largo viendo el mismo mapa repetido
            // sin fin. maxBounds + viscosity "frena" el arrastre justo en
            // el borde del mundo, worldCopyJump:false evita que Leaflet
            // dibuje copias repetidas del mapa al cruzar los 180°.
            //
            // minZoom fijo (antes 3) era un numero adivinado: en un
            // recuadro angosto de celular sobraba gris arriba/abajo, y en
            // uno ancho de escritorio no dejaba alejarse tanto como se
            // podia sin que apareciera gris. Se calcula abajo, con
            // zoomMinimoSinGris(), a partir del tamaño real del recuadro,
            // y se reajusta cada vez que ese tamaño cambia (mismo
            // observador que ya corrige el mapa que nacia gris).
            minZoom: zoomMinimoSinGris(mapEl.current.clientWidth, mapEl.current.clientHeight),
            maxBounds: [[-85, -180], [85, 180]],
            maxBoundsViscosity: 1.0,
            worldCopyJump: false,
            // Por defecto Leaflet deja pasarse un poco del minZoom/maxZoom
            // MIENTRAS se esta pellizcando con los dedos (a proposito, para
            // que se sienta "elastico" en vez de topar en seco), y recien
            // rebota de vuelta al limite cuando se sueltan los dedos. Como
            // el minZoom de arriba ya esta calculado justo en el punto
            // exacto sin gris (sin ningun margen de sobra), ese pasarse
            // aunque sea un instante ya alcanza a mostrar gris. El boton
            // -/+ no tiene este problema porque no tiene efecto elastico.
            // Se apaga para que el pellizco tope duro en el mismo limite
            // que el boton, sin ese instante de gris.
            bounceAtZoomLimits: false,
          });
          L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
          L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapRef.current);
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            // Por defecto Leaflet solo mantiene cargados 2 mosaicos mas
            // alla del borde visible. Un arrastre normal en el celular se
            // sale de ese margen facil, y en una conexion mas lenta (datos
            // moviles, no la conexion rapida de una oficina) eso se ve
            // como una franja gris que recien ahi empieza a cargar. Con
            // mas margen (4) se precargan mosaicos mas alla de lo que se
            // ve, en segundo plano, asi que un arrastre tipico ya
            // encuentra el mosaico listo en vez de pedirlo recien al
            // moverse.
            keepBuffer: 4,
          }).addTo(mapRef.current);

          // Enganchado UNA sola vez (recién al crear el mapa, no en
          // cada corrida de este efecto) -- llama siempre a la versión
          // más reciente de reposicionarSolapados a través del ref, así
          // no hace falta desenganchar/re-enganchar en cada redibujado.
          mapRef.current.on("zoomend", () => reposicionarSolapadosRef.current());

          // El "zoomend" de arriba solo corrige DESPUÉS de que termina
          // la animación de acercar/alejar -- mientras esa animación
          // corre, cada pin se mueve suave hacia donde proyecta su
          // coordenada actual (que todavía tiene guardado el offset
          // separado calculado para el ZOOM ANTERIOR). Un offset de 9px
          // calculado al zoom viejo no son 9px al zoom nuevo (son el
          // doble al acercar un nivel, la mitad al alejar uno), así que
          // durante la animación se veía a los pines separarse de más
          // (o juntarse de más) y recién al terminar "zoomend" los
          // volvía a poner en su offset correcto -- ese salto final es
          // el "se abre y se vuelve a apilar" que se reportó.
          //
          // Leaflet dispara "zoomanim" UNA vez, al arrancar cada
          // animación, ya con el zoom de DESTINO (no el actual) en
          // evento.zoom -- y cada marker, al recibirlo, recalcula su
          // posición en pantalla proyectando SU coordenada al zoom de
          // destino antes de deslizarse ahí. Si acá adelantamos la
          // coordenada del marker a la posición ya separada para el
          // zoom de destino (en vez de esperar a "zoomend"), el cálculo
          // interno del marker usa esa coordenada ya correcta y se
          // desliza en un solo movimiento limpio hacia el lugar final
          // -- sin pasar por una distancia intermedia equivocada ni dar
          // el salto al terminar. Se engancha PRIMERO (acá, al crear el
          // mapa, antes de que exista ningún marker) para que corra
          // antes que la animación propia de cada marker.
          mapRef.current.on("zoomanim", (evento: any) => reposicionarSolapadosRef.current(evento.zoom));
        }

        markersRef.current?.remove();
        markersRef.current = L.layerGroup().addTo(mapRef.current);
        markersPorIdRef.current = new Map();

        // Mientras !datosListos, se deja el grupo de markers vacío
        // (arriba) en vez de dibujar con contratos incompletos -- ver
        // el comentario de `contratosListos` en Props. En cuanto llega
        // el snapshot real de contratos, "conCoordenadas" cambia de
        // referencia y este efecto se vuelve a correr solo, esta vez
        // con datosListos=true.
        if (datosListos) conCoordenadas.forEach((panel) => {
          const selected = panel.id === seleccionado?.id;
          // 3 colores de pin a propósito (se pidió distinguir "mío" de
          // "ocupado por otro" -- antes los dos se veían negros igual y
          // se prestaba a confusión): negro = tengo yo una campaña
          // vigente/programada acá; azul = no es mío pero no está
          // disponible (otro cliente lo tiene, o está en Mantenimiento);
          // blanco = de verdad está libre hoy. estadoPinPanel() decide
          // cuál de los tres es, usando esPanelActivoCliente() y
          // esPanelDisponibleAhora() (NO esPanelContratable: esa además
          // cuenta como "disponible" a un panel lleno con libreDesde
          // conocido, a propósito, para permitir reservarlo por
          // adelantado -- pero eso pintaba el pin blanco, que era el
          // bug original reportado).
          const estadoPin = estadoPinPanel(panel);
          const pinUrl = PIN_URL[estadoPin];
          // Siempre arranca en su coordenada REAL -- si comparte punto
          // con otro panel, reposicionarSolapados() lo corre a un lado
          // apenas se termina de armar el mapa (y de nuevo cada vez que
          // cambia el zoom), calculando la separación en píxeles de
          // pantalla en vez de grados fijos.
          const marker = L.marker([panel.lat, panel.lng], {
            icon: L.divIcon({
              className: `coverage-leaflet-marker ${selected ? "active" : ""} ${PIN_CLASE[estadoPin]}`,
              html: `<span><img src="${pinUrl}" alt="" /></span>`,
              iconSize: selected ? [48, 74] : [38, 58],
              iconAnchor: selected ? [24, 72] : [19, 56],
            }),
          })
            .addTo(markersRef.current)
            .on("click", () => setSeleccionadoId(panel.id));
          markersPorIdRef.current.set(panel.id, marker);
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
              // Leaflet hoy recrea el contenido del popup en cada apertura,
              // así que las escuchas viejas mueren con el elemento viejo.
              // Pero eso es un detalle interno suyo que podría cambiar al
              // actualizar la librería, y si dejara de recrearlo se irían
              // acumulando escuchas y un solo toque dispararía la acción
              // varias veces. Esta marca lo vuelve inmune a ese cambio.
              if (boton.dataset.enganchado === "1") return;
              boton.dataset.enganchado = "1";
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

        // Separa en pantalla los pines que quedan pegados -- ver el
        // comentario largo junto a conCoordenadas más arriba. Se llama
        // una vez acá (con el zoom que haya quedado tras
        // fitBounds/setView de arriba) y de nuevo cada vez que el mapa
        // cambia de zoom (ver el "zoomend" enganchado más arriba).
        function reposicionarSolapados(zoomObjetivo?: number) {
          if (!mapRef.current) return;
          // Normalmente se llama sin argumento ("zoomend", primer
          // dibujado, ResizeObserver) y usa el zoom actual. El
          // enganche a "zoomanim" de más arriba SÍ manda un zoom
          // explícito -- el de DESTINO de la animación que recién
          // arranca, todavía distinto del actual -- para adelantar el
          // cálculo y evitar el salto visual al terminar.
          const zoom = zoomObjetivo ?? mapRef.current.getZoom();
          // UMBRAL_PX: a partir de qué distancia en pantalla dos pines
          // cuentan como "pegados". RADIO_PX: qué tan lejos del centro
          // real del grupo se corre cada uno al separarlos.
          //
          // Antes esto separaba del todo (52px entre 2 pines) para que
          // no se pisaran los íconos -- pero se pidió lo contrario: si
          // dos paneles están cerca de verdad, que SE VEAN cerca (uno
          // apilado detrás del otro, como una referencia que mandó el
          // usuario), no separados como si estuvieran lejos (eso
          // "engaña"). Ahora el offset es chico (9px, 18px entre los
          // dos) y en diagonal hacia arriba-derecha (ANGULO_INICIAL),
          // para que se vean apilados/asomando uno detrás del otro en
          // vez de lado a lado -- alcanza para que ninguno quede 100%
          // tapado (el bug original en Guadalupe), sin dar la
          // impresión de que están lejos.
          //
          // El agrupamiento en sí (agruparPorCercania) y el cálculo de
          // los offsets (offsetsCirculares) son funciones puras en
          // utils/leaflet.ts, con sus propios tests -- acá solo se los
          // alimenta con pixeles reales del mapa.
          const UMBRAL_PX = 40;
          const RADIO_PX = 9;
          const ANGULO_INICIAL = -Math.PI / 4; // arriba a la derecha

          const puntos = conCoordenadas.map((panel) => {
            const px = mapRef.current.project([panel.lat, panel.lng], zoom);
            return { id: panel.id, x: px.x, y: px.y, panel };
          });

          agruparPorCercania(puntos, UMBRAL_PX).forEach((grupo) => {
            if (grupo.length === 1) {
              // Sin superposición a este zoom -- vuelve a su
              // coordenada real (puede haber quedado corrido de un
              // zoom anterior donde sí compartía pixeles con otro).
              const marker = markersPorIdRef.current.get(grupo[0].panel.id);
              marker?.setLatLng([grupo[0].panel.lat, grupo[0].panel.lng]);
              return;
            }
            // Centro real del grupo (promedio de sus coordenadas) para
            // que la separación quede pareja alrededor del punto real,
            // no sesgada hacia el primero de la lista.
            const centroLat = grupo.reduce((suma, p) => suma + p.panel.lat, 0) / grupo.length;
            const centroLng = grupo.reduce((suma, p) => suma + p.panel.lng, 0) / grupo.length;
            const centroPx = mapRef.current.project([centroLat, centroLng], zoom);
            const offsets = offsetsCirculares(grupo.length, RADIO_PX, ANGULO_INICIAL);
            grupo.forEach((punto, i) => {
              const marker = markersPorIdRef.current.get(punto.panel.id);
              if (!marker) return;
              const offset = L.point(offsets[i].dx, offsets[i].dy);
              marker.setLatLng(mapRef.current.unproject(centroPx.add(offset), zoom));
            });
          });
        }
        reposicionarSolapadosRef.current = reposicionarSolapados;
        reposicionarSolapados();

        // El mapa nacía GRIS: Leaflet calcula el tamaño del contenedor al
        // crearse, pero para entonces la pantalla todavía está entrando
        // (.screens tiene una animación de 300ms) y el contenedor aún no
        // tiene su alto final. Los mosaicos se descargaban bien -- se ve en
        // la red, todos 200 -- pero quedaban colocados fuera de vista, así
        // que el usuario veía un recuadro vacío. Solo se arreglaba si
        // cambiabas el tamaño de la ventana, cosa que en un celular no
        // pasa nunca.
        //
        // Adivinar un retraso fijo es frágil (depende de la animación, de
        // la fuente, de lo rápido que sea el equipo). En vez de eso se
        // OBSERVA el contenedor y se recalcula cada vez que su tamaño
        // cambia de verdad: cubre la entrada de la pantalla, el giro del
        // teléfono, el teclado que se abre y el cambio de ventana.
        mapRef.current.invalidateSize();
        // reposicionarSolapados() ya se había llamado arriba, pero en
        // ese momento el contenedor todavía podía no tener su tamaño
        // final (ver comentario de abajo) -- el project()/unproject()
        // de recién usaba ese tamaño viejo/chico para convertir entre
        // píxeles y coordenadas, así que el pin superpuesto podía
        // terminar mal ubicado (pegado al otro de nuevo) justo al
        // entrar a la pantalla -- recién se corregía solo cuando la
        // persona tocaba el zoom, porque para entonces el contenedor
        // ya tenía su tamaño real. Se repite acá, después de
        // invalidateSize(), para que quede bien desde el primer
        // instante.
        reposicionarSolapadosRef.current();
        if (mapEl.current && typeof ResizeObserver !== "undefined") {
          observadorRef.current?.disconnect();
          observadorRef.current = new ResizeObserver((entradas) => {
            mapRef.current?.invalidateSize();
            const recuadro = entradas[0]?.target as HTMLElement | undefined;
            if (recuadro && mapRef.current) {
              mapRef.current.setMinZoom(zoomMinimoSinGris(recuadro.clientWidth, recuadro.clientHeight));
            }
            // El tamaño real del contenedor puede terminar de asentarse
            // acá (recién cuando termina la animación de entrada de la
            // pantalla) -- se recalcula la separación de pines de nuevo
            // por la misma razón que arriba.
            reposicionarSolapadosRef.current();
          });
          observadorRef.current.observe(mapEl.current);
        } else {
          // Navegador sin ResizeObserver: se vuelve al empujón por tiempo.
          window.setTimeout(() => {
            mapRef.current?.invalidateSize();
            reposicionarSolapadosRef.current();
          }, 300);
        }
        // También en el próximo frame (además de arriba) -- cubre el
        // caso en que el navegador YA tenía el tamaño correcto en el
        // primer render (así que el ResizeObserver de arriba no dispara
        // ningún cambio, nunca llega a recalcular), pero project()
        // recién queda 100% confiable un frame después de crear el
        // mapa.
        requestAnimationFrame(() => reposicionarSolapadosRef.current());
      })
      .catch(() => {
        if (!cancelado) {
          setMapError(true);
          setMapReady(false);
        }
      });

    return () => {
      cancelado = true;
      observadorRef.current?.disconnect();
      observadorRef.current = null;
    };
  }, [conCoordenadas, seleccionado, seleccionadoId, datosListos]);

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
          {mapReady && !mapError && datosListos && (
            <div className="coverage-map-legend coverage-map-legend-desktop" aria-label="Leyenda del mapa">
              <div>
                <img src="/vista360-map-marker-available.png" decoding="async" alt="" aria-hidden="true" />
                <span>Paneles que puedes contratar</span>
                <strong>{panelesContratables}</strong>
              </div>
              <div>
                <img src="/vista360-map-marker-v4.png" decoding="async" alt="" aria-hidden="true" />
                <span>Paneles contratados</span>
                <strong>{panelesActivos}</strong>
              </div>
              <div>
                <img src="/vista360-map-marker-occupied.png" decoding="async" alt="" aria-hidden="true" />
                <span>Paneles ocupados</span>
                <strong>{panelesOcupadosPorOtros}</strong>
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
          {mapReady && !mapError && (panelesState.status === "loading" || !contratosListos) && (
            <div className="coverage-map-loading">
              <span aria-hidden="true" />
              Cargando paneles
            </div>
          )}
          {mapReady && !mapError && panelesState.status === "error" && (
            <div className="coverage-map-loading is-error">{panelesState.message}</div>
          )}
          {mapReady && !mapError && datosListos && conCoordenadas.length === 0 && (
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

        {mapReady && !mapError && datosListos && (
          <div className="coverage-map-legend coverage-map-legend-mobile" aria-label="Leyenda del mapa">
            <div>
              <img src="/vista360-map-marker-available.png" decoding="async" alt="" aria-hidden="true" />
              <span>Paneles que puedes contratar</span>
              <strong>{panelesContratables}</strong>
            </div>
            <div>
              <img src="/vista360-map-marker-v4.png" decoding="async" alt="" aria-hidden="true" />
              <span>Paneles contratados</span>
              <strong>{panelesActivos}</strong>
            </div>
            <div>
              <img src="/vista360-map-marker-occupied.png" decoding="async" alt="" aria-hidden="true" />
              <span>Paneles ocupados</span>
              <strong>{panelesOcupadosPorOtros}</strong>
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
              {seleccionado.tipo && <div className="coverage-selected-tipo">{seleccionado.tipo}</div>}
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
          {panelesState.status === "loading" || !contratosListos ? (
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
