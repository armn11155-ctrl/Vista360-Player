# Auditoría completa de rendimiento — 6 de agosto de 2026

## Resultado ejecutivo

La demora móvil al volver a **Gestión de clientes** tenía una causa reproducible: el selector se desmontaba al entrar a un cliente y, al volver, su estado React empezaba otra vez en `loading` aunque la misma lista seguía disponible en memoria. La interfaz ocultaba los clientes hasta que Safari/PWA reconectaba el listener y volvía a firmar avatares. El temporizador de seguridad de cuatro segundos explica la captura: ver simultáneamente `Activos 0`, `Archivados 0` y `Cargando clientes…` demuestra que habían transcurrido al menos **4,000 ms**.

La corrección pinta la lista y sus conteos desde memoria en el primer render y refresca el listener detrás. También reutiliza las firmas vigentes, firma únicamente los avatares de la página visible y nunca vuelve a ocultar contenido que ya se mostró. El regreso ya no depende de la red para pintar.

Además se redujo trabajo general que todavía estaba oculto:

- Inicio ya no carga todos los documentos ni firma dos URLs por cada reporte. Solo obtiene el último reporte y el estado del mes desde metadatos de R2.
- Reportes guarda sus metadatos en un agregado anual: después de la migración automática, pasa de una lectura por reporte a una lectura por año.
- Detalle, Facturas y Perfil comparten durante 60 segundos el mismo agregado de facturas. No quedan listeners activos al salir.
- La firma de URLs de facturas valida toda la lista con un agregado; ya no hace una consulta por factura ni consulta campañas cuando no hay una clave de campaña.
- Ver y luego descargar el mismo reporte lo marca una sola vez por sesión.
- La URL temporal de descarga de una factura se reutiliza durante cinco horas.

No se cambiaron diseño, permisos, autenticación, reglas de seguridad ni lógica de negocio visible.

## Medición del problema móvil

| Flujo | Antes | Después técnico |
| --- | ---: | ---: |
| Regresar con **Cambiar cliente** | más de 4,000 ms en la captura móvil | datos disponibles en el primer render; 0 consultas bloqueantes |
| Regreso medido en producción | 706 ms en Chrome de escritorio con caché caliente | clientes visibles en la primera observación a los 100 ms; 504 ms incluyendo la captura completa de automatización |
| Lista de clientes al volver | estado `loading` hasta respuesta de Firestore | estado `ready` desde memoria + refresco en segundo plano |
| Avatares firmados | todos los clientes, aunque solo se mostraran 8 espacios | solo los clientes realmente visibles + avatar propio |
| Clientes grandes | hasta `ceil(C / 60)` llamadas de firma | normalmente 1 llamada por página visible |

La escucha anterior sí se cerraba al desmontar el selector; no había fuga de listeners ni consulta simultánea al cliente anterior. El problema era de estado inicial y trabajo bloqueante, no de tamaño de pantalla ni bucle. Safari/PWA lo hacía más visible porque la reconexión de Firestore y las funciones firmadoras puede tardar más que en Chrome de escritorio.

## Lecturas evitadas

Variables usadas:

- `R`: reportes históricos del cliente.
- `Y`: años que contienen reportes.
- `F`: facturas visibles.
- `K`: campañas leídas para validar fotos de campaña.
- `C`: clientes administrados.

| Operación | Antes | Después estable | Ahorro |
| --- | ---: | ---: | ---: |
| Inicio: resumen de reportes | `1 + R` lecturas y `2R` firmas | 1 lectura, 0 firmas | `R` lecturas y `2R` firmas |
| Abrir Reportes | `1 + R` lecturas | `1 + Y` lecturas | `R - Y` |
| Firmar URLs al abrir Facturas | `1 + K + F` | 2 en una solicitud de solo facturas | `K + F - 1` |
| Reentrar a Detalle/Facturas/Perfil en menos de 60 s | 1 agregado + reglas por montaje | 0 | 1 lectura de resultado + reglas |
| Ver y Descargar el mismo reporte | 2 llamadas de marcado | 1 por sesión | 1 lectura de autorización + 2 escrituras |
| Volver al selector | 1 reconexión bloqueante + firmas para `C` avatares | 0 consultas bloqueantes + firmas visibles | espera de red eliminada; hasta `ceil(C/60)-1` validaciones menos |

