import { setGlobalOptions } from "firebase-functions/v2/options";

/**
 * TOPE DE INSTANCIAS PARA TODAS LAS FUNCIONES.
 *
 * POR QUE. Las Cloud Functions escalan solas y sin limite. Eso esta muy
 * bien hasta que algo va mal, y entonces es una factura abierta:
 *
 *  - Un cliente AUTENTICADO llamando en bucle desde la consola del
 *    navegador. No hace falta romper nada: basta con repetir una llamada
 *    legitima. firmarUrlsR2, por ejemplo, hace una consulta a Firestore
 *    por cada factura pedida.
 *  - Un fallo nuestro: un useEffect en bucle que llame a una funcion, o
 *    un reintento sin freno.
 *  - Un bot que encuentre el endpoint HTTPS del barrido.
 *
 * En cualquiera de los tres casos, sin tope el gasto crece tan rapido
 * como aguante Google. Con tope, el peor escenario esta ACOTADO: 20
 * instancias a la vez, no dos mil. Las llamadas de mas esperan o fallan,
 * pero la factura no se dispara y la aplicacion sigue en pie para todos
 * los demas.
 *
 * POR QUE 20 Y NO MENOS. Cada instancia atiende varias peticiones a la
 * vez, asi que 20 dan de sobra para cientos de personas usando la
 * aplicacion al mismo tiempo. Si algun dia se queda corto, el sintoma es
 * lentitud --no errores-- y se sube el numero. Es mucho mejor equivocarse
 * por este lado que por el de la factura.
 *
 * NO SUSTITUYE a las comprobaciones de permisos de cada funcion: es la
 * capa de abajo, la que limita el dano cuando algo se escapa.
 */
setGlobalOptions({ maxInstances: 20 });

export { crearSubidaR2 } from "./crearSubidaR2.js";
export { actualizarAvatarPropio } from "./actualizarAvatarPropio.js";
export { actualizarNombrePropio } from "./actualizarNombrePropio.js";
export { administrarClienteAdmin } from "./administrarClienteAdmin.js";
export { subirAvatarServidor } from "./subirAvatarServidor.js";
export { obtenerEspacioR2 } from "./obtenerEspacioR2.js";
export { firmarUrlsR2 } from "./firmarUrlsR2.js";
export { registrarAcceso } from "./registrarAcceso.js";
export { registrarVisita } from "./registrarVisita.js";
export { listarAccesosClientes } from "./listarAccesosClientes.js";
export { generarReporteCliente } from "./generarReporteCliente.js";
export { listarReportesCliente } from "./listarReportesCliente.js";
export { eliminarReporteCliente } from "./eliminarReporteCliente.js";
export { marcarReporteVisto } from "./marcarReporteVisto.js";
export { obtenerArchivoR2Base64 } from "./obtenerArchivoR2Base64.js";
export { crearClienteAcceso } from "./crearClienteAcceso.js";
export { crearTrabajadorAcceso } from "./crearTrabajadorAcceso.js";
export { listarSolicitudesAccion } from "./listarSolicitudesAccion.js";
export { listarPersonalInterno } from "./listarPersonalInterno.js";
export { crearClienteNuevo } from "./crearClienteNuevo.js";
export { crearPanel } from "./crearPanel.js";
export { crearContrato } from "./crearContrato.js";
export { actualizarContrato } from "./actualizarContrato.js";
export { actualizarPanel } from "./actualizarPanel.js";
export { eliminarPanel } from "./eliminarPanel.js";
export { actualizarClienteInfo } from "./actualizarClienteInfo.js";
export { eliminarContrato } from "./eliminarContrato.js";
export { resolverSolicitudAccion } from "./resolverSolicitudAccion.js";
export { eliminarSolicitudCampana } from "./eliminarSolicitudCampana.js";
export { actualizarEstadoSolicitud } from "./actualizarEstadoSolicitud.js";
export { crearSolicitudCampana } from "./crearSolicitudCampana.js";
export { sincronizarEstadoPaneles, sincronizarEstadoPanelesAhora } from "./sincronizarEstadoPaneles.js";
export { diagnosticoPanel } from "./diagnosticoPanel.js";
export { limpiarArchivosHuerfanos } from "./limpiarArchivosHuerfanos.js";
export { resumenOcupacion } from "./resumenOcupacion.js";
export { contarEvidenciasHuerfanas } from "./contarEvidenciasHuerfanas.js";
export { crearFacturaAdmin } from "./crearFacturaAdmin.js";
export { firmarDescargaFactura } from "./firmarDescargaFactura.js";
export { actualizarNombreFactura } from "./actualizarNombreFactura.js";
export { eliminarFactura } from "./eliminarFactura.js";
export { recordatorioVencimientoCampanas, recordatorioReportesMensuales, notificarReporteListo, notificarFacturaNueva, notificarSolicitudCampana, notificarResolucionSolicitud } from "./notificacionesPush.js";
export { confirmarActivacionPush } from "./confirmarActivacionPush.js";
export { guardarTokenPush } from "./guardarTokenPush.js";
export { actualizarAvatarCliente } from "./actualizarAvatarCliente.js";
export { actualizarImagenCampania } from "./actualizarImagenCampania.js";
export { comprimirFacturaPdf } from "./comprimirFacturaPdf.js";
export { administrarUsuarioPortal } from "./administrarUsuarioPortal.js";
export { restablecerPasswordCliente } from "./restablecerPasswordCliente.js";
export { administrarCotizaciones } from "./administrarCotizaciones.js";
export { enviarCorreoConPdf } from "./enviarCorreoConPdf.js";
export { administrarRecordatorioDominio } from "./administrarRecordatorioDominio.js";
