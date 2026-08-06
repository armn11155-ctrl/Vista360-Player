# Auditoría de rendimiento — 6 de agosto de 2026

## Resultado

La aplicación conserva la precarga de todas sus pantallas después de iniciar sesión para que la navegación se sienta inmediata, pero ahora respeta prioridades y evita descargar el generador PDF hasta que se usa. También se eliminaron lecturas duplicadas y se añadieron cachés breves con deduplicación de solicitudes.

La compilación, TypeScript, los detectores de renders y la suite completa pasan sin errores.

## Cambios aplicados

- Analítica reutiliza la lista agregada de clientes que el selector ya cargó. Ya no vuelve a leer toda la colección `clientes`.
- Analítica mantiene el resultado 60 segundos y comparte solicitudes simultáneas.
- Reportes mantiene el listado de R2 60 segundos; una generación o recarga manual fuerza datos nuevos.
- Ocupación mantiene su resumen 120 segundos; la recarga manual siempre vuelve al servidor.
- Mi perfil mantiene el cálculo del espacio R2 cinco minutos y evita recorridos simultáneos del bucket.
- Los respaldos de clientes y facturas cortan la escucha agregada antes de abrir la escucha directa; nunca quedan dos listeners activos.
- La pantalla de Cotizaciones ya no incluye jsPDF al precargarse. El generador se importa solo al guardar o compartir el PDF.
- Las pantallas prioritarias se precargan juntas y las secundarias en lotes de cuatro. Se siguen precargando todas, sin competir las 19 por red y CPU al mismo tiempo.
- La autenticación ya no mantiene un listener sobre el mismo documento donde se guardan los contadores. El rol se comprueba al entrar y al volver a la PWA, con una vigencia de cinco minutos; las operaciones sensibles continúan protegidas por reglas y Functions.
- Las pantallas visitadas durante una navegación se agrupan en una sola actualización. El servidor conserva compatibilidad con las PWA antiguas que todavía envían una pantalla por llamada.
- La imagen móvil de acceso pasó de 968,918 a 421,996 bytes: 56.4% menos, conservando resolución suficiente para pantallas Retina.
- Analítica presenta 40 clientes inicialmente y añade más bajo demanda, evitando montar cientos de tarjetas de golpe.

## Tamaño y carga

| Recurso | Antes | Después | Efecto |
| --- | ---: | ---: | --- |
| Pantalla Cotizaciones (gzip) | 134.38 KB | 4.78 KB | 96.4% menos durante la precarga |
| Generador de cotización PDF | incluido con la pantalla | 130.53 KB bajo demanda | no compite con la navegación |
| Imagen móvil de acceso | 968,918 B | 421,996 B | 546,922 B menos |
| Riesgos directos/inline de render | — | 0 / 0 | verificadores del repositorio |

La carga pública inicial de JS y CSS continúa alrededor de 309 KB comprimidos. La mejora principal posterior al login es que aproximadamente 243 KB de dependencias PDF dejan de descargarse durante la precarga y solo llegan cuando el usuario crea una cotización.

## Lecturas de Firestore por sesión

Firestore factura documentos resultantes y puede sumar lecturas dependientes realizadas por las reglas de seguridad. Por eso se separa el trabajo propio de la aplicación del máximo conservador de reglas. Las reconexiones de listeners después de más de 30 minutos pueden volver a cobrar la consulta como nueva.

### Cliente

Inicio frío normal, con los agregados presentes:

- 1 `portalUsers/{uid}` para autenticar rol y vínculo.
- 1 cliente seleccionado.
- 1 agregado del cliente.
- 1 agregado de paneles.

Resultado de aplicación: **4 lecturas**. Con hasta una lectura dependiente de reglas por cada solicitud, el techo conservador es **aproximadamente 8 lecturas** en el inicio frío. Además se producen normalmente **2 escrituras** de analítica: acceso y lote de pantallas.

Cada pantalla distinta sigue contándose una vez por sesión, pero varias se envían juntas. Esas escrituras ya no producen lecturas de autenticación. Volver a una pantalla ya visitada no vuelve a escribir. Si la PWA se oculta, el lote pendiente se envía inmediatamente.

