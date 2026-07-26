import type { Contrato } from "../types";

export interface MetricasCliente {
  clienteId: string;
  montoTotal: number;
  meses: number;
  numCampanas: number;
}

function metricasPorCliente(clienteId: string, contratos: Contrato[]): MetricasCliente {
  // useContratosAdmin ya filtra los "deleted", así que acá no hace
  // falta repetir ese filtro -- solo agrupar por cliente.
  const propios = contratos.filter((c) => c.cliente_id === clienteId);
  const montoTotal = propios.reduce((suma, c) => suma + (Number(c.monto) || 0), 0);

  const fechas = propios.map((c) => c.inicio).filter((f): f is string => Boolean(f));
  let meses = 0;
  if (fechas.length > 0) {
    const primera = fechas.reduce((min, f) => (f < min ? f : min));
    const inicio = new Date(`${primera}T00:00:00`);
    const hoy = new Date();
    meses = Math.max(0, (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth()));
  }

  return { clienteId, montoTotal, meses, numCampanas: propios.length };
}

/**
 * Ranking combinado de clientes -- SOLO para el admin (el cliente
 * jamás ve esto; lo que ve el cliente sigue siendo su insignia por
 * antigüedad, ver clienteNivel.ts). Pedido explícito: "el ranking para
 * mis clientes tiene que ser por el monto gastado, la antigüedad y
 * campañas".
 *
 * Como las tres métricas tienen escalas muy distintas (soles gastados
 * puede ser miles, meses es 0-24, campañas es un puñado), sumarlas
 * directo haría que el monto gastado pese mucho más que las otras dos
 * solo por tener números más grandes. En vez de inventar pesos
 * arbitrios, se usa "conteo Borda": a cada cliente se le da un puesto
 * (1º, 2º, 3º...) en CADA métrica por separado, y el ranking final es
 * la suma de esos tres puestos (menor suma = mejor puesto general).
 * Así los tres factores pesan igual sin importar su escala.
 */
export function rankingClientes(clienteIds: string[], contratos: Contrato[]): Map<string, number> {
  const metricas = clienteIds.map((id) => metricasPorCliente(id, contratos));

  function puestosPorValor(valores: number[]): number[] {
    const orden = [...valores.keys()].sort((a, b) => valores[b] - valores[a]);
    const puestos = new Array(valores.length).fill(0);
    orden.forEach((idxOriginal, posicion) => { puestos[idxOriginal] = posicion + 1; });
    return puestos;
  }

  const puestoMonto = puestosPorValor(metricas.map((m) => m.montoTotal));
  const puestoMeses = puestosPorValor(metricas.map((m) => m.meses));
  const puestoCampanas = puestosPorValor(metricas.map((m) => m.numCampanas));

  const combinados = metricas.map((_, i) => puestoMonto[i] + puestoMeses[i] + puestoCampanas[i]);
  const ordenFinal = [...combinados.keys()].sort((a, b) => combinados[a] - combinados[b]);

  const resultado = new Map<string, number>();
  ordenFinal.forEach((idxOriginal, posicion) => resultado.set(metricas[idxOriginal].clienteId, posicion + 1));
  return resultado;
}
