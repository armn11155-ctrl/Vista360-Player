import type { InformeCliente } from "../types";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "2026-07" -> "Julio 2026" -- encabezado de cada grupo de reportes. */
export function etiquetaMes(mes: string): string {
  const [anio, mesNum] = mes.split("-");
  const nombre = NOMBRES_MES[Number(mesNum) - 1];
  return nombre ? `${nombre} ${anio}` : mes;
}

/** Agrupa los reportes (ya vienen ordenados del más nuevo al más
 *  viejo, ver listarReportesCliente.ts) por mes -- ahora que puede
 *  haber un reporte por día, la lista se hacía larga y todos los días
 *  quedaban mezclados sin separación. Como se conserva el orden
 *  original, los grupos también salen ordenados de más reciente a más
 *  viejo, sin necesidad de volver a ordenar nada acá. Se usa tanto en
 *  Reportes.tsx (todos los reportes del cliente) como en
 *  DetalleCampana.tsx (los de una sola campaña). */
export function agruparPorMes(informes: InformeCliente[]): { mes: string; items: InformeCliente[] }[] {
  const grupos: { mes: string; items: InformeCliente[] }[] = [];
  for (const informe of informes) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.mes === informe.mes) {
      ultimo.items.push(informe);
    } else {
      grupos.push({ mes: informe.mes, items: [informe] });
    }
  }
  return grupos;
}