Abrir Facturas añade normalmente 1 documento agregado, más hasta 1 lectura dependiente de reglas. Abrir Reportes no hace lecturas directas de Firestore: usa la función/listado de R2, ahora reutilizado durante 60 segundos. Una sesión que recorre todas las pantallas del cliente queda normalmente alrededor de **8 a 12 lecturas conservadoras**, no 35–40.

Al volver a enfocar la PWA después de más de cinco minutos se comprueba de nuevo el rol: 1 lectura de resultado y hasta 1 dependiente de reglas. No se consulta en cada cambio de pantalla.

### Administrador

Sea:

- `A = ceil(clientes / 2000)`, cantidad de partes del agregado de clientes; hoy el caso normal es `A = 1`.
- `P = solicitudes pendientes devueltas`; una consulta vacía tiene un mínimo facturable de una lectura.

El inicio administrativo lee `A + max(P, 1) + 3` documentos de aplicación: usuario propio, agregado(s) de clientes, agregado de paneles, solicitudes pendientes y tareas. Las actualizaciones de analítica ya no añaden lecturas. Con `A = 1` y ninguna solicitud pendiente: **5 lecturas de resultado**; incluyendo un máximo conservador de reglas para las cinco solicitudes iniciales, **aproximadamente 10 lecturas**.

Seleccionar un cliente añade normalmente 2 documentos de resultado (cliente y agregado del cliente), o aproximadamente 4 contando el máximo conservador de reglas.

### Analítica administrativa

Sea `N` la cantidad de cuentas cliente y `C` la cantidad de clientes del negocio.

- Antes: `N + C` documentos en cada montaje.
- Ahora, entrada normal después del selector: `N` documentos.
- Reentrada dentro de 60 segundos: `0` documentos.
- Entrada directa excepcional sin selector: `N + A`, nunca toda la colección `clientes`.

El ahorro por apertura fresca normal es exactamente `C` lecturas de resultado. La consulta a `portalUsers` puede sumar una lectura dependiente de reglas.

### Ocupación

La primera carga ejecuta una función administrativa. Sea `Pₐ` paneles, `C` clientes, `K` contratos cuyo fin está dentro del último año y `F` facturas:

`1 + Pₐ + C + K + F` lecturas en el servidor.

La primera unidad corresponde a verificar al administrador. Reentrar dentro de 120 segundos cuesta **0 lecturas adicionales** porque no se vuelve a llamar a la función. La recarga manual sí repite el cálculo. El historial de facturas sigue siendo el componente que más puede crecer; cambiarlo requiere confirmar la completitud de `estado`, `pagado` y fechas de los registros históricos antes de filtrar sin riesgo de ocultar una deuda.

## Costo

La base `(default)` usa Firestore Native Standard en `nam5` y tiene cuota gratuita. A la fecha de la auditoría, la tarifa publicada para lecturas Standard aplicable es **USD 0.03 por 100,000 lecturas**, después de **50,000 lecturas gratuitas por día**. Las escrituras son **USD 0.09 por 100,000**, después de 20,000 gratuitas por día.

- 10 lecturas fuera de cuota: USD 0.000003.
- 100 lecturas fuera de cuota: USD 0.00003.
- 1,000,000 de lecturas fuera de cuota: USD 0.30.

Usando 10 lecturas conservadoras por sesión completa, 1,000 sesiones serían unas 10,000 lecturas, todavía dentro de la cuota diaria si no existen otras cargas importantes. La consola de facturación sigue siendo la fuente definitiva porque las reconexiones, cambios en tiempo real y evaluaciones de reglas dependen del uso real.

Fuentes oficiales:

- [Precios de Cloud Firestore](https://cloud.google.com/firestore/pricing)
- [Cuotas y límites de Firestore](https://firebase.google.com/docs/firestore/quotas)
- [Explicación de facturación de listeners y reglas](https://firebase.google.com/docs/firestore/pricing)

## Verificación ejecutada

- `npm run typecheck`
- `npm test`: 45 archivos, 822 pruebas.
- `npm --prefix functions run build`: Cloud Functions correctas.
- `node scripts/detectar-renders.mjs`: 0 riesgos directos y 0 inline.
- `node scripts/detectar-riesgos-render.mjs`: 0 riesgos.
- `npm run build`: compilación de producción correcta.
- Navegador local: pantalla de acceso correcta y consola sin errores ni advertencias.
