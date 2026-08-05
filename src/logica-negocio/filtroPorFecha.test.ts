import { describe, expect, it } from "vitest";
import { seCruzan } from "../../functions/src/reglasOcupacion";

/**
 * PRUEBA DE SEGURIDAD DEL FILTRO.
 *
 * Las consultas de crearContrato/actualizarContrato piden a Firestore
 * solo los contratos con `fin >= inicioNuevo`, para no traer historial
 * que no puede chocar. Esa optimización es correcta SOLO si se cumple:
 *
 *    si dos campañas se cruzan  =>  la vieja termina en/después del
 *                                   inicio de la nueva
 *
 * Si esa implicación fallara aunque fuera en un caso, el filtro
 * escondería un cruce real y se podría vender dos veces el mismo panel
 * -- sin ningún error visible, hasta que dos clientes reclamaran la
 * misma lona. Por eso se prueba de forma exhaustiva y no con ejemplos
 * sueltos.
 */

/** El filtro que se le manda a Firestore. */
const pasaElFiltro = (finExistente: string, inicioNuevo: string) => finExistente >= inicioNuevo;

function fecha(dia: number): string {
  // Base 2026-01-01, en días. Sirve para generar combinaciones reales
  // cruzando meses y años sin escribirlas a mano.
  return new Date(Date.UTC(2026, 0, 1 + dia)).toISOString().slice(0, 10);
}

describe("el filtro fin >= inicio no puede esconder ningún cruce", () => {
  it("EXHAUSTIVO: ningún par de rangos que se cruza queda fuera del filtro", () => {
    const perdidos: string[] = [];
    let cruces = 0;
    let descartados = 0;

    // Todas las combinaciones de dos campañas dentro de una ventana de
    // 40 días: ~672.000 pares, cubriendo solapes parciales, contenidos,
    // idénticos, adyacentes y separados.
    for (let ai = 0; ai < 40; ai += 1) {
      for (let af = ai; af < 40; af += 1) {
        for (let bi = 0; bi < 40; bi += 1) {
          for (let bf = bi; bf < 40; bf += 1) {
            const nuevaInicio = fecha(ai);
            const nuevaFin = fecha(af);
            const existenteInicio = fecha(bi);
            const existenteFin = fecha(bf);

            const seCruzanDeVerdad = seCruzan(nuevaInicio, nuevaFin, existenteInicio, existenteFin);
            const loTraeLaConsulta = pasaElFiltro(existenteFin, nuevaInicio);

            if (seCruzanDeVerdad) {
              cruces += 1;
              // LA propiedad crítica: si se cruzan, la consulta TIENE
              // que haberlo traído.
              if (!loTraeLaConsulta) {
                perdidos.push(`${existenteInicio}..${existenteFin} vs ${nuevaInicio}..${nuevaFin}`);
              }
            } else if (!loTraeLaConsulta) {
              descartados += 1;
            }
          }
        }
      }
    }

    expect(perdidos).toEqual([]);
    // Y que la prueba de verdad ejerció los dos lados.
    expect(cruces).toBeGreaterThan(10000);
    expect(descartados).toBeGreaterThan(10000);
  });

  it("un contrato que terminó ANTES del inicio nuevo se descarta (es el ahorro buscado)", () => {
    expect(pasaElFiltro("2025-12-31", "2026-01-01")).toBe(false);
    expect(seCruzan("2026-01-01", "2026-06-30", "2025-01-01", "2025-12-31")).toBe(false);
  });

  it("BORDE: uno que termina EXACTAMENTE el día que empieza la nueva SÍ se trae", () => {
    // Este es el caso que un `>` en vez de `>=` rompería: son campañas
    // que comparten un día real de exhibición.
    expect(pasaElFiltro("2026-01-01", "2026-01-01")).toBe(true);
    expect(seCruzan("2026-01-01", "2026-06-30", "2025-06-01", "2026-01-01")).toBe(true);
  });

  it("las campañas futuras ya programadas se siguen trayendo", () => {
    // El filtro es por fin, no por 'activa hoy': una campaña de
    // diciembre tiene que chocar con una que abarque diciembre.
    expect(pasaElFiltro("2026-12-31", "2026-11-01")).toBe(true);
  });

  it("el orden lexicográfico de las fechas ISO equivale al orden real", () => {
    // De esto depende que la comparación de Firestore (texto) sea
    // correcta. Si el formato dejara de ser YYYY-MM-DD, se rompería.
    const fechas = ["2026-12-31", "2026-01-05", "2027-01-01", "2026-01-15"];
    expect([...fechas].sort()).toEqual(["2026-01-05", "2026-01-15", "2026-12-31", "2027-01-01"]);
  });
});
