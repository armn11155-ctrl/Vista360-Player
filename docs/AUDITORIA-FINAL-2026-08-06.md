# Auditoría final de ingeniería — Vista360 Player

Fecha: 6 de agosto de 2026 (America/Lima)

## Veredicto ejecutivo

La aplicación está en condiciones de producción para la escala actual y para cientos de clientes. La ruta habitual del cliente ya no contiene consultas que crezcan con el número total de clientes, los listeners de contratos están compartidos, los paneles se leen desde un documento agregado, facturas y reportes usan agregados/cachés, y las rutas pesadas (Leaflet y PDF) están separadas.

No está en su techo arquitectónico. Los primeros límites no están en React ni en la factura diaria de Firestore: están en los agregados de un único documento por cliente, en los barridos completos del backend y en el arranque común de las Cloud Functions. Esos límites no bloquean 100–1.000 clientes, pero deben resolverse antes de convertir 5.000–10.000 clientes o historiales muy extensos en un objetivo real.

**Sí, está listo para producción.**

La afirmación se apoya en 830 pruebas funcionales aprobadas, compilación TypeScript de frontend y backend, build de producción, 0 vulnerabilidades conocidas en dependencias del frontend, TBT de laboratorio de 0 ms, CLS 0, ausencia de patrones de render en bucle detectables y consultas del cliente acotadas por agregados. Las 75 pruebas de reglas ya existen y pasaron en el CI anterior; en esta máquina no pudieron repetirse porque no hay Java, no por un fallo de las reglas.

## Alcance y método

Se revisaron:

- los 397 módulos del frontend y sus dependencias;
- `App`, navegación, pantallas lazy, hooks, cachés y estados globales;
- listeners, timers, promesas, URLs temporales y Service Worker;
- reglas e índices de Firestore;
- todas las Cloud Functions, agregados y tareas programadas;
- autenticación, validación de roles, R2, PDFs, reportes y facturas;
- build, sourcemaps, assets y chunks;
- comportamiento productivo autenticado en Chrome y los flujos móviles/Safari ya medidos en la auditoría previa;
- Lighthouse móvil de laboratorio sobre el build exacto;
- `npm audit` de frontend y backend;
- escenarios de 100, 500, 1.000, 5.000 y 10.000 clientes.

Las métricas de Lighthouse son de laboratorio. El dominio productivo aplica una protección anti-bot que produjo `NO_FCP` en Lighthouse remoto y la API pública de PageSpeed respondió por cuota agotada. No se inventaron valores CrUX. El TTFB productivo sí se midió directamente por HTTP.

## Cambios aplicados en esta auditoría

| Cambio | Problema y causa | Beneficio medido/estimado | Riesgo |
| --- | --- | --- | --- |
| Reportes bajo demanda en Detalle | `useInformes` corría en la pestaña Resumen y una segunda firma no utilizada llamaba a `firmarUrlsR2` | Si no se abre Reportes: elimina 1 listado R2, `1 + Y` lecturas, dos firmas por reporte y la llamada de firma redundante (1 lectura). Con 5 reportes/1 año: 3 lecturas, 10 firmas y 2 Functions menos | Bajo; al abrir Reportes por primera vez aparece su loader |
| Limpieza real de sesión | El listener global de paneles y URLs firmadas en memoria/localStorage sobrevivían al logout | Libera 1 listener, conexión, inventario y URLs privadas; evita que una respuesta tardía repueble la caché | Bajo; la sesión siguiente vuelve a leer 1 agregado |
| Imports PDF bajo demanda | El índice de Functions cargaba PDFKit, `sharp` y pdf-lib en todas las funciones | Importación del índice: 156,3 → 132,5 MB RSS (−23,8 MB; −15,2%); 0,84 → 0,51 s local (−39%) | Medio-bajo; primera operación PDF paga la carga una vez |
| Lectura multipanel agrupada | Un `await get()` secuencial por panel acumulaba latencias | `N` lecturas siguen siendo como máximo `N`, pero pasan de `N` viajes secuenciales a un `getAll`; con 10 paneles elimina hasta 9 RTT y deduplica IDs repetidos | Bajo |
| Cancelación del modal de avatar | Intervalo, timeout y compresión podían terminar tras desmontar el modal | Elimina timers y actualizaciones tardías; memoria/CPU residual pasa a cero al desmontar | Bajo |
| Sin sourcemaps públicos | 8,1 MB de mapas se publicaban sin receptor privado que los usara | `dist`: 13 → 5,4 MB (−7,6 MB visibles; −58%); elimina exposición del fuente original | Bajo; DevTools ya no reconstruye TypeScript productivo |
| Poda de URLs expiradas | La caché persistía entradas vencidas hasta una recarga | Al guardar, memoria/localStorage quedan limitados a URLs aún válidas; 0 lecturas nuevas | Bajo |

