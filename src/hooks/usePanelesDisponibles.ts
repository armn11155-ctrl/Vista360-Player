import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { mensajeDeError } from "../utils/errores";
import type { Panel } from "../types";

export type PanelesDisponiblesState =
  | { status: "loading" }
  | { status: "ready"; paneles: Panel[] }
  | { status: "error"; message: string };

/** Se conserva `recargar` aunque con tiempo real los cambios lleguen
 *  solos: sirve para reintentar a mano si la escucha falló (por ejemplo,
 *  tras quedarse sin señal). */
export type PanelesDisponiblesResult = PanelesDisponiblesState & { recargar: () => void };

// Caché en memoria del último listado bueno -- los paneles son el
// mismo inventario para TODOS (no hay uno por cliente, a diferencia de
// useInformes), así que no hace falta una key por nadie. Se pidió que
// Cobertura no muestre "Cargando paneles" cada vez que se entra: sin
// esto, como el hook arranca en loading" en CADA montaje (Cobertura es
// una pantalla lazy que se desmonta al salir), el mapa mostraba ese
// aviso una y otra vez aunque los paneles ya se hubieran visto hace un
// momento. Ahora, si ya hay algo en caché, se arranca directo en
// "ready" con eso -- se ve el mapa completo al toque -- mientras la
// escucha en tiempo real de abajo sigue corriendo igual y corrige
// cualquier cambio real apenas llega.
let CACHE_PANELES: Panel[] | null = null;

/** JSON.stringify normal depende del orden en que las llaves quedaron
 *  insertadas en cada objeto -- y Firestore no garantiza que ese orden
 *  se mantenga igual entre una lectura y la siguiente para el MISMO
 *  documento sin cambios. Esta versión ordena las llaves (recursivamente,
 *  por si algún campo fuera un objeto anidado) antes de convertir a
 *  texto, así la comparación es estable de verdad y no depende de cómo
 *  Firestore decida entregar los campos esa vez. */
function ordenarClavesRecursivo(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarClavesRecursivo);
  if (valor && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    const ordenado: Record<string, unknown> = {};
    for (const clave of Object.keys(objeto).sort()) {
      ordenado[clave] = ordenarClavesRecursivo(objeto[clave]);
    }
    return ordenado;
  }
  return valor;
}
function comparacionEstable(paneles: Panel[]): string {
  return JSON.stringify(ordenarClavesRecursivo(paneles));
}

// --- Escucha única compartida entre todas las pantallas ---
//
// Antes, cada pantalla que usaba este hook (Cobertura, Paneles, Nueva
// campaña) abría su PROPIA escucha de Firestore al montarse y la
// cerraba al desmontarse. Eso traía dos costos: la escucha se
// reconectaba una y otra vez (de ahí el trabajo extra para evitar el
// parpadeo de arriba), y -- más importante para lo que se pidió acá --
// la primera vez que se entraba a Cobertura EN TODA LA SESIÓN, no había
// forma de evitar el "Cargando paneles": el pedido a Firestore recién
// arrancaba cuando la pantalla se montaba, así que sí o sí había que
// esperar la ida y vuelta a la red.
//
// Ahora hay una sola escucha compartida (este módulo), que se puede
// arrancar de antemano con precargarPaneles() -- y App.tsx la llama
// durante el precalentamiento en segundo plano apenas la app queda
// ociosa (mismo momento en que se precargan los códigos de las
// pantallas). Así, para cuando la persona realmente toca "Cobertura"
// por primera vez, lo más probable es que los paneles ya hayan llegado
// mientras miraba Inicio, y no vea "Cargando" en absoluto. Si igual no
// llegaron a tiempo (recién abrió la app y tocó Cobertura de
// inmediato), se ve el "Cargando" de siempre -- pero solo esa vez.
let escuchaActiva = false;
let unsubEscucha: (() => void) | null = null;
const suscriptores = new Set<(estado: PanelesDisponiblesState) => void>();

function avisarSuscriptores(estado: PanelesDisponiblesState) {
  suscriptores.forEach((fn) => fn(estado));
}

/** Deja la lista en caché y avisa a las pantallas, evitando trabajo de
 *  más cuando el contenido no cambió realmente (ver el comentario largo
 *  sobre el parpadeo de los pines, más abajo). */
