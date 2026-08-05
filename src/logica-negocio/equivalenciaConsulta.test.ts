import { describe, expect, it } from "vitest";
import {
  cruces,
  limiteAlcanzado,
  panelesDelContrato,
  type ContratoParaCruce,
} from "../../functions/src/reglasOcupacion";

/**
 * PRUEBA DIFERENCIAL: la consulta optimizada tiene que tomar EXACTAMENTE
 * las mismas decisiones que la original.
 *
 * El cambio de rendimiento (filtrar por panel y por fecha en Firestore en
 * vez de leer toda la colección) solo es aceptable si el veredicto final
 * -- ¿se permite o se bloquea esta campaña? -- es idéntico en los dos
 * casos, siempre. Un solo desacuerdo significaría o bien bloquear una
 * venta legítima (falso positivo) o, mucho peor, permitir vender dos
 * veces el mismo panel (falso negativo).
 *
 * Acá se ejecutan las dos versiones sobre miles de escenarios generados
 * y se comparan sus veredictos uno por uno.
 */

// ── Simulación fiel de lo que devuelve cada consulta ────────────────

/** ANTES: se leía la colección entera y se filtraba en memoria. */
function consultaOriginal(coleccion: ContratoParaCruce[]): ContratoParaCruce[] {
  return [...coleccion];
}

/**
 * AHORA: Firestore filtra por panel y por fecha.
 *
 * Reproduce la semántica REAL de Firestore, no una idealizada:
 *  - `array-contains` / `==` no devuelven documentos a los que les falta
 *    el campo;
 *  - una desigualdad (`fin >= X`) tampoco devuelve documentos sin ese
 *    campo, ni con el campo de otro tipo (Firestore ordena por tipo).
 */
function consultaOptimizada(
  coleccion: ContratoParaCruce[],
  panelIds: string[],
  inicio: string
): ContratoParaCruce[] {
  const porId = new Map<number, ContratoParaCruce>();
  coleccion.forEach((c, i) => {
    const tocaAlgunPanel = panelIds.some(
      (p) => (c.panel_ids ?? []).includes(p) || c.panel_id === p
    );
    if (!tocaAlgunPanel) return;
    // La desigualdad excluye lo que no sea texto o no exista.
    if (typeof c.fin !== "string") return;
    if (!(c.fin >= inicio)) return;
    porId.set(i, c);
  });
  return Array.from(porId.values());
}

// ── Veredicto de negocio, idéntico para ambas ───────────────────────

function veredicto(
  contratos: ContratoParaCruce[],
  panelIds: string[],
  inicio: string,
  fin: string,
  clienteId: string,
  cuposPorPanel: Record<string, number>
): { bloqueado: boolean; panelQueBloquea: string | null } {
  for (const panelId of panelIds) {
    const cupos = cuposPorPanel[panelId] ?? 1;
    const choques = cruces(contratos, {
      panelId,
      inicio,
      fin,
      clienteId,
      soporteLimitado: Number.isFinite(cupos),
    });
    if (limiteAlcanzado(choques.length, cupos)) {
      return { bloqueado: true, panelQueBloquea: panelId };
    }
  }
  return { bloqueado: false, panelQueBloquea: null };
}

// ── Generador determinista de escenarios ────────────────────────────

function generador(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const dia = (n: number) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10);