`Y` es el número de años con reportes. `N` es la cantidad de paneles incluidos.

## Problemas encontrados y severidad

### Alta — agregados por cliente pueden alcanzar 1 MB

`agregados/cliente-<id>` guarda campañas completas, incluidas estructuras que pueden crecer. El aviso actual usa 400 campañas, pero el tamaño real depende de campos y evidencias: un cliente con pocas campañas muy pesadas puede llegar al límite antes. `agregados/facturas-<id>` tiene el mismo patrón y avisa a 1.500 facturas.

Impacto: una escritura que exceda 1 MiB falla; el frontend cae a consultas directas y conserva funcionalidad, pero aumenta lecturas y latencia. Es el primer límite por antigüedad de un cliente individual.

Recomendación: antes de acercarse a 250–300 campañas por cliente o cientos de KB por agregado, partir contratos y facturas por año y mantener en el documento principal solo activos + recientes + contadores.

### Alta a 5.000–10.000 clientes — regeneraciones completas

`regenerarAgregadoClientes` lee todos los clientes y contratos activos. El barrido diario recorre todos los clientes y para cada uno consulta contratos, solicitudes y facturas. Las mutaciones relevantes también reconstruyen agregados completos.

Impacto: el frontend sigue rápido, pero el trabajo administrativo y el cron se vuelven O(clientes + historial). Con 10.000 clientes y 60 contratos + 60 facturas por cliente, una reconciliación completa puede superar 1,2 millones de lecturas documentales antes de solicitudes y reintentos.

Recomendación: actualización incremental transaccional por mutación, documentos por año y un reconciliador por lotes/cursor que procese solo particiones cambiadas.

### Media — arranque común de Cloud Functions aún es pesado

La mejora aplicada quitó 23,8 MB, pero importar `lib/index.js` todavía consume 132,5 MB RSS frente a 91,6 MB de una función sencilla aislada. El índice reexporta todas las funciones y todavía carga Firebase Admin y AWS/R2 para procesos que quizá solo registren una visita.

Impacto: cold starts de funciones sencillas y menor margen bajo el límite de memoria. No afecta instancias calientes.

Recomendación: dividir en codebases (sesión/lecturas, R2, PDF y mantenimiento) o usar envoltorios con imports dinámicos por familia. Hacerlo como migración separada porque cambia el empaquetado/despliegue de todas las Functions.

### Media — dependencias transitivas del backend

`npm audit --omit=dev`:

- frontend: 0 vulnerabilidades;
- backend: 7 reportes `moderate`, todos encadenados a `uuid < 11.1.1` dentro de `@google-cloud/storage` usado por Firebase Admin.

El vector publicado afecta UUID v3/v5/v6 cuando el atacante controla un buffer. El proyecto no llama esas APIs y la cadena observada usa la librería internamente para transporte, por lo que la explotabilidad aquí es baja. `npm audit fix` propone bajar Firebase Admin 14 a 10 y Functions 7 a 4; no se aplicó porque sería una regresión mayor e insegura. Se debe actualizar cuando Google publique una cadena compatible corregida.

### Media — sin Content Security Policy

Existen `X-Frame-Options`, `nosniff`, Referrer Policy y Permissions Policy. Falta CSP. Una CSP estricta reduciría el impacto de un XSS, especialmente porque las URLs R2 firmadas viven temporalmente en el navegador.

No se añadió en esta pasada: Firebase, R2, OpenStreetMap, Web Workers y estilos actuales necesitan una matriz de orígenes probada; una política incorrecta puede dejar la app en blanco. Recomendación: comenzar con `Content-Security-Policy-Report-Only`, observar violaciones y luego hacer cumplir la política.

### Media — límites de abuso son locales por instancia

Hay validación de roles, listas blancas de keys R2, límites de tamaño y `maxInstances: 20`. El limitador en memoria es por instancia; una cuenta autenticada comprometida puede repartir llamadas entre instancias. El coste máximo queda acotado por `maxInstances`, pero no hay App Check ni cuota global por UID.

Recomendación: para crecimiento público, App Check donde sea compatible y un contador distribuido/Cloud Armor para endpoints costosos (PDF, R2 y mantenimiento). No se recomienda añadir una lectura Firestore a cada llamada barata solo para rate limiting.