En la cuenta Bububots medida en producción había cinco reportes de un solo año y dos facturas:

- Inicio anterior: 6 lecturas y 10 URLs firmadas; nuevo: 1 lectura y 0 firmas.
- Reportes anterior: 6 lecturas; nuevo estable: 2.
- Firma de facturas anterior: 4 lecturas (`1 + 1 campaña + 2 facturas`); nuevo: 2.

La primera apertura de Reportes después del despliegue migra los metadatos históricos. Para un cliente con `R` reportes y `Y` años cuesta una vez `1 + Y + R` lecturas y `Y` escrituras. Las siguientes aperturas cuestan `1 + Y`. Cada reporte nuevo, marcado como visto o eliminado mantiene el agregado automáticamente.

## Consumo por acción de un cliente

Las columnas de lecturas muestran primero las lecturas directas o del servidor y luego un rango conservador facturable. Las reglas usan `exists()`/`get()` sobre `portalUsers`; Firebase puede cobrar esos documentos dependientes una vez por solicitud. Las Functions usan Admin SDK y no evalúan reglas.

Supuesto de la tabla: un año de reportes (`Y = 1`), agregados presentes, URLs aún no firmadas, una campaña y caché fría. Filtros y paginación son locales.

| Acción del cliente | Lecturas directas | Lecturas conservadoras | Escrituras | Consultas/llamadas | Datos descargados | Archivos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Inicio de sesión | 1 | 1–2 | 1 | 1 lectura + 1 callable | aprox. 1–4 KB | 0 |
| Panel principal: cliente, campañas, paneles y resumen de reporte | 4 | 4–7 | 0 | 3 listeners/documentos + 1 callable | aprox. 10–60 KB | 0 |
| Campañas | 0 | 0 | 0 | 0 | memoria | 0 |
| Detalle de campaña, primera entrada | 3 | 3–4 | 0 | 1 agregado de facturas + 1 listado de reportes | aprox. 5–25 KB | 0 |
| Cobertura | 0 | 0 | 0 | reutiliza inventario precargado | teselas del mapa según zona | imágenes de mapa |
| Reportes tras Detalle, dentro de 60 s | 0 | 0 | 0 | caché del listado | memoria | 0 |
| Reportes como primera sección | 2 | 2 | 0 | 1 callable + 1 agregado anual | aprox. 5–20 KB para cinco reportes | 0 |
| Facturas, primera sección | 3 | 3–4 | 0 | agregado + callable de firmas | aprox. 5–20 KB para dos facturas | 0 |
| Perfil/Facturas/Detalle repetidos en 60 s | 0 | 0 | 0 | caché | memoria | 0 |
| Ver reporte | 1 | 1 | 2 | marcar visto | 111 KB medidos en promedio | 1 PDF |
| Descargar el mismo reporte en la sesión | 0 | 0 | 0 | marcado ya deduplicado | otros 111 KB si el navegador no reutiliza HTTP | 1 PDF |
| Ver factura | 0 | 0 | 0 | URL ya firmada | 283 KB medidos en promedio | 1 PDF |
| Primera descarga de factura | 2 | 2 | 0 | firma bajo demanda | 283 KB medidos en promedio | 1 PDF |
| Repetir descarga de factura en 5 h | 0 | 0 | 0 | caché de URL temporal | 283 KB por descarga | 1 PDF |
| Filtros, búsqueda y paginación | 0 | 0 | 0 | local | 0 | 0 |
| Volver a pantallas ya vistas dentro de su vigencia | 0 | 0 | 0 | local | 0 | 0 |
| Lote de pantallas visitadas | 0 | 0 | 1 normalmente | 1 callable agrupado | mínimo | 0 |
| Cierre de sesión | 0 | 0 | 0 | Auth + limpieza local | 0 | 0 |

Los tamaños medidos en producción fueron:

- Reportes: 113, 113, 113, 128 y 87 KB; promedio **110.8 KB**.
- Facturas: 442 y 123 KB; promedio **282.5 KB**.

No se usa Firebase Storage para esos PDFs; viven en R2. Abrir una lista no descarga el PDF. Solo Ver, Descargar o la precarga de compartir del administrador descarga el archivo.

