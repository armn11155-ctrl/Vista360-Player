# Auditoría de costos de producción — Vista360 Player

Fecha de corte: 23 de agosto de 2026 (America/Lima)

Proyecto: `base-de-datos-vista360`

## Resultado ejecutivo

El cargo de Secret Manager no era una consecuencia normal del uso de la aplicación. El workflow de backend añadía una versión de cada secreto en cada ejecución y su primera corrección solo examinaba la primera página de 100 versiones. Cuatro secretos R2 llegaron a 178 versiones y quedaron 324 versiones facturables en total.

Se desplegó la corrección acotada, se inventariaron las 59 Functions antes de destruir nada y se destruyeron 314 versiones que ninguna Function activa referenciaba. Quedan 10 versiones activas: las seis actuales y cuatro copias de R2 en la versión 75 que todavía necesita una Function huérfana. El costo futuro de Secret Manager baja de unos USD 19.08/mes a USD 0.24/mes. Eliminar de forma segura esa Function y luego las cuatro versiones 75 llevaría el servicio a USD 0.

El segundo cargo era Cloud Run Functions. `firmarUrlsR2` conservaba CPU/configuración heredada y concurrencia 1 después de un experimento revertido en el código, por lo que solicitudes simultáneas levantaban varias instancias. En agosto acumuló aproximadamente 38,961 segundos de tiempo facturable. Se restableció producción a `minInstances=0`, CPU 1, concurrencia 80 y todo el tráfico en la última revisión.

Con el volumen actual, Firestore, R2, Artifact Registry, Logging, Cloud Storage, Scheduler y GitHub Actions permanecen dentro de sus niveles gratuitos o cuestan una fracción de centavo. PITR de Firestore se conserva deliberadamente porque es recuperación profesional y la base ocupa solo unos 0.00031 GiB.

## Costos: antes y después

| Servicio | Costo actual aproximado | Causa verificada | Cambio realizado | Costo esperado después |
| --- | ---: | --- | --- | ---: |
| Secret Manager | USD 15–16 observado en agosto; ritmo completo ~USD 19.08/mes | 324 versiones `ENABLED`; creación en cada workflow y paginación incompleta | Rotación opt-in, comparación de valor, paginación total, protección de referencias y destrucción de 314 versiones | **USD 0.24/mes** hasta retirar la Function huérfana; luego **USD 0** |
| Firestore | ~USD 0 | 47,392 lecturas, 2,384 escrituras y 102 borrados del 1 al 24 de agosto; todo dentro de cuota | Auditoría de listeners, límites, cachés y agregados; se mantienen pruebas de regresión | **USD 0** con uso actual |
| Firestore PITR/backups | < USD 0.01 | PITR de 7 días sobre ~333,616 bytes; 0 backups y 0 schedules | PITR conservado; no se inventaron backups duplicados | **< USD 0.01** |
| Cloud Run Functions | ~USD 1 en agosto | Concurrencia 1/configuración heredada y despliegues repetidos; `firmarUrlsR2` dominó el tiempo facturable | `minInstances=0`, concurrencia 80, topes por función y deploy acotado | **USD 0** dentro de cuota gratuita; dependiente de tráfico real |
| Cloud Scheduler | USD 0 | Solo 2 jobs diarios | Frecuencia conservada; ambos con máximo 1 instancia | **USD 0** (3 jobs/mes incluidos por cuenta) |
| Cloudflare R2 | USD 0 | 20 objetos, 1,944,871 bytes (~1.85 MiB) | Informe de huérfanos; protección de `_papelera`; no se borraron archivos | **USD 0** dentro de 10 GB y cuotas de operaciones |
| Artifact Registry | USD 0 | 6 imágenes, 187,591,528 bytes (~179 MiB) | Política activa borra artefactos de más de 1 día | **USD 0** bajo los 0.5 GiB gratuitos |
| Cloud Logging | USD 0 | ~58 MiB en agosto, muy por debajo de 50 GiB; build/revisiones generan casi todo | Se retiraron correo y nombre de archivo de un log operativo; retención `_Default` 30 días | **USD 0** |
| Cloud Storage técnico | USD 0 | Sources: 63 objetos/62,352,339 bytes; uploads: 1 objeto/993,500 bytes | Se conservaron lifecycle, versionado limitado y soft delete de 7 días | **USD 0** bajo 5 GB en `us-central1` |
| Cloud Build | USD 0 | La API no devolvió builds retenidos; el costo visible venía de despliegues/revisiones | Concurrencia de workflow y secrets/deploy separados | **USD 0** con la frecuencia actual |
| GitHub Actions / deploys | USD 0 esperado | Un cron diario y verificaciones por commit; los deploys de backend son manuales | Concurrencia añadida; deploy normal ya no rota secretos; se quitaron cuatro nombres de Functions obsoletas | **USD 0** dentro de minutos incluidos |