### Media a largo plazo — listas completas de reportes y facturas

R2 pagina correctamente en bloques de 1.000 objetos, pero `listarReportesCliente` recorre todo el historial y firma dos URLs por reporte. React renderiza toda la lista. Facturas también entrega el agregado completo.

Impacto: 60 reportes mensuales en cinco años son seguros; 1.825 reportes diarios implican múltiples páginas R2, miles de firmas y un DOM grande. La primera degradación será la Function/R2, después la renderización móvil.

Recomendación: paginación por año/cursor y virtualización solo cuando el histórico supere aproximadamente 200–300 tarjetas. Implementarla ahora añadiría complejidad sin beneficio perceptible para los cinco reportes actuales.

### Baja — código muerto y parámetros heredados

El chequeo estricto adicional encontró imports, props y helpers no usados en `App`, `DialogosProvider`, `NotifPrompt`, `Accesos`, `DetalleCampana`, `Inicio`, `SolicitudesCampana`, `r2.ts`, `useFacturas` y `useNotificaciones`. El build normal los elimina y no aumentan el bundle ejecutado. No se tocaron porque sería limpieza cosmética sin mejora medible; conviene corregirlos cuando esos archivos vuelvan a modificarse y luego activar `noUnusedLocals` gradualmente.

## Frontend, hooks, estado y renderizado

- No se detectaron efectos con dependencias que generen loops ni valores inline de riesgo. Los detectores estáticos reportan 0 riesgos directos y 0 en línea.
- `useContratos` comparte una escucha y la cierra al quedar sin suscriptores.
- `useFacturas` cancela listener y timer; durante 60 s reutiliza el agregado entre Detalle, Facturas y Perfil.
- `useClientesAdmin` conserva el selector en memoria y firma solo avatares visibles.
- `usePortalAuth` evita un listener permanente sobre `portalUsers`; revalida al foco con ventana de cinco minutos.
- Las pantallas están separadas por ruta y se precargan en lotes tras autenticación. Es una decisión correcta para el objetivo del producto: cambios instantáneos una vez dentro.
- No hay una librería de estado global pesada. Las cachés de módulo son pequeñas y tienen propósito/caducidad.
- No se encontró necesidad actual de virtualización: las listas visibles reales son pequeñas.
- El CSS global pesa 146,97 KB raw / 27,54 KB gzip. Dividirlo hoy puede producir flashes y peticiones extra; el ahorro inicial probable no justifica el riesgo.

## Firestore: lecturas, escrituras, caché e índices

### Estado validado

- Caché persistente IndexedDB activa con soporte multi-tab.
- Long polling automático conservado para Safari.
- Una sola lectura agregada para el inventario; respaldo directo si falta/falla.
- Contratos/solicitudes del cliente salen de un agregado; respaldo correcto.
- Facturas salen de un agregado separado para no engordar todas las sesiones.
- Reportes leen metadatos por año; R2 es el catálogo de archivos.
- Consultas compuestas declaradas para contratos, solicitudes e informes.
- Escrituras directas sensibles están denegadas y pasan por Functions.
- Los listeners detectados tienen limpieza; el único global que sobrevivía al logout fue corregido.

### Coste de una sesión después de esta auditoría

Para un cliente con un año de reportes y una sesión completa que recorre pantallas sin repetir acciones, la cifra de planificación baja de aproximadamente 12 a **11 lecturas**. El techo frío conservador baja de 16 a **15**. Si nunca abre Reportes dentro del detalle, ahorra además el listado completo; si sí lo abre, el coste se difiere, no se elimina.

Cinco años de metadatos añaden cuatro lecturas al abrir Reportes (`1 + Y`), no una lectura por reporte. Una sesión completa de cinco años se planifica en aproximadamente **15 lecturas**, no en 60 ni en el número total de pantallas.

Las escrituras normales siguen alrededor de 22 por cliente/día bajo el supuesto anterior de 10 sesiones, analítica agrupada y un reporte visto diario. Esta auditoría no añadió ninguna lectura ni escritura.

## Bundle y assets

### Build de producción

| Chunk | Raw | Gzip | Cuándo carga |
| --- | ---: | ---: | --- |
| Firestore (`nucleo-datos`) | 552,36 KB | 138,62 KB | shell/autenticación |
| Firebase base | 166,86 KB | 41,02 KB | shell |
| Firebase Auth | 126,03 KB | 25,52 KB | shell |
| React | 143,23 KB | 45,82 KB | shell |
| App inicial | 101,56 KB | 31,68 KB | shell |
| CSS principal | 146,97 KB | 27,54 KB | shell |
| Leaflet | 150,10 KB | 43,61 KB | precarga/Mapa |
| jsPDF/cotización | 394,72 KB | 130,49 KB | solo al generar cotización |
| html2canvas | 202,67 KB | 48,06 KB | solo ruta PDF |
| canvg | 160,27 KB | 53,70 KB | solo ruta PDF |