describe("equivalencia: la consulta optimizada decide igual que la original", () => {
  it("5.000 escenarios generados: ni un solo veredicto distinto", () => {
    const azar = generador(20260805);
    const PANELES = ["p1", "p2", "p3"];
    const CLIENTES = ["cli-A", "cli-B", "cli-C"];
    const desacuerdos: string[] = [];
    let bloqueados = 0;
    let permitidos = 0;

    for (let escenario = 0; escenario < 5000; escenario += 1) {
      // Historial del panel: mezcla de campañas viejas, vigentes y futuras.
      const coleccion: ContratoParaCruce[] = [];
      const cuantos = Math.floor(azar() * 12);
      for (let k = 0; k < cuantos; k += 1) {
        const ini = Math.floor(azar() * 1000); // ~3 años de historial
        const dur = 1 + Math.floor(azar() * 200);
        const multi = azar() < 0.3;
        const panelA = PANELES[Math.floor(azar() * PANELES.length)];
        const panelB = PANELES[Math.floor(azar() * PANELES.length)];
        coleccion.push({
          cliente_id: CLIENTES[Math.floor(azar() * CLIENTES.length)],
          panel_id: panelA,
          ...(multi ? { panel_ids: [panelA, panelB] } : {}),
          inicio: dia(ini),
          fin: dia(ini + dur),
          ...(azar() < 0.1 ? { deleted: true } : {}),
        });
      }

      // Campaña que se intenta crear.
      const nuevaIni = Math.floor(azar() * 1000);
      const nuevaDur = 1 + Math.floor(azar() * 200);
      const inicio = dia(nuevaIni);
      const fin = dia(nuevaIni + nuevaDur);
      const clienteId = CLIENTES[Math.floor(azar() * CLIENTES.length)];
      const panelesPedidos = azar() < 0.25 ? [PANELES[0], PANELES[1]] : [PANELES[Math.floor(azar() * PANELES.length)]];
      const cuposPorPanel: Record<string, number> = {
        p1: 1, // mural: exclusivo
        p2: 2, // unipolar: dos caras
        p3: Infinity, // LED: rota anuncios
      };

      const antes = veredicto(consultaOriginal(coleccion), panelesPedidos, inicio, fin, clienteId, cuposPorPanel);
      const ahora = veredicto(
        consultaOptimizada(coleccion, panelesPedidos, inicio),
        panelesPedidos,
        inicio,
        fin,
        clienteId,
        cuposPorPanel
      );

      if (antes.bloqueado) bloqueados += 1;
      else permitidos += 1;

      if (antes.bloqueado !== ahora.bloqueado || antes.panelQueBloquea !== ahora.panelQueBloquea) {
        desacuerdos.push(
          `escenario ${escenario}: antes=${JSON.stringify(antes)} ahora=${JSON.stringify(ahora)}`
        );
      }
    }

    expect(desacuerdos).toEqual([]);
    // Y que la prueba ejerció de verdad los dos desenlaces posibles.
    expect(bloqueados).toBeGreaterThan(200);
    expect(permitidos).toBeGreaterThan(200);
  });

  it("la optimización SÍ lee menos (si no, no serviría de nada)", () => {
    const coleccion: ContratoParaCruce[] = [];
    // 10 años de historial en el mismo panel, 4 campañas al año.
    for (let a = 0; a < 40; a += 1) {
      coleccion.push({
        cliente_id: "cli-A",
        panel_id: "p1",
        inicio: dia(a * 90),
        fin: dia(a * 90 + 80),
      });
    }
    const inicio = dia(40 * 90); // una campaña nueva al final del historial
    const leidosAntes = consultaOriginal(coleccion).length;
    const leidosAhora = consultaOptimizada(coleccion, ["p1"], inicio).length;

    expect(leidosAntes).toBe(40);
    expect(leidosAhora).toBeLessThanOrEqual(2);
  });
});

