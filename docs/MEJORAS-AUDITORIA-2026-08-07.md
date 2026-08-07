# Implementación de mejoras posteriores a la auditoría

Fecha: 7 de agosto de 2026 (America/Lima)

## Resultado ejecutivo

Se aplicaron únicamente dos grupos de cambios de bajo riesgo y beneficio comprobable:

1. carga diferida del SDK de AWS/R2 en Cloud Functions y reutilización del cliente S3 por instancia caliente;
2. eliminación de código muerto demostrada por TypeScript y activación permanente de los guardianes `noUnusedLocals` y `noUnusedParameters` en frontend y backend.

No se modificaron la lógica de negocio, la interfaz, la autenticación, la estructura de Firestore, la caché, la paginación ni los agregados. No se añadió ninguna lectura, escritura o escucha.

## Cambios aplicados

### 1. AWS/R2 bajo demanda en Cloud Functions

#### Problema

El índice común de Functions importaba `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` durante el arranque de todas las funciones. Una función que solo registraba una visita o leía Firestore pagaba memoria y tiempo de AWS aunque nunca usara R2. Además, cada operación construía un cliente S3 nuevo.

#### Solución

- `r2Storage.ts` carga S3 y el presigner mediante `import()` solo en la primera operación R2.
- La promesa de carga se comparte para evitar imports concurrentes duplicados.
- El cliente S3 se reutiliza durante la vida de la instancia caliente.
- Listados y borrados se centralizaron en el adaptador R2; ya no existen imports runtime directos de AWS en otros módulos.
- Se añadieron tres pruebas de regresión para impedir que un import estático vuelva a introducir el coste de arranque.

#### Beneficio medido

- RSS del arranque común anterior: **132,5 MB**.
- RSS después del cambio: **aprox. 106–110 MB**.
- Reducción: **22,5–26,5 MB**, aproximadamente **17–20%** adicional.
- En una medición secuencial sin carga paralela, la importación mediana local bajó de los **~510 ms** documentados a **~217 ms**. Es una medición local del módulo, no una promesa de latencia de red en producción.
- La primera operación R2 carga aproximadamente **13 MB** una sola vez; las siguientes reutilizan módulo y cliente.

#### Compatibilidad

Se conservan las mismas claves, prefijos, paginación `ContinuationToken`, firmas, tiempos de expiración, `Content-Disposition`, borrado a mejor esfuerzo y manejo de errores. Una firma real con credenciales de prueba produjo una URL `X-Amz-Signature` válida sin realizar una petición de red.

### 2. Código muerto y guardianes TypeScript

#### Problema

Los chequeos estrictos detectaban 16 diagnósticos en frontend y otros 16 en Functions: imports no usados, interfaces heredadas, parámetros internos innecesarios y una constante de logo sin referencias. El build los toleraba y permitía que la deuda siguiera creciendo.

#### Solución

- Se retiraron exclusivamente símbolos sin referencias demostrados por el compilador.
- Se eliminó un pipeline privado de miniaturas que no tenía ningún caller ni export.
- Se conservaron props públicas todavía recibidas por compatibilidad, renombrando su binding interno con `_`.
- Se activaron `noUnusedLocals` y `noUnusedParameters` en ambos `tsconfig`.

#### Beneficio medido

- Diagnósticos de código no usado: **32 → 0**.
- Código neto del cambio completo: menos líneas muertas, con guardián automático en cada build futuro.
- Bundle inicial: **101,55 KB raw / 31,67 KB gzip**, esencialmente igual al anterior. Rollup ya eliminaba estos símbolos; no se atribuye una reducción de descarga inexistente.

## Firestore, caché y paginación

- Escuchas `onSnapshot` de runtime antes: **15**.
- Escuchas `onSnapshot` de runtime después: **15**.
- Nuevas operaciones `getDoc/getDocs/getAll/setDoc/updateDoc/deleteDoc/addDoc/onSnapshot`: **0**.
- Lecturas: **sin aumento**.
- Escrituras: **sin aumento**.
- Listeners: **sin aumento**.
- Caché de paneles, facturas, contratos y URLs firmadas: **sin cambios funcionales**.
- Paginación Firestore y R2: **sin cambios funcionales**; el listado R2 conserva exactamente el token de continuación.

## Memoria, CPU y bundle