/**
 * Avisa si el barrido diario dejó de correr.
 *
 * ES UN FALLO QUE NO SE VE. Si la tarea diaria se para --el secreto de
 * GitHub caducó, alguien desactivó el workflow, GitHub desactiva las
 * tareas programadas de un repositorio inactivo-- la aplicación sigue
 * funcionando perfectamente. Simplemente deja de actualizarse el estado
 * de los paneles: una campaña que terminó anoche sigue apareciendo como
 * "Ocupado", y el cliente ve un panel libre marcado como tomado.
 *
 * Nadie se entera hasta que alguien lo nota por casualidad.
 *
 * Aquí SÍ vale medir por antigüedad, y es importante entender por qué:
 * este documento lo reescribe el barrido TODOS los días, cambie algo o
 * no. Así que si es viejo, el barrido no corrió. (El resumen de cada
 * cliente es distinto: ese solo cambia cuando alguien escribe, y que sea
 * viejo es perfectamente normal. Ahí la antigüedad no dice nada, y por
 * eso no se vigila igual.)
 *
 * Coste: una resta de fechas cuando llega el documento. Nada.
 */
const DIAS_TOLERADOS = 2;
let yaAvisoDelBarrido = false;

function avisarSiElBarridoDejoDeCorrer(actualizadoEn: unknown): void {
  if (yaAvisoDelBarrido || typeof actualizadoEn !== "string") return;
  const cuando = Date.parse(actualizadoEn);
  if (Number.isNaN(cuando)) return;
  const dias = (Date.now() - cuando) / 86400000;
  if (dias < DIAS_TOLERADOS) return;
  yaAvisoDelBarrido = true;
  console.error("[barrido diario detenido]", {
    diasSinActualizar: Math.floor(dias),
    queSignifica:
      "El inventario agrupado de paneles lleva días sin regenerarse, y ese documento se reescribe " +
      "a diario corra o no corra algo. El estado de los paneles esta congelado: una campana " +
      "terminada puede seguir apareciendo como ocupada.",
    queHacer:
      "Revisar en GitHub Actions el workflow 'Sincronizar estado de paneles (diario)': lo mas " +
      "probable es que este desactivado o que su secreto haya caducado.",
  });
}

function publicarPaneles(paneles: Panel[]) {
  const cambio = !CACHE_PANELES || comparacionEstable(paneles) !== comparacionEstable(CACHE_PANELES);
  if (!cambio) return;
  CACHE_PANELES = paneles;
  avisarSuscriptores({ status: "ready", paneles });
}

function alFallarLaEscucha(err: unknown) {
  // Si falla pero ya había algo en caché, se deja lo último bueno en
  // pantalla en vez de tapar el mapa con un error -- mismo criterio que
  // useInformes.
  escuchaActiva = false;
  unsubEscucha = null;
  if (CACHE_PANELES) return;
  avisarSuscriptores({ status: "error", message: mensajeDeError(err, "No se pudieron cargar los paneles.") });
}

/**
 * RESPALDO: leer la colección panel por panel, como se hacía antes.
 *
 * Solo se usa si el documento agregado todavía no existe -- proyecto
 * recién montado, o antes del primer despliegue del backend con este
 * cambio. Cuesta una lectura por panel en vez de una sola, pero la
 * aplicación funciona igual: el ahorro nunca puede convertirse en una
 * pantalla vacía.
 */
function escucharColeccionDirecta() {
  if (unsubEscucha) unsubEscucha();
  unsubEscucha = onSnapshot(
    collection(db!, "paneles"),
    (snap) => {
      publicarPaneles(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Panel, "id">) }))
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
      );
    },
    alFallarLaEscucha
  );
}