Las cifras son estimaciones técnicas, no sustituyen la factura final. Los niveles gratuitos y precios pueden cambiar.

## 1. Secret Manager

### Causa raíz

`scripts/set-r2-secrets-direct.mjs` añadía versiones durante el workflow de despliegue. La corrección anterior comparó valores, pero la poda pedía `pageSize=100` sin seguir `nextPageToken`. Con secretos en versión 178, las versiones 1–78 quedaron fuera del inventario y continuaron facturando.

Estado antes de la limpieza:

| Secreto | Versiones facturables antes | Versiones protegidas actuales | Versiones destruidas ahora |
| --- | ---: | --- | ---: |
| `CRON_SYNC_SECRET` | 2 | 60 | 1 |
| `R2_ACCESS_KEY_ID` | 80 | 75, 178 | 78 |
| `R2_ACCOUNT_ID` | 80 | 75, 178 | 78 |
| `R2_BUCKET` | 80 | 75, 178 | 78 |
| `R2_SECRET_ACCESS_KEY` | 80 | 75, 178 | 78 |
| `RESEND_API_KEY` | 2 | 45 | 1 |

Defensas nuevas:

- un deploy normal no ejecuta la sincronización de secretos;
- rotar requiere marcar `actualizar_secretos` manualmente;
- no se añade una versión si el valor coincide con `latest`;
- el inventario sigue todos los `nextPageToken`;
- se protege `latest` y cada versión fijada por una Function desplegada;
- si no se puede leer producción, la poda falla cerrada y no destruye nada;
- una prueba automática fija cada una de estas garantías.

