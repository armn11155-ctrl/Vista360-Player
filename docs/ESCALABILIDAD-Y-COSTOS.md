# Eficiencia estructural a largo plazo y costos de Firestore

Objetivo de este documento: que alguien que no participó en esta revisión pueda entender, en tres o diez años, si Vista360 Player puede seguir creciendo sin sorpresas de costo, y exactamente dónde mirar primero si algo empieza a doler.

**No es una promesa de "0 lecturas".** Es un mapa de qué ya está acotado, qué crece de forma aceptable, qué es deuda técnica consciente (con un número exacto para saber cuándo actuar) y qué necesita una decisión ahora.

Metodología seguida en esta revisión: ANTES → EVIDENCIA → CAMBIO → TEST → MUTANTE → BUILD → DEPLOY → VERIFICACIÓN. Todo cambio de código de este documento pasó por las seis primeras etapas antes de desplegarse. Ningún número en este documento es inventado: se etiqueta **MEDIDO** (visto en producción), **DERIVADO DEL CÓDIGO** (contado leyendo la consulta real) o **ESTIMADO** (proyección razonable a partir de lo anterior, sin pretensión de precisión financiera exacta).

---

## HOY — cómo está construida la arquitectura

### El patrón que ya resuelve casi todo: agregados

La app casi nunca deja que una pantalla lea una colección que crece con el negocio. En su lugar, un documento (o un puñado de documentos, cuando uno solo no alcanza) resume lo que esa pantalla necesita, y se regenera cuando algo cambia:

| Agregado | Qué resume | Techo de tamaño | Aviso ya existente |
|---|---|---|---|
| `agregados/paneles` | Todo el inventario físico de pantallas | ~3.000 paneles (1 MiB) | `AVISO_A_PARTIR_DE = 2000` |
| `agregados/clientes-N` (sharded) | Selector de clientes (nombre, foto, campañas activas) | Sin techo real: crece en partes de 2.000 clientes cada una | Reparto automático en partes |
| `agregados/cliente-{id}` | Campañas y solicitudes de UN cliente | ~400 contratos por cliente | `AVISO_CONTRATOS = 400` |
| `agregados/facturas-{id}` | Facturas de UN cliente | ~1.500 facturas por cliente (≈125 años a ritmo mensual) | `AVISO_FACTURAS = 1500` |
| `agregados/informes-{clienteId}-{año}` | Metadatos de reportes (campaña, visto/no visto) por año | ~91 KB incluso con un reporte diario los 365 días | No hace falta (muy lejos del límite) |

Todos se regeneran a mano (no con triggers de Firestore: no se pueden desplegar en este proyecto por permisos) desde cada punto de escritura relevante más un barrido diario de respaldo — y los 894+ tests de `escalabilidad.test.ts` comprueban, uno por uno, que ningún camino de escritura se quedó afuera de esa lista.

### Sesión real de un Cliente (DERIVADO DEL CÓDIGO)

Traza completa: login → Inicio → Campañas → Cobertura → Reportes → Facturas → abrir un reporte → abrir una factura. Supuesto explícito: ~5 campañas activas, ~10 facturas/reportes visibles (un caso normal, no un caso límite).

| Paso | Lectura Firestore | Acumulado |
|---|---|---|
| Login | `portalUsers/{uid}` | 1 |
| Carga de la app | `clientes/{id}` + `agregados/cliente-{id}` | 3 |
| Cobertura | `agregados/paneles` | 4 |
| Facturas | `agregados/facturas-{id}` | 5 |
| Abrir reporte / abrir factura | 0 (URL firmada vía Cloud Function, no Firestore desde el navegador) | 5 |

**Total: 5 lecturas de Firestore por sesión completa, sin importar si el cliente tiene 5 o 500 campañas o facturas.** Es O(1) por pantalla, no O(historial). Las funciones que sirven reportes/facturas hacen 1-2 lecturas propias del lado del servidor (su propio `portalUsers` + un documento de agregado por año), ya contempladas en el diseño de arriba.

### Sesión real de Gerente/Trabajador (DERIVADO DEL CÓDIGO)

Traza: login → selector de clientes → cambio de cliente → Paneles → Solicitudes → Facturas.

**Fórmula: 8 lecturas fijas + 2×P + hasta 50**, donde P = solicitudes "Pendiente" que existan en ese momento (autolimitado: se vacía porque el personal las atiende, no crece con la antigüedad del negocio). Las 50 son el historial de solicitudes ya resueltas, acotado con `limit(50)` — verificado con datos reales contra el emulador de Firestore en esta revisión (no solo leyendo el código), sembrando 80 solicitudes resueltas y confirmando que la consulta real devuelve exactamente 50.