El mayor peso inicial es Firestore. Retrasarlo solo para mejorar la pantalla pública de login no se aplicó: una PWA con sesión recordada necesita Firestore inmediatamente y crear una cascada `auth → descargar SDK → leer datos` empeoraría la carga útil. La solución futura correcta sería separar un shell público y uno autenticado con medición A/B, no esconder el SDK detrás de otro waterfall.

Assets más grandes:

- fondo móvil de login: 421.996 bytes, 1080×2340;
- fondo escritorio de login: 376.256 bytes, 2560×1441;
- gestión escritorio: 331.580 bytes;
- selector móvil: 209.009 bytes;
- héroes de ciudad: 128–181 KB WebP.

Lighthouse estimó solo 18 KB de ahorro en el logo visible. No se recomprimió: una versión de menor resolución degradaría pantallas Retina y no explica el LCP completo.

## Web Vitals y respuesta

Lighthouse móvil, build productivo local, red/CPU simuladas:

| Métrica | Resultado | Evaluación |
| --- | ---: | --- |
| Performance | 83/100 | Buena, con margen en pintura inicial |
| FCP | 3,0 s | Mejorable |
| LCP | 3,8 s | Mejorable |
| TBT | 0 ms | Excelente; no hay bloqueo relevante de CPU |
| CLS | 0 | Excelente |
| Speed Index | 3,0 s | Bueno |
| Tiempo interactivo | 3,8 s | Coincide con LCP |
| Trabajo main thread | 0,49 s | Bajo |
| Ejecución JS | 0,07 s | Baja |
| TTFB local | 24 ms | Solo servidor local |
| TTFB producción | 190 ms | Bueno para borde/red real |

INP no puede obtenerse de una navegación sin interacciones ni de CrUX sin muestra pública suficiente. TBT 0 ms y los cambios de pantalla productivos previamente observados con contenido visible en la primera inspección de 100 ms indican bajo riesgo de INP, pero no sustituyen percentiles reales. Recomendación: añadir `web-vitals` con muestreo anónimo y envío por lotes cuando exista un endpoint de observabilidad; no escribir cada métrica a Firestore.

## Memoria y CPU

- Backend: −23,8 MB RSS en arranque común por imports PDF bajo demanda.
- Avatar: intervalos/timeouts cancelados; promesas de compresión ya no actualizan un componente desmontado.
- Paneles: listener y caché global liberados al logout.
- URLs firmadas: expiradas podadas; caché borrada al logout; respuestas tardías invalidadas por generación de sesión.
- Service Worker: no cachea R2 ni datos privados; solo mismo origen público.
- No se encontraron observers, sockets o timers huérfanos adicionales.
- El mapa destruye/recrea sus recursos al desmontar y evita redibujar pines cuando el contenido no cambió.

## Rendimiento móvil y navegadores

- Safari usa detección automática de long polling y persistencia multi-tab.
- El visor PDF PWA conserva la navegación interna y evita la pantalla blanca inicial corregida previamente.
- El regreso al selector pinta desde memoria; la medición productiva anterior mostró contenido en la primera observación de 100 ms.
- La precarga prioriza seis rutas y luego descarga las secundarias en lotes de cuatro, evitando saturar una red móvil sin sacrificar cambios instantáneos.
- Los fondos tienen variantes móvil/escritorio y no se sirve el fondo de escritorio al layout móvil por CSS.
- No se ejecutó un dispositivo Chrome Android físico en esta máquina. La cobertura equivalente fue viewport móvil/Lighthouse, Chrome en layout móvil y revisión de media queries. Safari/PWA real fue probado durante los cambios anteriores del mismo ciclo.

## Escalabilidad

Supuesto de coste de clientes: 10 sesiones completas por día, 11 lecturas por sesión en un año, 22 escrituras/día por cliente. Son cifras de planificación, no una garantía contractual.

