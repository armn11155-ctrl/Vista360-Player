import { describe, expect, it } from "vitest";
import {
  contratoVigentePorPanel,
  escapeHtml,
  popupHtml,
  esPanelActivoCliente,
  esPanelContratable,
  esPanelDisponibleAhora,
  estadoPinPanel,
  estadoTexto,
  type PanelConUso,
} from "./Cobertura";
import type { Contrato, Panel } from "../../types";
import { hoyEnPeru, sumarDias } from "../../utils/fechas";

/**
 * Esta es la lógica que MÁS bugs reales ha producido en la app, todos
 * reportados por el usuario usándola, ninguno detectado por el código:
 *
 *  1. El pin salía BLANCO (disponible) en un panel que otro cliente
 *     tenía ocupado, porque un contrato propio ya finalizado se trataba
 *     como "entonces está libre" sin mirar el estado real del panel.
 *  2. El pin salía como "de otro cliente" en un panel recién contratado
 *     por uno mismo, porque al haber un contrato viejo Y uno nuevo en el
 *     mismo panel ganaba el viejo.
 *  3. El popup mostraba "Finalizó [fecha vieja]" de una campaña que ya
 *     no tenía nada que ver con la situación actual del panel.
 *
 * Cada uno de esos casos tiene su test acá abajo para que no puedan
 * volver sin que falle la suite.
 */

const HOY = hoyEnPeru();
const AYER = sumarDias(HOY, -1);
const MANANA = sumarDias(HOY, 1);

function panel(extra: Partial<PanelConUso> = {}): PanelConUso {
  return {
    id: "panel-1",
    nombre: "Mural Javier Prado",
    ciudad: "Lima",
    tipo: "Mural",
    estado: "Disponible",
    ...extra,
  } as PanelConUso;
}

function contrato(extra: Partial<Contrato> = {}): Contrato {
  return {
    id: "c1",
    panel_id: "panel-1",
    cliente_id: "cli-1",
    inicio: sumarDias(HOY, -10),
    fin: MANANA,
    monto: 0,
    pagado: false,
    ...extra,
  } as Contrato;
}