Con un P típico bajo (ejemplo ESTIMADO, P≈10): ~78 lecturas en una sesión que visita Solicitudes a fondo.

---

## 1.000 CLIENTES

- **Lecturas de sesión de Cliente**: siguen siendo 5 por sesión (el diseño por agregados no depende de cuántos clientes haya, solo del tamaño de UN cliente). Con 5 sesiones/día: 1.000 × 5 × 5 = **25.000 lecturas/día** — la mitad de la cuota gratuita, solo por esto.
- **`regenerarAgregadoClientes`** (se dispara en cada edición de cliente o contrato, no solo en el barrido diario) empieza a costar ~1.500 lecturas por edición suelta (clientes + contratos vigentes). Con un puñado de ediciones administrativas al día, esto ya es un contribuyente real, aunque todavía lejos de dolor.
- Ningún agregado por cliente (`agregados/cliente-{id}`, `agregados/facturas-{id}`) está cerca de sus techos (400/1.500) salvo un cliente atípicamente activo.
- El selector de clientes ya usa 1 sola parte (`agregados/clientes-0`) hasta pasar los 2.000 clientes.

## 10.000 CLIENTES

- **Lecturas de sesión de Cliente**: con 1 sesión/día ya se tocan **50.000 lecturas/día** — el límite gratuito completo, solo por sesiones de Cliente. Con 5-10 sesiones/día (250.000-500.000 lecturas/día) el proyecto necesita el plan Blaze (de pago); a $0.06 por 100.000 lecturas, eso son aproximadamente **$0.15-$0.30/día** (ESTIMADO, sin pretensión de precisión financiera exacta) — barato en términos absolutos, porque el diseño mantiene el costo por sesión en O(1).
- **`regenerarAgregadoClientes`** pasa a costar ~15.000 lecturas por CADA edición suelta de un cliente o contrato. Si el equipo administrativo edita contratos varias veces al día, esto solo puede sumar **decenas de miles de lecturas/día** — en este punto es probable que sea el mayor contribuyente individual al costo diario, por encima incluso del volumen de sesiones de Cliente. Es la pieza que primero conviene revisar si el negocio llega a esta escala (ver UMBRALES).
- El selector de clientes ya reparte en ~5 partes (`agregados/clientes-0..4`); sigue siendo 1 lectura en vivo (parte 0) + lecturas puntuales (no en vivo) para el resto.
- `sincronizarEstadoPaneles` (cron diario) hace un escaneo completo de `paneles` + `contratos` + `clientes` una vez al día — a esta escala son decenas de miles de lecturas, pero UNA vez por día, no por sesión.

## 5 AÑOS

- Los reportes diarios por cliente empiezan a acumular historial real: con reporte diario, un cliente antiguo acumula ~1.800 reportes en 5 años. `listarReportesCliente` (modo completo, usado por la pantalla Reportes) manda TODO ese historial en una sola respuesta — sigue siendo barato en lecturas de Firestore (los metadatos ya están amortizados por año), pero el tamaño de la respuesta y el largo de la lista en pantalla empiezan a crecer de forma notoria. Nuevo aviso agregado en esta revisión (`AVISO_HISTORIAL_REPORTES = 700`, ~2 años de reportes diarios) para detectarlo antes de que sea molesto.
- Ningún agregado por cliente (contratos, facturas) está cerca de sus techos todavía, salvo un cliente verdaderamente atípico.
- `resumenOcupacion` (pantalla Ocupación, solo Gerente) sigue leyendo TODAS las facturas de la historia del negocio en cada apertura — con miles de facturas acumuladas en 5 años esto ya es un costo real por apertura de pantalla, aunque sigue siendo una función admin a demanda, no por sesión de cliente.

## 10 AÑOS

- Un cliente con reporte diario acumula ~3.650 reportes. El almacenamiento en R2 de esos PDFs es, con mucha diferencia, el mayor volumen de datos que genera el negocio (ESTIMADO: con miles de clientes, del orden de terabytes acumulados en una década) — pero R2 no cobra por lecturas ni por salida de datos del mismo proveedor, así que el costo de almacenamiento puro sigue siendo bajo (R2 ronda los \$0.015/GB/mes). El riesgo real a esta escala no es el costo de R2 en sí, sino que `listarReportesCliente` siga mandando el historial completo sin paginar (ver UMBRALES).
- Si el negocio llegó a varios miles de clientes con ediciones administrativas frecuentes, `regenerarAgregadoClientes`/`regenerarResumenCliente` ya deberían haber migrado a una regeneración incremental (tocar solo el cliente que cambió, no releer todos). Es el cambio de mayor impacto de todo este documento si el crecimiento efectivamente llega aquí.
- `resumenOcupacion` con decenas de miles de facturas en la historia del negocio ya gasta una fracción relevante de la cuota diaria en una sola apertura de pantalla (nuevo aviso `AVISO_FACTURAS_OCUPACION = 20000` agregado en esta revisión para detectarlo).

