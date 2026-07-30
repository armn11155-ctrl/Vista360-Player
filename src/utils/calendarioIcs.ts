/**
 * Genera y descarga un archivo .ics (formato estándar de calendario,
 * compatible con Google Calendar, Apple Calendar, Outlook) con un
 * recordatorio para una fecha puntual -- útil para el vencimiento de
 * una campaña, sin depender de ningún servidor: todo se arma acá
 * mismo, en el navegador.
 */

/** "YYYY-MM-DD" -> "YYYYMMDD", el formato de fecha que pide ICS para
 *  un evento de "todo el día" (sin hora). */
function fechaIcs(fecha: string): string {
  return fecha.replace(/-/g, "");
}

/** Escapa los caracteres que ICS trata especial dentro de un texto
 *  (coma, punto y coma, salto de línea) -- sin esto, una coma en el
 *  nombre de la campaña podría cortar el campo a la mitad. */
function escaparTexto(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export interface RecordatorioCalendario {
  /** "YYYY-MM-DD" -- el día del evento (todo el día, sin hora). */
  fecha: string;
  titulo: string;
  descripcion?: string;
  /** Nombre del archivo a descargar, sin extensión. */
  nombreArchivo: string;
}

export function descargarRecordatorioCalendario(datos: RecordatorioCalendario): void {
  const fecha = fechaIcs(datos.fecha);
  // DTEND al día siguiente -- así lo piden los eventos "todo el día"
  // en ICS (el rango es [DTSTART, DTEND), exclusivo al final).
  const siguiente = new Date(`${datos.fecha}T00:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const fechaFin = fechaIcs(siguiente.toISOString().slice(0, 10));
  const ahora = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `vista360-${datos.fecha}-${Math.random().toString(36).slice(2)}@vista360player`;

  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vista360 Player//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${ahora}`,
    `DTSTART;VALUE=DATE:${fecha}`,
    `DTEND;VALUE=DATE:${fechaFin}`,
    `SUMMARY:${escaparTexto(datos.titulo)}`,
    ...(datos.descripcion ? [`DESCRIPTION:${escaparTexto(datos.descripcion)}`] : []),
    // Recordatorio 3 días antes, además del evento en sí -- así hay
    // tiempo de coordinar la renovación antes de que la campaña
    // termine, no solo el aviso el mismo día.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparTexto(datos.titulo)}`,
    "TRIGGER:-P3D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // ICS pide saltos de línea CRLF explícitos.
  const contenido = lineas.join("\r\n");

  const blob = new Blob([contenido], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${datos.nombreArchivo}.ics`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