// ─────────────────────────────────────────────────────────────
describe("estadoPinPanel — de qué color sale cada pin", () => {
  it("negro/propio ('mio') cuando el cliente tiene una campaña vigente acá", () => {
    expect(estadoPinPanel(panel({ estado: "Ocupado", contrato: contrato() }))).toBe("mio");
  });

  it("'mio' también si su campaña todavía no empezó (Programada)", () => {
    const programada = contrato({ inicio: MANANA, fin: sumarDias(HOY, 30) });
    expect(estadoPinPanel(panel({ estado: "Ocupado", contrato: programada }))).toBe("mio");
  });

  it("'disponible' cuando el panel está libre y no es de nadie", () => {
    expect(estadoPinPanel(panel({ estado: "Disponible" }))).toBe("disponible");
  });

  it("'ocupado' cuando lo tiene OTRO cliente (sin contrato propio)", () => {
    expect(estadoPinPanel(panel({ estado: "Ocupado" }))).toBe("ocupado");
  });

  it("'ocupado' si está en Mantenimiento (no se puede contratar hoy)", () => {
    expect(estadoPinPanel(panel({ estado: "Mantenimiento" }))).toBe("ocupado");
  });

  // ── BUG REAL 1 ──────────────────────────────────────────────
  it("BUG 1: una campaña PROPIA ya finalizada NO hace que un panel ocupado se vea disponible", () => {
    const finalizada = contrato({ inicio: sumarDias(HOY, -60), fin: AYER });
    // El panel lo tiene otro cliente AHORA (estado Ocupado). Antes esto
    // devolvía "disponible" (pin blanco) solo porque existía un contrato
    // propio viejo, sin mirar nunca el estado real del panel.
    expect(estadoPinPanel(panel({ estado: "Ocupado", contrato: finalizada }))).toBe("ocupado");
    expect(esPanelDisponibleAhora(panel({ estado: "Ocupado", contrato: finalizada }))).toBe(false);
  });

  it("BUG 1 (contraparte): si el panel SÍ está libre, una campaña propia finalizada lo deja disponible", () => {
    const finalizada = contrato({ inicio: sumarDias(HOY, -60), fin: AYER });
    expect(estadoPinPanel(panel({ estado: "Disponible", contrato: finalizada }))).toBe("disponible");
  });

  it("un panel ocupado con fecha de liberación conocida NO se pinta como disponible", () => {
    // libreDesde solo se guarda cuando el panel está lleno AHORA, así que
    // su sola presencia significa ocupado. Pintarlo blanco fue otro bug real.
    const p = panel({ estado: "Ocupado", libreDesde: sumarDias(HOY, 20) } as Partial<PanelConUso>);
    expect(estadoPinPanel(p)).toBe("ocupado");
    // ...pero sí se puede pedir por adelantado (para eso existe libreDesde).
    expect(esPanelContratable(p)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe("contratoVigentePorPanel — cuál de mis contratos manda en cada panel", () => {
  // ── BUG REAL 2 ──────────────────────────────────────────────
  it("BUG 2: con una campaña vieja finalizada Y una nueva vigente en el mismo panel, gana la NUEVA", () => {
    const vieja = contrato({ id: "vieja", inicio: sumarDias(HOY, -90), fin: AYER });
    const nueva = contrato({ id: "nueva", inicio: HOY, fin: sumarDias(HOY, 300) });
    // useContratos() los entrega ordenados por inicio DESCENDENTE: el
    // nuevo primero. Ese orden era justo el que disparaba el bug.
    const mapa = contratoVigentePorPanel([nueva, vieja]);
    expect(mapa.get("panel-1")?.id).toBe("nueva");
    // Y el pin, en consecuencia, tiene que salir como propio.
    expect(estadoPinPanel(panel({ estado: "Ocupado", contrato: mapa.get("panel-1") }))).toBe("mio");
  });

  it("gana la nueva sin importar el orden en que lleguen", () => {
    const vieja = contrato({ id: "vieja", inicio: sumarDias(HOY, -90), fin: AYER });
    const nueva = contrato({ id: "nueva", inicio: HOY, fin: sumarDias(HOY, 300) });
    expect(contratoVigentePorPanel([vieja, nueva]).get("panel-1")?.id).toBe("nueva");
    expect(contratoVigentePorPanel([nueva, vieja]).get("panel-1")?.id).toBe("nueva");
  });

  it("entre dos finalizadas gana la que terminó más tarde", () => {
    const antigua = contrato({ id: "antigua", inicio: sumarDias(HOY, -200), fin: sumarDias(HOY, -100) });
    const reciente = contrato({ id: "reciente", inicio: sumarDias(HOY, -90), fin: AYER });
    expect(contratoVigentePorPanel([antigua, reciente]).get("panel-1")?.id).toBe("reciente");
  });

  it("una campaña multi-panel ocupa TODOS sus paneles, no solo el primero", () => {
    const multi = contrato({ id: "multi", panel_id: "p1", panel_ids: ["p1", "p2", "p3"] });
    const mapa = contratoVigentePorPanel([multi]);
    expect(mapa.get("p1")?.id).toBe("multi");
    expect(mapa.get("p2")?.id).toBe("multi");
    expect(mapa.get("p3")?.id).toBe("multi");
  });

  it("sin contratos, ningún panel queda asignado", () => {
    expect(contratoVigentePorPanel([]).size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("estadoTexto — la etiqueta que se muestra", () => {
  it("'Activo' con campaña propia vigente", () => {
    expect(estadoTexto(panel({ contrato: contrato() }))).toBe("Activo");
  });

  it("'Programado' con campaña propia que aún no empieza", () => {
    expect(estadoTexto(panel({ contrato: contrato({ inicio: MANANA, fin: sumarDias(HOY, 30) }) }))).toBe("Programado");
  });

  // ── BUG REAL 3 ──────────────────────────────────────────────
  it("BUG 3: una campaña propia finalizada NO deja la etiqueta en 'Finalizado' tapando el estado real", () => {
    const finalizada = contrato({ inicio: sumarDias(HOY, -60), fin: AYER });
    // Lo tiene otro cliente ahora -> tiene que decir Ocupado, no Finalizado.
    expect(estadoTexto(panel({ estado: "Ocupado", contrato: finalizada }))).toBe("Ocupado");
    // Y si quedó libre, Disponible.
    expect(estadoTexto(panel({ estado: "Disponible", contrato: finalizada }))).toBe("Disponible");
  });

  it("refleja Mantenimiento cuando el panel está en mantenimiento", () => {
    expect(estadoTexto(panel({ estado: "Mantenimiento" }))).toBe("Mantenimiento");
  });

  it("un panel sin estado guardado se trata como Disponible (no se queda en blanco)", () => {
    expect(estadoTexto(panel({ estado: undefined as unknown as Panel["estado"] }))).toBe("Disponible");
  });
});

// ─────────────────────────────────────────────────────────────
describe("coherencia entre las tres funciones (que no se contradigan entre sí)", () => {
  const casos: Array<{ nombre: string; p: PanelConUso }> = [
    { nombre: "libre y de nadie", p: panel({ estado: "Disponible" }) },
    { nombre: "ocupado por otro", p: panel({ estado: "Ocupado" }) },
    { nombre: "en mantenimiento", p: panel({ estado: "Mantenimiento" }) },
    { nombre: "propio vigente", p: panel({ estado: "Ocupado", contrato: contrato() }) },
    { nombre: "propio finalizado + ocupado por otro", p: panel({ estado: "Ocupado", contrato: contrato({ inicio: sumarDias(HOY, -60), fin: AYER }) }) },
    { nombre: "sin estado guardado", p: panel({ estado: undefined as unknown as Panel["estado"] }) },
  ];

  it.each(casos)("«$nombre»: si el pin dice 'mio', es porque hay campaña propia vigente", ({ p }) => {
    if (estadoPinPanel(p) === "mio") expect(esPanelActivoCliente(p)).toBe(true);
  });

  it.each(casos)("«$nombre»: un panel propio nunca se ofrece como contratable", ({ p }) => {
    if (esPanelActivoCliente(p)) expect(esPanelContratable(p)).toBe(false);
  });

  it.each(casos)("«$nombre»: si el pin dice 'disponible', la etiqueta nunca dice Ocupado", ({ p }) => {
    if (estadoPinPanel(p) === "disponible") expect(estadoTexto(p)).not.toBe("Ocupado");
  });

  it.each(casos)("«$nombre»: si la etiqueta dice Ocupado, el pin nunca sale 'disponible'", ({ p }) => {
    if (estadoTexto(p) === "Ocupado") expect(estadoPinPanel(p)).not.toBe("disponible");
  });
});

// ─────────────────────────────────────────────────────────────
describe("seguridad: el popup del mapa no puede ser usado para inyectar HTML", () => {
  /**
   * Leaflet arma sus popups con strings de HTML crudo, no con JSX, así
   * que acá React NO protege sola como en el resto de la app: si un
   * valor llegara sin escapar, cualquiera que pueda escribir el nombre
   * o la dirección de un panel podría inyectar código que se ejecuta en
   * el navegador de TODOS los clientes que abran Cobertura.
   *
   * Las comprobaciones se hacen sobre el HTML YA INTERPRETADO por el
   * navegador, no buscando texto: un texto escapado sigue conteniendo
   * la palabra "onerror" de forma totalmente inofensiva, así que buscar
   * esa palabra daría falsas alarmas. Lo que importa de verdad es si el
   * navegador llegó a CREAR un elemento o un atributo ejecutable.
   */
  const CARGA = '<img src=x onerror="alert(1)">';

  function interpretar(html: string): HTMLElement {
    const cont = document.createElement("div");
    cont.innerHTML = html;
    return cont;
  }

  function tieneAlgoEjecutable(cont: HTMLElement): boolean {
    if (cont.querySelector("script, iframe, object, embed")) return true;
    // Cualquier atributo tipo onerror/onclick/onmouseover inyectado.
    return Array.from(cont.querySelectorAll("*")).some((el) =>
      Array.from(el.attributes).some((a) => a.name.toLowerCase().startsWith("on"))
    );
  }

  it("escapeHtml neutraliza los 5 caracteres peligrosos", () => {
    expect(escapeHtml('<>&"\'')).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("un popup normal no contiene nada ejecutable (línea base)", () => {
    expect(tieneAlgoEjecutable(interpretar(popupHtml(panel(), true)))).toBe(false);
  });

  const camposDeTexto: Array<{ campo: string; p: () => PanelConUso }> = [
    { campo: "nombre", p: () => panel({ nombre: CARGA }) },
    { campo: "dirección", p: () => panel({ direccion: CARGA }) },
    { campo: "ciudad", p: () => panel({ direccion: "", ciudad: CARGA }) },
    { campo: "tipo de soporte", p: () => panel({ tipo: CARGA as never }) },
    { campo: "id del panel", p: () => panel({ id: '" onmouseover="alert(1)' }) },
  ];

  it.each(camposDeTexto)("inyectar por «$campo» no crea nada ejecutable", ({ p }) => {
    expect(tieneAlgoEjecutable(interpretar(popupHtml(p(), true)))).toBe(false);
  });

  it.each(camposDeTexto)("inyectar por «$campo» no crea etiquetas nuevas", ({ p }) => {
    const limpio = interpretar(popupHtml(panel(), true)).querySelectorAll("*").length;
    const atacado = interpretar(popupHtml(p(), true)).querySelectorAll("*").length;
    // Si el escape fallara, la carga agregaría al menos un <img> extra.
    expect(atacado).toBeLessThanOrEqual(limpio);
  });

  it("el intento de inyección se muestra como TEXTO, no se ejecuta", () => {
    const cont = interpretar(popupHtml(panel({ nombre: CARGA }), true));
    expect(cont.textContent).toContain(CARGA);
  });

  it("sigue mostrando el contenido legítimo (el escape no rompe lo normal)", () => {
    const cont = interpretar(popupHtml(panel({ nombre: "Mural Javier Prado" }), true));
    expect(cont.textContent).toContain("Mural Javier Prado");
  });
});