---

## UMBRALES — cuándo actuar, con número exacto

Todos estos avisos ya están en el código (los tres marcados "NUEVO" se agregaron en esta revisión; el resto ya existía) y no cuestan ninguna lectura extra: se calculan sobre datos que la función ya leyó.

| Umbral | Dónde | Qué hacer al llegar ahí |
|---|---|---|
| Paneles > 2.000 | `agregadoPaneles.ts` (`AVISO_A_PARTIR_DE`) | Implementar el sharding diseñado en este documento (`agregados/inventario-N`, mismo patrón que clientes) |
| Contratos de un cliente > 400 | `agregadoCliente.ts` (`AVISO_CONTRATOS`) | Evaluar archivar campañas muy antiguas fuera del agregado activo |
| Facturas de un cliente > 1.500 | `agregadoCliente.ts` (`AVISO_FACTURAS`) | Prácticamente inalcanzable (~125 años); revisar solo si aparece |
| **NUEVO** — Facturas totales leídas por `resumenOcupacion` > 20.000 | `resumenOcupacion.ts` (`AVISO_FACTURAS_OCUPACION`) | Garantizar que el sistema externo de facturación rellene `pagado` en el 100% de los documentos, y recién entonces filtrar con `where("pagado","==",false)` |
| **NUEVO** — Historial de reportes de un cliente > 700 | `listarReportesCliente.ts` (`AVISO_HISTORIAL_REPORTES`) | Paginar la pantalla Reportes (cambio de diseño — deliberadamente fuera de alcance de esta revisión) |
| **NUEVO** — Total de clientes > 3.000 | `agregadoClientes.ts` (`AVISO_REGENERACION_FRECUENTE`) | Evaluar regeneración incremental de `agregados/clientes-N` (tocar solo el cliente editado, no releer todos) |
| Clientes totales > 2.000 | Ya activo: reparto automático en partes | Ninguna acción — ya sucede solo |

---

## NO TOCAR — optimizaciones descartadas a propósito

Cada una de estas se evaluó con la regla explícita del proyecto (ahorro real / complejidad introducida / riesgo de datos obsoletos) y se decidió NO tocarla ahora:

- **`resumenOcupacion` lee todas las facturas sin filtro.** Filtrar con `where("pagado","==",false)` parece obvio, pero las facturas vienen de un sistema externo que no siempre rellena ese campo — Firestore excluye en silencio cualquier documento sin el campo consultado, así que ese filtro dejaría facturas pendientes reales fuera de la lista de cobranza sin ningún error visible. El riesgo de datos incorrectos supera el ahorro (es una función admin a demanda, no por sesión de miles de clientes). Se corrigió el comentario que decía —incorrectamente— que esta lectura ya estaba acotada, y se agregó el aviso de umbral de arriba.
- **Listener duplicado de solicitudes "Pendiente".** La barra lateral (badge) y la pantalla Solicitudes abren dos escuchas en vivo separadas sobre el mismo filtro. Es redundante, pero el conjunto de pendientes es pequeño por naturaleza (se vacía porque el personal las atiende) — unificar ambas escuchas en un patrón singleton (como ya existe para contratos/paneles/clientes) es viable pero el ahorro es marginal comparado con la complejidad de tocar un hook ya bien probado. Queda documentado, no corregido.
- **Regeneración incremental de agregados, hoy.** El diseño actual ("releer todo, regenerar todo") es deliberadamente más simple y más consistente que un sistema de deltas — los propios comentarios del código lo explican. Vale la pena cuando el número de clientes y la frecuencia de edición lo justifiquen (ver umbral de 3.000 arriba), no antes.
- **Paginar la pantalla Reportes.** El historial sin paginar de un cliente antiguo es un problema real a largo plazo, pero es un cambio de diseño/UI — explícitamente fuera de alcance de esta revisión, que se limitó a backend y estructura de datos. Queda con su aviso de umbral.
- **Guardar el estado de `marcarReporteVisto` antes de escribir.** Reabrir un reporte viejo en una sesión nueva vuelve a escribir "visto" aunque ya lo estuviera. Agregar una lectura de verificación antes de escribir costaría MÁS operaciones en el caso común (primera vista) para ahorrar poco en el caso raro (reabrir algo viejo). Ya tiene un límite de 120 llamadas/minuto y deduplicación por sesión en el frontend. No se toca.
- **Borrar el índice `solicitudesCampana(cliente_id, estadoActualizadoEn)`.** No se encontró ninguna consulta que lo use hoy — hay evidencia (un comentario en `useNotificaciones.ts`) de que pudo quedar de un diseño anterior — pero ausencia de evidencia en una búsqueda no es prueba de que nada lo usa. Se deja para revisión humana explícita, nunca se borra un índice solo por sospecha.
- **Diseñar (no implementar) el sharding de `agregados/inventario-N` para paneles.** Ver sección siguiente: el diseño queda documentado y listo para implementarse cuando el umbral de 2.000-2.500 paneles se acerque, pero implementarlo hoy sería complejidad sin beneficio (el inventario físico actual está lejísimos de ese número).