| Clientes | Lecturas/día | Escrituras/día | Selector admin | Estado técnico |
| ---: | ---: | ---: | ---: | --- |
| 100 | 11.000 | 2.200 | 1 agregado | Holgado |
| 500 | 55.000 | 11.000 | 1 agregado | Holgado; empieza a exceder gratis por poco |
| 1.000 | 110.000 | 22.000 | 1 agregado | Frontend holgado; vigilar cold starts y cron |
| 5.000 | 550.000 | 110.000 | 3 agregados | UI correcta; barridos completos y Analítica empiezan a dominar |
| 10.000 | 1.100.000 | 220.000 | 5 agregados | Selector correcto; backend O(N), Analytics y documentos históricos requieren rediseño |

Con cinco años (`Y = 5`) se usan aproximadamente 15 lecturas por sesión completa. Para 300 clientes × 10 sesiones/día: **45.000 lecturas/día y 6.600 escrituras/día**, aún dentro de 50.000/20.000 de la cuota gratuita diaria bajo ese patrón. Las aperturas del administrador no hacen que cada cliente se lea automáticamente: el selector de 300 clientes usa un agregado; solo se paga el detalle de los clientes que el administrador abre.

El primer cuello de botella exacto depende del crecimiento:

1. Mucho historial por un solo cliente: agregado de contratos/facturas y límite de 1 MiB.
2. Muchos clientes: barrido diario y regeneración completa del agregado global.
3. Admin abre Analítica con 5.000–10.000 usuarios: consulta lineal de `portalUsers`.
4. Miles de reportes diarios por cliente: listado/firma completa R2 y DOM sin virtualizar.
5. Picos simultáneos: cold starts y `maxInstances: 20`, antes que React o el selector.

## Seguridad

- Los PDFs/fotos privados se sirven por URLs firmadas con expiración.
- Facturas y campañas se validan contra propiedad; las keys desconocidas fallan cerradas.
- R2 no entra al CacheStorage.
- Logout borra CacheStorage y ahora también URLs firmadas/listeners en memoria.
- Las reglas prohíben escrituras directas sensibles.
- Hay tope de subida, validación de MIME/IDs/nombres y `maxInstances` global.
- No se detectaron secretos privados hardcodeados; la configuración Firebase cliente es pública por diseño.
- Riesgos pendientes: CSP, rate limit distribuido y advisories transitivos ya descritos.

## Verificación posterior a los cambios

- `npm run typecheck`: aprobado.
- `npm run build`: aprobado, 397 módulos.
- `npm test`: 46 archivos, 830 pruebas aprobadas.
- Pruebas específicas de coste/guardianes: aprobadas; se añadieron regresiones para la carga bajo demanda y limpieza de sesión.
- `npm --prefix functions run build`: aprobado.
- Generación PDF real desde el backend compilado: `%PDF-`, 54.355 bytes, 84 ms para reporte mínimo.
- Detectores de render: 0 riesgos directos, 0 en línea.
- `git diff --check`: aprobado.
- Reglas: el intento local fue bloqueado por ausencia de Java; no hubo fallo de aserciones. El job CI instala Java 21 y ejecuta las 75 pruebas con el emulador en cada push.
- Vulnerabilidades: frontend 0; backend 7 moderadas transitivas, riesgo contextual bajo y sin corrección compatible automática.

## Archivos modificados

- `src/components/screens/DetalleCampana.tsx`
- `src/config/firebase.ts`
- `src/hooks/usePanelesDisponibles.ts`
- `src/hooks/useSignedUrls.ts`
- `src/components/AvatarUploadModal.tsx`
- `functions/src/generarReporteCliente.ts`
- `functions/src/comprimirFacturaPdf.ts`
- `vite.config.ts`
- `src/logica-negocio/costeFirestore.test.ts`
- `docs/AUDITORIA-FINAL-2026-08-06.md`

## Recomendaciones futuras priorizadas

1. Instrumentar tamaño real de agregados y partirlos por año antes de 750 KB.
2. Convertir regeneraciones completas a actualizaciones incrementales con reconciliación paginada.
3. Separar Functions por codebase/familia para bajar los 132,5 MB de arranque común.
4. Añadir CSP en modo Report-Only y hacerla cumplir después de medir.
5. Actualizar Firebase Admin/Google Cloud Storage cuando desaparezca la cadena vulnerable transitiva.
6. Paginar reportes/facturas solo al superar 200–300 tarjetas reales.
7. Reemplazar Analítica lineal por agregados cuando supere aproximadamente 2.000–5.000 usuarios.
8. Recoger Web Vitals reales por lotes sin usar una escritura Firestore por evento.

No se recomienda ahora: Redux u otro estado global, virtualización sin listas grandes, más `memo` indiscriminado, reducir la precarga solicitada por el producto, duplicar datos en nuevos documentos que aumenten lecturas, ni comprimir assets a costa de calidad visual.