| Área | Resultado |
| --- | --- |
| Memoria de arranque de Functions | −22,5 a −26,5 MB RSS (≈−17 a −20%) |
| Tiempo local de importación común | mediana secuencial ~510 → ~217 ms |
| Cliente S3 | uno por instancia caliente en vez de uno por operación |
| Bundle inicial frontend | 101,55 KB raw / 31,67 KB gzip; sin cambio material |
| `dist` completo | 5.524 KiB; sourcemaps continúan desactivados |
| CPU frontend | sin cambio medible; no se añadieron cálculos ni renders |

## Revisión de recursos y renders

Se revisaron nuevamente timers, `ResizeObserver`, listeners de ventana/documento, mapas Leaflet, Blob URLs, cachés de módulo y hooks con `onSnapshot`.

- Los observers de mapas se desconectan y las instancias Leaflet se destruyen.
- Los listeners de hooks tienen limpieza al desmontar.
- Los timers de modales y carga se cancelan.
- Los timers de Blob que permanecen unos segundos son intencionales para permitir descargas en Safari y revocan la URL al finalizar; no se cambiaron.
- Las pruebas de riesgos de render y escalabilidad siguen aprobando.
- No se encontró otro cambio de memoria/re-render con beneficio suficiente para justificar el riesgo.

## Validaciones

- `npm run typecheck`: aprobado.
- `npm run build`: aprobado, 397 módulos.
- `npm --prefix functions run build`: aprobado.
- `npm test`: **46 archivos, 835 pruebas aprobadas**.
- Pruebas nuevas de lazy AWS: **3 aprobadas**.
- `git diff --check`: aprobado.
- Conteo de listeners: 15 antes / 15 después.
- Guardián de operaciones Firestore añadidas: 0.
- Firma R2 local: aprobada.
- Consola del build local: 0 errores y 0 warnings de la aplicación en la superficie accesible.

### Límite de la validación visual

El preview local no dispone de las variables públicas de Firebase que CI inyecta durante el build, por lo que solo puede mostrar la pantalla segura de configuración faltante. El navegador integrado fue bloqueado por la protección de Cloudflare antes del render productivo. La extensión de Chrome está instalada y habilitada, pero macOS no permitió abrir Chrome porque la sesión gráfica estaba cerrada/bloqueada. Por ello no se declara una prueba autenticada final de “cambiar cliente” en este ciclo. No se modificó ninguna pantalla ni navegación; esa cobertura queda además protegida por la suite existente y el CI posterior al push.

## Archivos modificados

### Cloud Functions/R2

- `functions/src/r2Storage.ts`
- `functions/src/obtenerEspacioR2.ts`
- `functions/src/limpiarArchivosHuerfanos.ts`
- `functions/src/listarReportesCliente.ts`
- `functions/src/eliminarReporteCliente.ts`
- `functions/src/eliminarFactura.ts`

### Limpieza y guardianes

- `tsconfig.json`
- `functions/tsconfig.json`
- `src/App.tsx`
- `src/components/DialogosProvider.tsx`
- `src/components/NotifPrompt.tsx`
- `src/components/screens/Accesos.tsx`
- `src/components/screens/DetalleCampana.tsx`
- `src/components/screens/Inicio.tsx`
- `src/components/screens/SolicitudesCampana.tsx`
- `src/config/r2.ts`
- `src/hooks/useFacturas.ts`
- `src/hooks/useNotificaciones.ts`
- archivos backend donde se retiraron imports/interfaces sin uso;
- tres archivos de pruebas con imports muertos;
- `src/logica-negocio/escalabilidad.test.ts`.

## Recomendaciones pendientes

No se implementaron porque son cambios arquitectónicos, de seguridad que requieren observación previa o mejoras prematuras prohibidas por el alcance:

1. Particionar agregados por año antes de aproximarse a 750 KB/1 MiB.
2. Convertir regeneraciones completas en actualizaciones incrementales y reconciliación paginada.
3. Separar Functions por codebase/familia; el lazy import reduce el coste actual, pero no sustituye esa migración a gran escala.
4. Añadir CSP primero en modo Report-Only y medir Firebase/R2/OpenStreetMap antes de hacerla obligatoria.
5. Actualizar la cadena transitiva de Firebase Admin cuando Google publique versiones compatibles corregidas.
6. Paginar/virtualizar reportes y facturas solo al superar aproximadamente 200–300 tarjetas reales.
7. Sustituir Analítica lineal por agregados cuando alcance miles de usuarios.
8. Instrumentar Web Vitals por lotes mediante observabilidad, sin una escritura Firestore por evento.

Estas recomendaciones se mantienen documentadas, pero implementarlas ahora violaría la condición de cambios pequeños o añadiría complejidad sin beneficio actual medible.