Según [Secret Manager Pricing](https://cloud.google.com/secret-manager/pricing), se cobran las versiones activas y las primeras seis están incluidas. Diez activas dejan cuatro sobre la cuota: `4 × USD 0.06 = USD 0.24/mes`.

## 2. Firestore

### Estado vivo

- base `(default)`, Native/Standard, ubicación `nam5`, free tier activo;
- almacenamiento + índices: aproximadamente 333,616 bytes;
- 1–24 de agosto: 47,392 reads, 2,384 writes, 102 deletes;
- PITR 7 días habilitado;
- 0 backups administrados y 0 calendarios de backup.

La cuota oficial incluye 50,000 lecturas, 20,000 escrituras y 20,000 borrados por día, más 1 GiB de datos. PITR y backups no tienen cuota gratis. Véase [Firestore pricing](https://firebase.google.com/docs/firestore/pricing).

### Lecturas por pantalla y rol

Son rangos de planificación con caché fría, un año de reportes (`Y=1`) y agregados presentes. Las reglas pueden añadir una lectura dependiente de `portalUsers`; por eso se conserva un rango conservador.

| Rol / acción | Lecturas directas | Rango conservador | Escrituras / notas |
| --- | ---: | ---: | --- |
| Cualquier rol: login | 1 | 1–2 | 1 write de acceso/visita |
| Cliente: Inicio | 4 | 4–7 | reutiliza agregado de paneles, contratos y resumen de reporte |
| Cliente: Campañas | 0 | 0 | datos ya en memoria |
| Cliente: Cobertura | 0 | 0 | inventario precargado; mapa usa red externa |
| Cliente: Reportes, primera sección | 2 | 2 | `1 + Y`; no descarga PDFs al listar |
| Cliente: Facturas, primera sección | 3 | 3–4 | agregado + firma agrupada |
| Cliente: Perfil/Detalle/Facturas repetidos <60 s | 0 | 0 | caché compartida |
| Cliente: ver reporte | 1 | 1 | 2 writes de marcado, deduplicadas por sesión |
| Gerente: selector de clientes | ~`ceil(C/2000)` | 1–5 hasta 10,000 clientes | agregado paginado; solo firma avatares visibles |
| Gerente/Trabajador: abrir un cliente | igual que el flujo de cliente | igual | no lee automáticamente todos los clientes |
| Paneles | 1 en frío | 1 | un documento agregado; respaldo directo solo si falta/falla |
| Solicitudes | resultados de la query filtrada | según pendientes reales | listeners por estado/rol; riesgo de crecimiento descrito abajo |
| Ocupación | depende de paneles/contratos activos | cacheada entre entradas | callable agrupa el cruce en servidor |
| Analítica | página de hasta 300 accesos | proporcional a la página | deduplica peticiones y reutiliza nombres del selector |
| Cotizaciones | 0 para editar/generar local | 0 | PDF se genera bajo demanda |

Una sesión cliente completa de un año se planifica en unas 11 lecturas, con techo frío conservador de 15. Con cinco años, unas 15 lecturas porque reportes crece por años, no por cada PDF. A 300 clientes × 10 sesiones/día × 5 años son unas 45,000 lecturas/día y 6,600 escrituras/día: todavía dentro de la cuota actual.

### Protecciones verificadas

- ningún listener sobre colecciones crecientes queda sin filtro;
- contratos tienen un único hook/escucha compartida;
- facturas no hacen la antigua consulta doble por RUC;
- caché persistente IndexedDB multi-tab activa;
- listeners y URLs privadas se limpian al cerrar sesión;
- Reportes usa metadatos anuales y caché de peticiones;
- Inicio solicita solo el resumen, sin firmar cada PDF;
- invitaciones y accesos administrativos están paginados/acotados;
-  tests específicos fallan si estas decisiones se revierten.

### Bombas de tiempo

1. `agregados/cliente-*` y `agregados/facturas-*` pueden acercarse al límite de 1 MiB hacia 250–300 campañas pesadas o historiales grandes. Solución futura: particionar por año y conservar solo activos/recientes en el documento principal.
2. La reconstrucción diaria es O(clientes + historial). A 10,000 clientes con 60 contratos y 60 facturas puede superar 1.2 millones de lecturas. Solución: mutaciones incrementales y reconciliación por cursor/particiones cambiadas.
3. Analítica todavía escala linealmente con `portalUsers` al llegar a 5,000–10,000 usuarios. Migrar a agregados antes de ese nivel.
4. Reportes y facturas entregan listas completas. Añadir cursor/año y virtualización al superar aproximadamente 200–300 tarjetas por cliente.

No se cambió la seguridad para ahorrar lecturas: las reglas, propiedad de keys y validación de roles permanecen intactas.

## 3. Functions, Cloud Run y tareas programadas

Inventario vivo: 59 Functions Gen2, todas en `us-central1`, ninguna con `minInstances > 0` después del despliegue.

Configuración verificada en producción:

| Function | min | max | CPU | Concurrencia | Resultado smoke |
| --- | ---: | ---: | ---: | ---: | --- |
| `firmarUrlsR2` | 0 | 20 | 1 | 80 | 401 sin auth, correcto |
| `listarReportesCliente` | 0 | 20 | 1 | 80 | 401 sin auth, correcto |
| `subirFotoReporteServidor` | 0 | 20 | 1 | 80 | 401 sin auth, correcto |
| `sincronizarEstadoPaneles` | 0 | 2 | 1 | 10 | 405 por GET, correcto |
| ambos recordatorios | 0 | 1 | 1 | 80 | Scheduler privado |

Los timeouts de 300–540 s y 512 MiB–1 GiB se conservaron solo en procesos manuales/pesados (PDF, reconciliación, conteo/limpieza). Reducirlos sin carga productiva representativa aumentaría fallos y reintentos; no produce ahorro seguro hoy.

Cron real:

| Origen | Tarea | Frecuencia | Necesidad / costo |
| --- | --- | --- | --- |
| Cloud Scheduler | recordatorio de reportes | 11:30 America/Lima diario | necesario; 1 job |
| Cloud Scheduler | vencimiento de campañas | 15:00 America/Lima diario | necesario; 1 job |
| GitHub Actions | sincronizar paneles | 05:20 UTC / 00:20 Lima diario | una reconciliación diaria; no cada pocos minutos |

Cloud Scheduler incluye tres jobs al mes por cuenta: [pricing oficial](https://cloud.google.com/scheduler/pricing).

## 4. R2

Inventario de solo metadatos:

- 20 objetos;
- 1,944,871 bytes en total;
- ningún objeto supera 1 MiB;
- 0 multipart uploads pendientes;
- reportes: 9 / 1,095,403 bytes;
- facturas: 3 / 565,365 bytes;
- avatares: 5 / 27,996 bytes;
- `_papelera`: 3 / 256,107 bytes.

Tres candidatos huérfanos, comparados contra Firestore, no se borraron:

| Key | Tamaño | Última modificación | Motivo de espera |
| --- | ---: | --- | --- |
| `vista360/avatares/1785256347583-r752e9mc.jpg` | 4,647 B | 2026-07-28 | puede ser una foto reemplazada; requiere confirmar historial |
| `vista360/avatares/1786465358390-emi7vg7c.webp` | 2,274 B | 2026-08-11 | puede ser una foto reemplazada; requiere confirmar historial |
| `vista360/facturas/1786465872281-v7p3qlq4.pdf` | 514 B | 2026-08-11 | factura posiblemente fallida/reemplazada |

El ahorro de borrarlos sería prácticamente cero: 7,435 bytes. Se prioriza recuperación sobre una eliminación innecesaria.

Se corrigió un riesgo real: `limpiarArchivosHuerfanos` podía considerar huérfanos los objetos de `_papelera` y borrarlos a las 24 h, contradiciendo su retención de 30 días. Ahora ese prefijo se excluye explícitamente y está cubierto por test.

El token R2 actual tiene permisos de objetos, no de administración de lifecycle, por lo que no permitió leer la regla vía API. La regla de 30 días debe verificarse en el panel de Cloudflare. El uso actual está muy por debajo de las cuotas gratuitas de [R2](https://developers.cloudflare.com/r2/pricing/).

## 5. Logging, Monitoring y privacidad

- `_Default`: 30 días; `_Required`: retención administrada por Google;
- no hay sinks personalizados, métricas personalizadas ni exportaciones que dupliquen almacenamiento;
- volumen aproximado del mes: builds 37.4 MB, revisiones Cloud Run 20.8 MB, Scheduler 39 KB;
- no se encontraron PDFs/base64 completos en logs;
- `enviarCorreoConPdf` ya no registra destinatario ni nombre de archivo; conserva únicamente tamaños necesarios para diagnóstico.

Logging incluye 50 GiB de ingestión por proyecto al mes y 30 días de almacenamiento por defecto; el volumen actual usa cerca de 0.1% de esa cuota. Véase [Cloud Logging pricing](https://cloud.google.com/logging).

## 6. Artifact Registry, Storage y builds

Artifact Registry:

- repositorio `gcf-artifacts`, Docker, `us-central1`;
- 6 imágenes / 187,591,528 bytes;
- política activa `firebase-functions-cleanup`: elimina cualquier tag con más de `86400s`;
- producción conserva la revisión actual; la política trabaja en segundo plano.

El nivel gratuito incluye 0.5 GiB: [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing). No se borró manualmente ninguna imagen.

Cloud Storage técnico:

- sources `us-central1`: versionado activo, conserva como máximo tres versiones no actuales por objeto y soft delete 7 días;
- uploads `us-central1`: borra a 1 día y conserva soft delete 7 días;
- total visible ~60.4 MiB, muy por debajo de 5 GB gratuitos en regiones elegibles: [Cloud Storage pricing](https://cloud.google.com/storage/pricing).

## 7. Workflows y deploys

| Workflow | Trigger | Puede desplegar/modificar producción |
| --- | --- | --- |
| `verificar.yml` | push, PR, manual | no; tests/typecheck/build |
| `setup-r2-secrets-and-deploy.yml` | manual | sí; backend, reglas opcionales y secrets solo opt-in |
| `sincronizar-paneles-diario.yml` | diario, manual | llama al endpoint protegido; no despliega |
| `auditar-reglas.yml` | manual | solo lectura |
| `crear-indice-informes.yml` | manual | migración explícita |
| `migrar-facturas.yml` | manual | migración explícita |

No existe deploy automático por cada commit. El backend manual ahora tiene un grupo de concurrencia que encola ejecuciones y no cancela producción a mitad. Se quitaron cuatro nombres de Functions obsoletas de la lista de deploy. Un commit solo ejecuta una verificación por ref; las ejecuciones anteriores se cancelan si llega otro commit.

## 8. Regiones y red

- Functions, Cloud Run, Artifact Registry, Cloud Scheduler y buckets técnicos: `us-central1`;
- Firestore: `nam5` multi-región;
- R2: `auto`, servido por Cloudflare.

`us-central1` es la ubicación coherente para el cómputo que accede a la base multi-región. Migrar Firestore sería una operación crítica, con riesgo y sin beneficio económico justificable al volumen actual; no se realizó.

## 9. Presupuestos y límites

Se habilitó Cloud Billing Budget API y se dejó un solo presupuesto mensual:

- nombre: `Vista360 producción — alertas 1/5/10/20`;
- alcance: únicamente este proyecto;
- monto: USD 20;
- alertas de gasto real: 5%, 25%, 50% y 100% = USD 1, 5, 10 y 20;
- destinatarios: responsables IAM de facturación y Owners del proyecto.

Se retiraron dos presupuestos obsoletos: uno global de USD 0 y otro duplicado de USD 30. Un budget **no detiene el gasto**; solo notifica. Google lo documenta expresamente en [budgets and alerts](https://cloud.google.com/billing/docs/how-to/budgets).

Límites técnicos ya presentes: `maxInstances` global 20, límites más bajos en cron/sync, límites de tamaño para uploads y PDFs, rate limiting, autorización por rol, listas blancas de keys R2 y workflow manual. No se implementó un apagado automático de billing porque podría dejar producción inoperativa y causar pérdida de operaciones.

## 10. Verificaciones ejecutadas

- `npm test`: **78 archivos, 1,207 tests aprobados**;
- `npm run build`: typecheck + build Vite aprobados;
- `functions/npm run build`: TypeScript backend aprobado;
- reglas Firestore: **4 archivos, 107 ataques/pruebas contra el emulador aprobados**;
- smoke productivo: Functions HTTP/callable arrancan y rechazan correctamente tráfico no autenticado;
- configuración productiva: ocho Functions `ACTIVE`, todo el tráfico en la última revisión;
- Secret Manager post-limpieza: cero candidatas no referenciadas;

La primera ejecución de CI descubrió un defecto preexistente del propio test: sembraba cuentas en `vista360-cuentaportal-test`, mientras Firebase Admin respetaba `FIREBASE_CONFIG` del runner y leía `demo-vista360-reglas`. Se unificó el project ID y la suite completa pasó con Java 21 y el emulador real.

No se hicieron pruebas de acciones autenticadas que escriben datos (generar/eliminar reportes, facturas, solicitudes) porque usar cuentas reales sin credenciales de prueba y sin fixtures aislados sí tendría riesgo productivo. La suite cubre autorización, aislamiento y lógica; los smoke tests verificaron el despliegue sin mutar información.

## CORREGIDO

- causa raíz y paginación de Secret Manager;
- 314 versiones facturables destruidas de forma protegida;
- deploy normal separado de rotación de secretos;
- concurrencia/escalado de las rutas R2 de mayor uso;
- topes de cron y sincronización;
- workflow de backend con concurrencia y sin exports obsoletos;
- `_papelera` protegida frente al limpiador de huérfanos;
- PII retirada del log de correo;
- presupuesto único con alertas USD 1/5/10/20;
- despliegue acotado y validación productiva.

## PENDIENTE

1. **Function huérfana `exportarReportesCombinados`**: no existe en el código actual, no apareció en logs recientes y es la única dependencia de R2 versión 75. Su eliminación fue bloqueada por ser destructiva sin una aprobación específica. Costo directo aproximado: las cuatro versiones extra de R2, **USD 0.24/mes**, más una revisión/servicio residual normalmente sin costo si no recibe tráfico. Procedimiento seguro: confirmar que ningún consumidor externo conserva su URL, exportar configuración, eliminar la Function, inventariar nuevamente referencias y destruir las cuatro versiones 75.
2. **Tres objetos huérfanos R2**: 7,435 bytes; no compensa borrarlos sin confirmar historial.
3. **Lifecycle R2**: verificar visualmente en Cloudflare que `_papelera` expire a 30 días; el token de objetos no puede leer administración.
4. **Escala futura**: particionar agregados antes de 250–300 campañas pesadas por cliente; paginar reportes/facturas sobre 200–300 tarjetas; convertir reconciliación y Analítica a agregados incrementales antes de miles de clientes.

## COSTO MENSUAL ESPERADO

Con el uso real actual: **USD 0.24–0.30/mes** en Google Cloud, compuesto casi enteramente por las cuatro versiones R2 que protege la Function huérfana y una fracción de centavo de PITR. Cloud Run, Firestore operativo, Scheduler, Logging, Artifact Registry y Storage deberían permanecer en USD 0 mientras se mantengan dentro de sus cuotas.

Después de retirar de forma aprobada la Function huérfana y las cuatro versiones 75: **USD 0.00–0.01/mes** esperado, conservando PITR, seguridad y toda la funcionalidad activa.