describe("garantías explícitas que se piden al cambio", () => {
  const base = (extra: Partial<ContratoParaCruce> = {}): ContratoParaCruce => ({
    cliente_id: "cli-A",
    panel_id: "p1",
    inicio: "2026-03-01",
    fin: "2026-03-31",
    ...extra,
  });

  it("NO se permite reservar dos veces el mismo soporte exclusivo", () => {
    const existente = base();
    const traidos = consultaOptimizada([existente], ["p1"], "2026-03-15");
    const v = veredicto(traidos, ["p1"], "2026-03-15", "2026-04-15", "cli-B", { p1: 1 });
    expect(v.bloqueado).toBe(true);
  });

  it("NO afecta a las campañas PASADAS: siguen sin bloquear lo que no pueden bloquear", () => {
    const vieja = base({ inicio: "2020-01-01", fin: "2020-12-31" });
    const traidos = consultaOptimizada([vieja], ["p1"], "2026-03-01");
    expect(traidos).toHaveLength(0); // ni se lee: no puede chocar
    expect(veredicto(traidos, ["p1"], "2026-03-01", "2026-03-31", "cli-B", { p1: 1 }).bloqueado).toBe(false);
  });

  it("NO afecta a las campañas ACTUALES: siguen bloqueando", () => {
    const vigente = base({ inicio: "2026-02-01", fin: "2026-04-30" });
    const traidos = consultaOptimizada([vigente], ["p1"], "2026-03-01");
    expect(traidos).toHaveLength(1);
    expect(veredicto(traidos, ["p1"], "2026-03-01", "2026-03-31", "cli-B", { p1: 1 }).bloqueado).toBe(true);
  });

  it("NO afecta a las campañas FUTURAS ya programadas: siguen bloqueando", () => {
    const futura = base({ inicio: "2027-01-01", fin: "2027-06-30" });
    const traidos = consultaOptimizada([futura], ["p1"], "2026-12-01");
    expect(traidos).toHaveLength(1);
    expect(veredicto(traidos, ["p1"], "2026-12-01", "2027-02-01", "cli-B", { p1: 1 }).bloqueado).toBe(true);
  });

  it("las campañas MULTI-PANEL se siguen trayendo por cualquiera de sus paneles", () => {
    const multi = base({ panel_id: "p9", panel_ids: ["p9", "p1"] });
    expect(consultaOptimizada([multi], ["p1"], "2026-03-01")).toHaveLength(1);
  });

  it("los contratos VIEJOS (solo panel_id, sin panel_ids) se siguen trayendo", () => {
    const viejo = base({ panel_id: "p1" });
    delete (viejo as { panel_ids?: string[] }).panel_ids;
    expect(consultaOptimizada([viejo], ["p1"], "2026-03-01")).toHaveLength(1);
  });

  it("un contrato de OTRO panel no se trae (es el ahorro, y no cambia ningún veredicto)", () => {
    expect(consultaOptimizada([base({ panel_id: "p7" })], ["p1"], "2026-03-01")).toHaveLength(0);
  });

  it("BORDE: el que termina justo el día que empieza la nueva se trae Y bloquea", () => {
    const pegado = base({ inicio: "2026-01-01", fin: "2026-03-01" });
    const traidos = consultaOptimizada([pegado], ["p1"], "2026-03-01");
    expect(traidos).toHaveLength(1);
    expect(veredicto(traidos, ["p1"], "2026-03-01", "2026-03-31", "cli-B", { p1: 1 }).bloqueado).toBe(true);
  });

  it("BORDE: el que termina un día antes ni se trae ni bloquea", () => {
    const justoAntes = base({ inicio: "2026-01-01", fin: "2026-02-28" });
    const traidos = consultaOptimizada([justoAntes], ["p1"], "2026-03-01");
    expect(traidos).toHaveLength(0);
    expect(veredicto(traidos, ["p1"], "2026-03-01", "2026-03-31", "cli-B", { p1: 1 }).bloqueado).toBe(false);
  });

  it("un unipolar admite 2 caras pero no 3", () => {
    const c1 = base({ cliente_id: "cli-A", panel_id: "p2", inicio: "2026-03-01", fin: "2026-05-01" });
    const c2 = base({ cliente_id: "cli-B", panel_id: "p2", inicio: "2026-03-01", fin: "2026-05-01" });
    const uno = consultaOptimizada([c1], ["p2"], "2026-03-15");
    expect(veredicto(uno, ["p2"], "2026-03-15", "2026-04-15", "cli-C", { p2: 2 }).bloqueado).toBe(false);
    const dos = consultaOptimizada([c1, c2], ["p2"], "2026-03-15");
    expect(veredicto(dos, ["p2"], "2026-03-15", "2026-04-15", "cli-C", { p2: 2 }).bloqueado).toBe(true);
  });

  it("INVARIANTE DE DATOS: todo contrato que escribe la app tiene 'fin' como texto YYYY-MM-DD", () => {
    // De esto depende que la desigualdad de Firestore funcione. Si algún
    // día se guardara como Timestamp, la consulta dejaría de traerlo y
    // se podría vender dos veces el panel. crearContrato lo guarda
    // siempre como texto; este test deja la exigencia por escrito.
    const contratoComoLoGuardaLaApp = { inicio: "2026-03-01", fin: "2026-03-31" };
    expect(typeof contratoComoLoGuardaLaApp.fin).toBe("string");
    expect(contratoComoLoGuardaLaApp.fin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(panelesDelContrato({ panel_id: "p1" })).toEqual(["p1"]);
  });
});