## Escenarios por sesión

| Escenario | Lecturas directas/servidor | Rango conservador facturable | Escrituras | Datos públicos y Firestore | PDFs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Primera sesión, solo Inicio | 5 | 5–9 | 2 | aprox. 1.0 MB de app pública + 10–60 KB de datos | 0 |
| Primera sesión, todas las pantallas sin abrir PDFs | 10 | 10–15 | 2 | lo anterior + aprox. 20–65 KB | 0 |
| Primera sesión normal, todas las pantallas + ver 1 reporte y 1 factura | 11 | 11–16 | 4 | aprox. 1.0–1.2 MB de app/datos | aprox. 394 KB |
| Sesión caliente en menos de 30 min | 4–6 | 4–10 | 2–4 | assets con hash desde caché; pocos KB de datos | según acciones |
| Uso intensivo: todas las pantallas, refrescar Reportes 3 veces, ver y descargar ambos PDFs | 16–20 | 16–25 | 4 | app/datos + teselas | aprox. 788 KB |

La cifra recomendada para planificar es **12 lecturas por sesión completa**: mezcla sesiones frías y calientes y deja margen para reglas. El techo conservador de una sesión fría con todas las acciones es 16; reconexiones de más de 30 minutos, datos cambiados, agregados ausentes o años adicionales pueden elevarlo.

La segunda sesión no siempre vale cero. `portalUsers` se vuelve a comprobar y el resumen liviano de Inicio autoriza su callable. Los listeners con persistencia local suelen descargar solo cambios si reconectan en menos de 30 minutos; después de 30 minutos Firebase puede facturarlos como consultas nuevas. Por eso las proyecciones no suponen ahorro perfecto.

## Datos de la aplicación

Mediciones del build de producción:

- Shell inicial (HTML + CSS + módulos iniciales): aproximadamente **312 KB gzip**.
- Todos los chunks normales precargados después del login: aproximadamente **574 KB gzip** en total.
- Generador PDF de cotización: **130.53 KB gzip**, solo bajo demanda.
- Fondo móvil de login: **421,996 bytes**.
- Fondo de selección móvil del administrador: **209,009 bytes**.

Primera instalación móvil de cliente: alrededor de **1.0 MB** entre fondo y código normal, antes de teselas o PDFs. En visitas posteriores, los assets con hash se sirven desde CacheStorage; los documentos Firestore usan IndexedDB persistente. Cerrar sesión limpia CacheStorage para no dejar archivos privados de sesiones antiguas.

## Diez aperturas diarias y capacidad de clientes

Proyección solicitada: cada cliente abre la app 10 veces al día y puede recorrer todas las pantallas. Se usa la cifra de planificación de 12 lecturas por sesión, dos escrituras de analítica por sesión y un reporte marcado una vez al día (dos escrituras adicionales).

Por cliente:

- 120 lecturas/día.
- 22 escrituras/día.
- 3,600 lecturas/mes de 30 días.
- 660 escrituras/mes.

| Clientes | Lecturas/día | Lecturas/mes | Escrituras/día | Escrituras/mes | Exceso diario de cuota gratuita |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1,200 | 36,000 | 220 | 6,600 | 0 |
| 50 | 6,000 | 180,000 | 1,100 | 33,000 | 0 |
| 100 | 12,000 | 360,000 | 2,200 | 66,000 | 0 |
| 500 | 60,000 | 1,800,000 | 11,000 | 330,000 | 10,000 lecturas/día |
| 1,000 | 120,000 | 3,600,000 | 22,000 | 660,000 | 70,000 lecturas + 2,000 escrituras/día |

Con esa carga, la cuota gratuita de 50,000 lecturas/día alcanza para aproximadamente **416 clientes**. Usando el techo frío de 16 lecturas en las 10 aperturas, la capacidad conservadora baja a **312 clientes**. La realidad será intermedia y probablemente mejor por caché, URLs firmadas de seis horas y sesiones que no recorren todo diez veces.

## Costos de Firestore

Configuración verificada: base `(default)`, Firestore Native Standard, región multirregional `nam5`, con free tier. Tarifas publicadas aplicables:

- 50,000 lecturas gratuitas por día; luego USD 0.03 por 100,000.
- 20,000 escrituras gratuitas por día; luego USD 0.09 por 100,000.
- 20,000 eliminaciones gratuitas por día; luego USD 0.01 por 100,000.
- 10 GiB/mes de salida gratuita de Firestore.

Con la proyección de 10 aperturas diarias:

- 500 clientes: unas 10,000 lecturas facturables/día = USD 0.003/día, aproximadamente **USD 0.09/mes**.
- 1,000 clientes: 70,000 lecturas facturables/día = USD 0.021/día; 2,000 escrituras facturables/día = USD 0.0018/día; aproximadamente **USD 0.68/mes**.
- Techo frío de 16 lecturas para 1,000 clientes: aproximadamente **USD 1.04/mes** entre lecturas y escrituras.

Esto no incluye Cloud Functions, R2, teselas, tareas administrativas ni generación de PDFs. La consola de facturación es la fuente definitiva.

Fuentes oficiales:

- [Precios de Cloud Firestore](https://cloud.google.com/firestore/pricing)
- [Cuotas gratuitas de Firestore](https://firebase.google.com/docs/firestore/quotas)
- [Listeners y lecturas dependientes de reglas](https://firebase.google.com/docs/firestore/pricing)

## Pruebas y verificación

- Flujo productivo en Chrome autenticado: selector con tres clientes, entrada a Bububots y regreso al selector.
- Regreso productivo anterior medido: 706 ms en escritorio con caché caliente.
- Captura móvil analizada: estado visible posterior al guardián de 4 segundos.
- Reportes productivos: pantalla abrió y mostró cinco PDFs; tamaños medidos desde la UI.
- Facturas productivas: pantalla abrió y mostró dos PDFs; tamaños medidos desde la UI.
- `npm test`: 46 archivos y 830 pruebas aprobadas.
- `npm run typecheck`: correcto.
- `npm --prefix functions run build`: correcto.
- `npm run build`: correcto.
- Detectores de renders: 0 riesgos directos, 0 riesgos inline, 0 total.
- `git diff --check`: correcto.
- GitHub Actions: tipos de backend, tipos frontend, 830 pruebas, build y 75 pruebas de reglas con emulador aprobados.
- Despliegue productivo aprobado: Functions actualizadas, frontend propagado y reglas omitidas expresamente porque no se modificaron.
- Verificación posterior al despliegue en diseño móvil: selector con tres clientes listo en la primera observación, cambio de cliente correcto, Inicio con el último reporte, Reportes con cinco PDFs y Facturas con sus acciones visibles.

## Archivos modificados

- `src/hooks/useClientesAdmin.ts`
- `src/components/AdminClientPicker.tsx`
- `src/hooks/useSignedUrls.ts`
- `src/hooks/useFacturas.ts`
- `src/hooks/useResumenInformes.ts`
- `src/components/screens/Inicio.tsx`
- `src/components/ReportCard.tsx`
- `src/components/FacturaCard.tsx`
- `functions/src/listarReportesCliente.ts`
- `functions/src/agregadoInformes.ts`
- `functions/src/generarReporteCliente.ts`
- `functions/src/marcarReporteVisto.ts`
- `functions/src/eliminarReporteCliente.ts`
- `functions/src/firmarUrlsR2.ts`
- pruebas de regresión y este informe.

## Riesgos y límites

- La primera apertura de Reportes por cliente migra el histórico y puede ser ligeramente más cara; es una sola vez.
- Un año con hasta 365 reportes diarios cabe holgadamente en el agregado anual. Se eligió partir por año para no acercarse al límite de 1 MB.
- La caché de facturas admite hasta 60 segundos de antigüedad. Si la pantalla permanece abierta, el listener se conecta al vencer el minuto; si se sale, se cancela y no queda activo.
- Un cambio real en un listener, una revalidación tras más de 30 minutos o una regla dependiente modificada puede generar lecturas adicionales.
- Los PDFs no se cachean por Service Worker por seguridad. Volver a descargarlos consume nuevamente su tamaño, aunque el navegador puede reutilizar su caché HTTP.
- La medición automatizada incluye el tiempo de inspección de Computer Use; el contenido ya estaba visible en la primera observación a los 100 ms, por lo que 504 ms es un límite superior del flujo observado, no tiempo puro de red.