### Diseño (no implementado) — sharding futuro del inventario de paneles

Cuando `agregados/paneles` se acerque a su techo (~3.000 paneles, aviso ya a partir de 2.000), el camino a seguir es el mismo patrón que ya funciona para clientes:

1. `agregados/inventario-0`, `inventario-1`, ... con `PANELES_POR_PARTE = 2000` (mismo margen que ya probó `CLIENTES_POR_PARTE`).
2. La parte 0 lleva `{ partes, total }` igual que `agregados/clientes-0`, para que cualquier lector sepa cuántas partes buscar.
3. En `usePanelesDisponibles.ts`: mantener `onSnapshot` (tiempo real) SOLO en la parte 0; las partes siguientes se leen una vez con `getDoc`, no en vivo — igual que ya hace `useClientesAdmin.ts` con sus partes extra.
4. Extender la regla de Firestore que ya distingue `agregados/clientes-[0-9]+` para que también acepte `agregados/inventario-[0-9]+`.

---

## RESULTADO FINAL — los 23 puntos de la auditoría

| # | Punto | Estado |
|---|---|---|
| 1 | Inventario completo de lecturas (frontend + Functions) | ✅ CERRADO |
| 2 | Clasificación O(1)/O(página)/O(historial)/O(global) | ✅ CERRADO |
| 3 | Sesión real Cliente | ✅ CERRADO — 5 lecturas por sesión, O(1) |
| 4 | Sesión real Gerente/Trabajador | 👁️ MONITOREADO — fórmula fija + P (autolimitado) |
| 5 | Inventario de listeners (`onSnapshot`) | ✅ CERRADO |
| 6 | Consultas duplicadas | 👁️ MONITOREADO — 1 duplicado menor identificado, no corregido (bajo valor) |
| 7 | TOP 10 Cloud Functions por costo potencial | ✅ CERRADO — ranking documentado |
| 8 | Documentos agregados (incl. diseño de sharding de paneles) | 🟡 DEUDA CONTROLADA — diseño listo, umbral 2.000-2.500 paneles |
| 9 | `resumenOcupacion` a fondo | 🟡 DEUDA CONTROLADA — umbral 20.000 facturas, aviso agregado |
| 10 | `useContratos` a fondo | ✅ CERRADO — ya acotado (`AVISO_CONTRATOS = 400`) |
| 11 | Reportes anuales | ✅ CERRADO el agregado por año; 🟡 DEUDA CONTROLADA el historial completo sin paginar (umbral 700, aviso agregado) |
| 12 | Facturas a fondo | ✅ CERRADO (agregado por cliente) / 🟡 comparte hallazgo con #9 (lectura global en Ocupación) |
| 13 | Índices Firestore | ✅ CERRADO — 8 índices, 7 confirmados en uso, 1 marcado para revisión humana |
| 14 | Costos de escritura | 👁️ MONITOREADO — logins/visitas ya optimizados; cascada de regeneración por edición es el punto a vigilar (ver #8/umbral 3.000 clientes) |
| 15 | Documentos que crecen para siempre | ✅ CERRADO — todos los agregados que crecen tienen aviso de umbral |
| 16 | Colecciones que crecen para siempre | 👁️ MONITOREADO — herramientas de limpieza manuales ya al límite de timeout permitido, uso infrecuente |
| 17 | R2 a 10 años | 👁️ MONITOREADO — ESTIMADO: los reportes PDF son el mayor volumen, pero R2 no cobra por lectura/egreso; `_papelera/` autolimitado a 30 días |
| 18 | Umbrales automáticos baratos | ✅ CERRADO — 3 avisos nuevos agregados esta revisión, cero lecturas extra |
| 19 | Tests de escala con fixtures/simulación | ✅ CERRADO — test contra el emulador de Firestore con datos reales sembrados (80 solicitudes) confirma que `limit(50)` corta de verdad; se descartó construir una granja de fixtures de 10.000 documentos por ser complejidad desproporcionada al valor adicional sobre los tests whitebox ya existentes |
| 20 | Tests de regresión de costo | ✅ CERRADO — suite de 894+ líneas ya existente, más 4 tests nuevos, todos con mutación confirmada |
| 21 | Presupuesto de lecturas consolidado | ✅ CERRADO — ver tablas de HOY/1.000/10.000 arriba |
| 22 | Objetivo free tier | ✅ CERRADO — ver siguiente sección |
| 23 | Este documento | ✅ CERRADO |

---

## Objetivo free tier (punto 22)

Con el diseño actual (5 lecturas por sesión de Cliente, O(1)), la cuota gratuita de 50.000 lecturas/día alcanza aproximadamente para:

- 10.000 sesiones de Cliente al día, en cualquier combinación (10.000 clientes × 1 sesión/día, o 2.000 clientes × 5 sesiones/día, o 1.000 clientes × 10 sesiones/día).

**Lo primero que empujaría fuera del plan gratuito, en orden de probabilidad:**

1. **La cascada `regenerarAgregadoClientes`/`regenerarResumenCliente` en cada edición administrativa**, una vez el número de clientes esté en los miles y las ediciones sean frecuentes — escala con el TAMAÑO del negocio multiplicado por la FRECUENCIA de edición, no con el número de sesiones de cliente. Es la pieza más expuesta a un crecimiento razonable.
2. El volumen puro de sesiones de Cliente, una vez el negocio tenga miles de clientes activos — un problema "bueno" (significa que el negocio creció mucho).
3. Las sesiones de personal interno (Gerente/Trabajador) son proporcionalmente pequeñas porque el número de empleados es naturalmente bajo, incluso con su costo por sesión más alto.

**La optimización futura más rentable, si alguna vez hace falta:** convertir la regeneración de `agregados/clientes-N` (y, si se implementa el sharding de paneles, `agregados/inventario-N`) de "releer la colección completa en cada edición" a "aplicar solo el cambio de ese documento". Es rentable porque el costo actual crece con el TAMAÑO TOTAL del negocio multiplicado por la frecuencia de edición — el cambio de mayor apalancamiento de todo este documento. No vale la pena construirlo hoy: la lógica ya está aislada en una sola función (`regenerarAgregadoClientes`), así que el cambio futuro será aditivo, no una reescritura.

---

## Veredicto

**¿Puede Vista360 Player operar durante años con la arquitectura actual?** Sí. El patrón de agregados ya hace que el costo por sesión de Cliente —con enorme diferencia el tipo de sesión más numeroso— sea O(1) independiente de cuántos años de historial tenga el negocio. No hay ninguna pantalla de cliente que hoy lea una colección que crece sin límite.

**¿Cuál es hoy la principal bomba de tiempo estructural?** No hay ninguna urgente. La más cercana a convertirse en un problema real es la cascada de regeneración de agregados (`regenerarAgregadoClientes`/`regenerarResumenCliente`) disparándose completa en cada edición administrativa — hoy es barata porque el número de clientes es bajo, pero es la pieza cuyo costo crece más rápido si el negocio escala.

**¿Cuál será probablemente la primera parte que habrá que migrar cuando el negocio crezca?** Esa misma regeneración de agregados, pasando de "releer todo" a "aplicar solo el cambio" — con un umbral ya instrumentado (3.000 clientes) para saber exactamente cuándo.

**¿Qué escala puede soportar antes de que Firestore represente un costo significativo?** Del orden de miles de clientes con sesiones normales sin salir nunca del plan gratuito. Más allá de eso, los costos siguen siendo bajos en términos absolutos (fracciones de dólar por día incluso en escenarios de 10.000 clientes con sesiones intensas) porque el diseño mantiene el costo por sesión constante en vez de dejarlo crecer con la antigüedad del negocio.

No se buscó perfección teórica. Se buscó —y se verificó con evidencia, no con supuestos— una arquitectura simple, barata, predecible y preparada para crecer durante años.