function iniciarEscuchaSiHaceFalta() {
  if (escuchaActiva || !db) return;
  escuchaActiva = true;
  // En TIEMPO REAL a propósito. Se probó con una lectura única para
  // ahorrar conexiones, pero a esta escala no compensa: el inventario
  // son decenas de soportes físicos, no miles, así que la escucha
  // cuesta prácticamente nada -- y a cambio el mapa siempre está
  // correcto.
  //
  // Y el estado de un panel SÍ cambia solo mientras alguien mira:
  // crearContrato lo marca "Ocupado", eliminarContrato lo libera, y la
  // tarea diaria sincronizarEstadoPaneles ajusta estado y libreDesde.
  // Con lectura única, quien tuviera Cobertura abierta no vería nada de
  // eso hasta salir y volver a entrar.
  //
  // Esto empezaría a pesar recién con cientos de paneles o muchos
  // clientes mirando el mapa a la vez; ahí convendría volver a lectura
  // única con caché.
  // SE ESCUCHA UN SOLO DOCUMENTO, NO LA COLECCION ENTERA.
  //
  // Cobertura le muestra a cada cliente TODO el inventario, así que
  // antes cada sesión leía un documento por panel. Con 150 paneles eso
  // era el 60% del coste de una sesión -- y lo pagaba todo el mundo,
  // incluso quien entra a ver una factura y nunca abre el mapa. Y es un
  // gasto absurdo: los paneles son los MISMOS para todos, así que eran
  // miles de sesiones leyendo una y otra vez los mismos documentos.
  //
  // El backend mantiene una copia del inventario en un único documento
  // (ver functions/src/agregadoPaneles.ts), que se refresca cada vez que
  // un panel cambia. Leerlo cuesta 1 lectura en vez de N.
  //
  // Si ese documento todavía no existe -- proyecto recién montado, o
  // antes del primer despliegue con este cambio -- se cae a leer la
  // colección como antes. Más caro, pero la aplicación funciona igual:
  // el ahorro nunca puede convertirse en una pantalla vacía.
  const ordenar = (lista: Panel[]) =>
    [...lista].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  unsubEscucha = onSnapshot(
    doc(db!, "agregados", "paneles"),
    (docSnap) => {
      if (!docSnap.exists()) {
        escucharColeccionDirecta();
        return;
      }
      avisarSiElBarridoDejoDeCorrer(docSnap.data()?.actualizadoEn);
      const crudos = (docSnap.data()?.paneles ?? []) as Panel[];
      const paneles = ordenar(crudos);
      // Si el contenido es EXACTAMENTE el mismo que ya había en caché
      // (nada cambió de verdad, solo se volvió a conectar la escucha),
      // no conviene igual pisar el estado con un array nuevo: aunque
      // los datos sean iguales, la referencia sí cambia (.map/.sort
      // siempre arman un array nuevo), y Cobertura usa este resultado
      // dentro de un useMemo -- un array "nuevo" con el mismo
      // contenido igual dispara ese memo de nuevo, y de ahí el efecto
      // que dibuja los pines en el mapa, que los borra TODOS y los
      // vuelve a crear de cero. Eso es justo el parpadeo que se
      // reportó: entrando la primera vez se ve "Cargando" (no había
      // caché todavía, normal), y de ahí en más, como esta escucha
      // siempre contesta con datos iguales apenas se conecta, los
      // pines se veían parpadear un instante en CADA entrada a
      // Cobertura. Comparando el contenido acá, se evita todo ese
      // trabajo de más cuando en realidad no cambió nada.
      //
      // OJO -- esto se probó primero con un simple
      // JSON.stringify(paneles) !== JSON.stringify(CACHE_PANELES), y
      // el parpadeo SEGUÍA pasando. Investigando en vivo se confirmó
      // la causa real: Firestore NO garantiza que el orden de las
      // llaves dentro de cada documento (.data()) sea el mismo entre
      // una conexión de la escucha y la siguiente, aunque el
      // documento no haya cambiado en nada -- por ejemplo, un panel
      // podía llegar como {..., direccion, createdAt, ...} la primera
      // vez y {..., createdAt, direccion, ...} la segunda. Mismos
      // datos, mismos valores, pero JSON.stringify arma un texto
      // distinto solo por el orden, así que la comparación daba
      // "cambió" cuando en realidad no cambió nada. Por eso acá se
      // ordena las llaves de cada objeto antes de comparar (y de
      // guardar en caché) -- así el texto es estable sin importar en
      // qué orden Firestore entregue los campos.
      publicarPaneles(paneles);
    },
    (err) => {
      // CUALQUIER fallo del agregado cae a leer la colección, no solo el
      // caso de "el documento no existe".
      //
      // Este respaldo estaba incompleto y rompió Cobertura en
      // producción: el hook empezó a leer agregados/paneles, pero las
      // reglas de Firestore publicadas todavía no conocían esa
      // colección, así que la rechazaban. Un rechazo por permisos NO
      // llega como "documento inexistente" -- llega acá, al manejador
      // de error. Y como acá no se caía a la colección, el mapa se
      // quedaba vacío con "No tienes permiso para hacer esto".
      //
      // La lección: el respaldo de una optimización tiene que cubrir
      // que la optimización FALLE, no solo que todavía no esté lista.
      // Ahora, pase lo que pase con el agregado, los paneles se leen.
      console.warn(
        "No se pudo leer el inventario agrupado; se lee la colección directamente. " +
          "Revisa que las reglas de Firestore permitan leer agregados/paneles.",
        err
      );
      escucharColeccionDirecta();
    }
  );
}

function reiniciarEscucha() {
  if (unsubEscucha) unsubEscucha();
  unsubEscucha = null;
  escuchaActiva = false;
  iniciarEscuchaSiHaceFalta();
}

/** Arranca la escucha de paneles de antemano, sin esperar a que alguien
 *  entre a Cobertura/Paneles/Nueva campaña. La llama App.tsx durante el
 *  precalentamiento en segundo plano (junto con la precarga del código
 *  de las pantallas) apenas la app queda ociosa tras iniciar sesión.
 *  Segura de llamar varias veces: si ya hay una escucha corriendo, no
 *  hace nada. */
/**
 * Los paneles que ya están en memoria, si la precarga o alguna pantalla
 * los trajo. Devuelve null si todavía no hay nada.
 *
 * Existe para que otros hooks no vuelvan a pedir a Firestore algo que la
 * aplicación ya tiene cargado. El caso concreto: usePaneles necesitaba
 * los datos de los paneles de las campañas del cliente y los pedía uno
 * por uno, aunque el inventario COMPLETO ya estuviera en memoria desde
 * el arranque.
 */
export function panelesEnMemoria(): Panel[] | null {
  return CACHE_PANELES;
}

export function precargarPaneles() {
  iniciarEscuchaSiHaceFalta();
}

/** Lista TODOS los paneles (no solo los de un contrato/cliente
 *  específico). La usa el admin para elegir un panel al crear un
 *  contrato nuevo directo desde el Player, y también Cobertura -- ahí
 *  la usan TANTO el admin COMO el cliente, para que en el mapa se vea
 *  todo el inventario de paneles (no solo los que el cliente ya tiene
 *  contratados), y así pueda pedir disponibilidad de un panel nuevo o
 *  renovación del que ya tiene. El parámetro ya no es "isAdmin" -- es
 *  solo un flag para no disparar la consulta hasta tener lo necesario
 *  (ej. esperar a saber si es admin/cliente antes de pedir esto).
 *
 *  Ojo: NO se usa orderBy("nombre") en la consulta -- Firestore excluye
 *  en silencio los documentos que no tengan ese campo (paneles viejos
 *  creados desde el sistema Vista360 externo, por ejemplo), y eso hacia
 *  que algunos paneles reales no aparecieran para elegir. Se trae todo
 *  y se ordena del lado del cliente, con nombre vacio como respaldo. */
export function usePanelesDisponibles(habilitado: boolean): PanelesDisponiblesResult {
  const [state, setState] = useState<PanelesDisponiblesState>(
    CACHE_PANELES ? { status: "ready", paneles: CACHE_PANELES } : { status: "loading" }
  );
  const recargar = useCallback(() => reiniciarEscucha(), []);

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!db || !habilitado) { setState({ status: "ready", paneles: [] }); return; }
    // Si la precarga (o una pantalla anterior) ya dejó algo en caché
    // entre el primer render de este componente y este efecto, se
    // refleja ahora -- así no se pierde un dato que ya había llegado.
    if (CACHE_PANELES) setState({ status: "ready", paneles: CACHE_PANELES });
    iniciarEscuchaSiHaceFalta();
    suscriptores.add(setState);
    return () => {
      suscriptores.delete(setState);
    };
  }, [habilitado]);

  return { ...state, recargar };
}
