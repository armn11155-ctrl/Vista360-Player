# CSP, HSTS y CORS en Vista360 Player

Estado tras la auditoría. Lo que ya estaba bien se marca como **VERIFICADO** y no se tocó.

Dónde vive cada cosa:

- **CSP y HSTS**: `public/_headers` (Cloudflare Pages lo lee y las aplica en el borde).
- **CORS del bucket R2**: `scripts/set-r2-cors.mjs`, que se ejecuta desde el workflow de despliegue.
- **CORS de Cloud Functions**: lo gestiona Firebase; ver §3.3.

Todo esto está fijado por pruebas permanentes en `src/logica-negocio/cabecerasWeb.test.ts`.

---

## 1. CSP (Content-Security-Policy)

### 1.1 Punto de partida

**No había CSP.** El archivo `_headers` ya traía `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy` — todo eso correcto — con un comentario que dejaba la CSP explícitamente pendiente "para una pasada aparte". Esta es esa pasada.

### 1.2 Estrategia: Report-Only primero, ahora en enforcement

Se hizo en dos fases a propósito, porque una CSP mal armada rompe la aplicación en silencio:

1. **Fase Report-Only** (fase anterior): la política estricta se publicó como `Content-Security-Policy-Report-Only`. El navegador no bloqueaba nada, solo anotaba en consola lo que habría bloqueado.
2. **Fase de verificación** (esta): se recorrió producción con un navegador real (Chromium headless), se recogieron las violaciones, se corrigieron **en el código** —nunca relajando la política— y se validó el resultado con la política ya en enforcement antes de publicarla.
3. **Ahora**: una sola cabecera `Content-Security-Policy`, aplicada. No queda ninguna política en Report-Only: tener las dos a la vez solo consigue que nadie sepa cuál manda.

#### Lo que la fase Report-Only encontró (y que leer el código NO había detectado)

| Hallazgo | Por qué rompía | Cómo se arregló |
|---|---|---|
| `index.html` tenía `style="..."` en `<html>` y `<body>` | Los hashes de CSP **no cubren atributos** `style`, solo bloques `<style>`. Habrían quedado bloqueados y la pantalla saldría sin fondo | Se movieron al bloque `<style>` de `<head>`, que sí va permitido por hash. Mismo resultado visual |
| `descargarArchivo.ts` abría la pestaña del PDF con `document.write` y un `<style>` dentro | Esa pestaña se abre con `window.open("")` desde nuestro origen, así que **hereda nuestra CSP**. El `<style>` no se puede hashear (se arma en ejecución) → PDF sin fondo ni tamaño | Los estilos se aplican por **CSSOM** (`el.style.x = ...`), que la CSP no bloquea |
| `Cobertura.tsx` armaba los popups de Leaflet con `style="..."` para la foto y el color del estado | Mismo motivo: atributos `style` | Los valores viajan en `data-*` y se aplican por CSSOM en `popupopen` (`aplicarEstilosPopup`) |
| El hash de `index.html` estaba **mal calculado** | Un comentario HTML que mencionaba la etiqueta de estilo desplazaba el inicio del bloque en el extractor. Un hash mal calculado no se nota hasta que el navegador bloquea en producción | El extractor (script y prueba) ahora quita los comentarios HTML antes de buscar |
| Cloudflare inyecta el beacon de Web Analytics | No es código nuestro: lo añade Cloudflare en el borde | **NO se autoriza** (ver §1.5) |

Ninguno se arregló abriendo la política. No se añadió `unsafe-inline`, ni `unsafe-hashes`, ni ningún dominio de terceros.

### 1.3 La política completa y de dónde sale cada origen

| Directiva | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Todo lo no declarado queda cerrado |
| `script-src` | `'self'` | Solo nuestros bundles compilados; no hay scripts en línea |
| `style-src` | `'self'` + 2 hashes | Los bloques `<style>` de `index.html` y `404.html` |
| `img-src` | `'self' data: blob:` + R2 + tiles | Avatares y fotos (R2, URL firmada), mapa de cobertura, imágenes generadas |
| `font-src` | `'self' data:` | No se usan Google Fonts ni ninguna fuente externa (verificado) |
| `connect-src` | 7 orígenes concretos | Ver abajo |
| `frame-src` | `https://www.google.com` | El iframe del mapa en Detalle de campaña |
| `worker-src` | `'self'` | El service worker de la PWA y el worker local de PDF.js |
| `manifest-src` | `'self'` | `manifest.json` |
| `media-src` | `'self' blob:` | — |
| `object-src` | `'none'` | No se permiten plugins, objetos ni visores PDF nativos incrustados |

Los siete orígenes de `connect-src`, todos verificados en el código:

- `firestore.googleapis.com` — base de datos
- `identitytoolkit.googleapis.com` — login
- `securetoken.googleapis.com` — renovación del token de sesión
- `firebaseinstallations.googleapis.com` y `fcmregistrations.googleapis.com` — notificaciones push
- `*.cloudfunctions.net` — las Cloud Functions del proyecto
- `*.r2.cloudflarestorage.com` — PDFs, avatares y fotos por URL firmada

Los dos comodines son **subdominio de un dominio concreto**, no comodines sueltos. Hay una prueba que rechaza cualquier valor tipo `*` o `https:` a secas.

### 1.4 Lo que se decidió NO permitir (y por qué se pudo)

- **`'unsafe-eval'` — no hace falta.** Se revisó el bundle compilado: los únicos `.eval(` que aparecen son métodos de un objeto interno de Firestore, no el `eval()` global. No hay `new Function(` en ningún sitio.
- **`'unsafe-inline'` — no hace falta.** Los bloques en línea que quedan van permitidos **por hash**, uno por bloque. Un hash permite exactamente ese contenido y nada más; `'unsafe-inline'` permitiría cualquier cosa inyectada, que es justo el ataque del que la CSP debería proteger.
  Los estilos en línea de React (`style={{...}}`) **no** necesitan `'unsafe-inline'`: React los aplica por CSSOM (`node.style.x = ...`), y la CSP solo bloquea el atributo `style` del HTML y las etiquetas `<style>`.
- **Comodines en `script-src`/`connect-src` — no hay ninguno.**

### 1.5 Cloudflare Web Analytics: bloqueado a propósito

Cloudflare Pages inyecta en el borde `static.cloudflareinsights.com/beacon.min.js` más un script en línea que lo carga. No está en nuestro código y **no lo necesita ninguna función de Vista360**.

Decisión: **no se autoriza**. Meter un dominio de terceros en `script-src` es exactamente lo que esta política existe para evitar.

- **Efecto real**: Cloudflare Web Analytics deja de registrar visitas, y el navegador anota la violación en la consola de cada visita.
- **Si molesta el ruido** (o si se quiere recuperar la métrica): la decisión correcta es **apagar Web Analytics en el panel de Cloudflare**, no abrir la CSP. Cloudflare Dashboard → el sitio → Web Analytics → desactivar.

### 1.6 Visor PDF sin relajación de `object-src`

- **Qué dependencia**: `visor-pdf.html` y `src/visor-pdf.ts`.
- **Cómo funciona**: PDF.js, empaquetado localmente, descarga el archivo desde la URL firmada y dibuja cada página en un `<canvas>`.
- **Por qué**: Safari podía dejar completamente gris el visor nativo basado en `<iframe>`/`<embed>`. El renderizado en canvas es consistente y permite mantener `object-src 'none'`.
- **Seguridad**: no se permite ningún CDN, script en línea, `iframe`, `<embed>` ni plugin. El worker de PDF.js también se sirve desde el mismo origen.

Las pruebas comprueban tanto la presencia del renderizado en canvas como la ausencia de `<iframe>` y `<embed>`.

### 1.7 Los hashes se pueden desincronizar (y por eso hay una prueba)

Si alguien edita un bloque `<style>` en línea y no actualiza el hash, el navegador deja de aplicarlo: la pantalla se ve mal **en producción y en silencio**.

Para regenerarlos:

```bash
node scripts/hashes-csp.mjs
```

y copiar la salida a `public/_headers`. La prueba `cabecerasWeb.test.ts` los recalcula desde los HTML reales y falla si no coinciden, así que esto no puede pasar desapercibido en CI. Hay además una prueba que falla si aparece un HTML estático nuevo que nadie metió en la lista.

### 1.8 Si algo se rompe: cómo diagnosticar (y cómo NO)

1. Abre la consola del navegador (F12 → Console) y busca `Refused to...`.
2. Identifica **qué** recurso, **de qué** dominio y **qué función legítima** lo necesita.
3. Agrega **solo ese dominio** a la directiva que corresponda. Nunca `*`, nunca `https:`, nunca `unsafe-*`.
4. Si el recurso no lo necesita ninguna función de Vista360, **no lo autorices**: averigua por qué se carga.

**Vuelta atrás de urgencia**: renombra la cabecera a `Content-Security-Policy-Report-Only` en `public/_headers` y despliega. Deja de bloquear al instante sin perder la política. (Hay una prueba que falla si se queda así, para que no se olvide.)

## 2. HSTS

### 2.1 Lo que ya estaba (VERIFICADO)

Comprobado contra producción real antes de tocar nada:

- `http://vista360player.pe` → **301** a `https://vista360player.pe` ✅
- `http://www.vista360player.pe` → **301** a `https://www.vista360player.pe` ✅
- Ambos dominios sirven HTTPS correctamente ✅

### 2.2 Lo que faltaba

**No había cabecera `Strict-Transport-Security`.**

Por qué importa aunque ya haya redirección 301: ese primer pedido a `http://` **viaja en claro**. Es la ventana que se ataca en una wifi pública (el clásico *SSL stripping*). Con HSTS, el navegador reescribe la petición a `https://` **antes de salir a la red**: no hay primer salto que interceptar.

Ahora se envía:

```
Strict-Transport-Security: max-age=31536000
```

### 2.3 Por qué SIN `includeSubDomains` ni `preload`

A propósito, y no por olvido:

- **`includeSubDomains`** obligaría a HTTPS a **todo** subdominio de `vista360player.pe`, incluidos los que no existen todavía. Hoy solo resuelven el dominio raíz y `www`, así que activarlo no rompería nada *ahora* — pero dejaría una trampa puesta para el día que alguien levante un subdominio interno sin certificado, y el navegador se negaría a abrirlo durante un año.
- **`preload`** es prácticamente irreversible: hay que pedirle a Google que saque el dominio de la lista y esperar a que la gente actualice el navegador.

**Aviso honesto sobre el alcance de la comprobación**: verifiqué los subdominios probando los nombres habituales (`app`, `admin`, `api`, `erp`, `panel`, `cdn`, `mail`, `dev`, `staging`…) y ninguno resuelve. No leí la zona DNS. Antes de activar `includeSubDomains` conviene mirar la lista real de registros DNS en el panel de Cloudflare.

### 2.4 Plan por fases para subir (opcional)

1. **Ahora**: `max-age=31536000` sin `includeSubDomains`. ← estado actual
2. **Cuando quieras**: revisa la zona DNS en Cloudflare y confirma que **todos** los subdominios existentes sirven HTTPS. Entonces añade `includeSubDomains`.
3. **Solo si el punto 2 lleva meses estable**: añade `preload` y registra el dominio en https://hstspreload.org. Es un compromiso a largo plazo.

Resultado buscado: **HTTP → HTTPS obligatorio → HSTS → el navegador ya ni intenta HTTP.** Esa cadena está completa hoy para el dominio raíz y `www`.

---

## 3. CORS

### 3.1 Bucket R2 — APLICADO

**Estaba así**: `AllowedOrigins: ["*"]` con métodos `GET`, `HEAD`, `PUT`.

**Ahora, en el bucket real `vista360-evidencias`** (aplicado a mano desde Cloudflare Dashboard → R2 → Settings → CORS Policy, porque el token del workflow solo tiene permiso *Object Read & Write* y cambiar la configuración del bucket exige *Admin*; se dejó el token como estaba a propósito):

```json
[
  {
    "AllowedOrigins": [
      "https://vista360player.pe",
      "https://www.vista360player.pe",
      "https://vista360-player.pages.dev",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Type", "Content-Length", "Content-Disposition"],
    "MaxAgeSeconds": 3600
  }
]
```

Es exactamente la política de `scripts/set-r2-cors.mjs`, sin inventar dominios. Confirmado tras recargar el panel: el `*` ya no existe y quedan solo esos cinco orígenes.

**Verificado en producción**: una descarga real de un reporte PDF desde la app dio `HTTP 200`, 244 059 bytes y cabecera `%PDF-` — es decir, la lectura de R2 por URL firmada sigue funcionando con la allowlist puesta.

**Nota sobre cómo probar esto**: R2 solo envía cabeceras CORS en respuestas autorizadas. Una petición sin firma válida recibe 401/403 **sin** `Access-Control-Allow-Origin`, y el navegador lo reporta como `Failed to fetch`. Por eso no se puede comprobar el `PUT` con una petición inventada: hace falta una URL firmada de verdad, es decir, una subida real.

**Al mantenerlo**: si cambia el dominio del portal, hay que agregarlo a la lista **y** volver a aplicarla en el bucket, o las subidas fallarán con un falso *"sin conexión"* (`fetch` no distingue un bloqueo de CORS de una caída de red).

### 3.2 Cabecera `access-control-allow-origin: *` del propio sitio

Cloudflare Pages la envía por defecto en el HTML y los assets estáticos. **No se tocó**: son archivos públicos sin credenciales ni cookies, y el navegador no adjunta nada sensible a esas peticiones. Quitarla no aporta seguridad y puede romper la carga de módulos con `crossorigin`.

### 3.3 Cloud Functions — VERIFICADO, NO HACE FALTA TOCAR

- Las ~52 funciones `onCall` usan el CORS por defecto de Firebase (refleja el origen que pide). **No es un riesgo**: una función `onCall` exige el ID token de Firebase en la cabecera `Authorization`, y ese token vive en el IndexedDB de nuestro origen — una página de otro dominio **no puede leerlo**. Como no se usan cookies de sesión, tampoco hay CSRF posible: sin token, `exigirCuentaActiva()` rechaza con `unauthenticated`.
- Restringir el CORS función por función obligaría a tocar los ~52 archivos (`cors` no se puede fijar en `setGlobalOptions`, solo por función) a cambio de una ganancia de seguridad nula. Se descartó conscientemente.
- La **única** función `onRequest` (`sincronizarEstadoPaneles`) es servidor-a-servidor: solo acepta `POST`, exige la cabecera `x-cron-secret` y **no envía ninguna cabecera CORS**, así que ningún navegador puede leer su respuesta desde otro origen. Correcto tal como está.

---

## 4. Resumen

| Capa | Antes | Ahora |
|---|---|---|
| CSP | No existía | **Política estricta completa en enforcement** (una sola, sin Report-Only) |
| `unsafe-eval` / `unsafe-inline` | — | Ninguno de los dos hace falta |
| HSTS | **Ausente** | `max-age=31536000` (sin `includeSubDomains`/`preload`, a propósito) |
| HTTP → HTTPS | Ya funcionaba | VERIFICADO — no se tocó |
| CORS R2 | `*` | Lista blanca de 5 orígenes, **aplicada en el bucket real** (§3.1) |
| CORS Cloud Functions | Por defecto | VERIFICADO — no hace falta tocar |
| X-Frame-Options, nosniff, Referrer, Permissions | Ya estaban bien | VERIFICADO — no se tocaron |

---

## 5. Verificación en producción con navegador real

Todo lo de abajo se comprobó contra `https://vista360player.pe` **con la CSP ya en enforcement**, usando Chromium (no leyendo el código, no suponiendo).

### 5.1 Lo que funciona

| Comprobación | Resultado |
|---|---|
| La app renderiza (login visible, `#root` con contenido) | ✅ |
| Violaciones CSP de código propio | ✅ **cero** |
| Firebase Auth (login con credenciales inválidas a propósito) | ✅ responde "Usuario o contraseña incorrectos" → el origen está permitido |
| Firestore sin sesión | ✅ HTTP 403 → contestan sus Rules, no la CSP |
| Cloud Function sin token | ✅ HTTP 401 → contesta nuestra autorización, no la CSP |
| Service worker registrado + `manifest.json` | ✅ |
| `*.r2.cloudflarestorage.com` (subdominio, el patrón real) | ✅ sin violación CSP |
| `www.google.com` en iframe (mapa de Detalle de campaña) | ✅ permitido |
| Pestaña del PDF con PDF.js local | ✅ 2 páginas reales renderizadas en canvas, zoom operativo y URL limpia |
| Popup del mapa con estilos por CSSOM | ✅ foto y color aplicados |

Detalle sobre los tiles del mapa: `tile.openstreetmap.org` está en **`img-src`**, no en `connect-src`, porque Leaflet los carga como `<img>`. Un `fetch()` a ese host sí da violación de `connect-src` — y es correcto: la app nunca hace `fetch` de tiles. La carga como `<img>` no genera ninguna violación.

### 5.2 Pruebas de ataque (todas con la CSP aplicada)

| Ataque | Esperado | Resultado |
|---|---|---|
| Cargar script desde dominio no autorizado (`cdn.jsdelivr.net`) | bloqueado | ✅ **BLOQUEADO** por `script-src` |
| Inyectar `<script>` en línea (lo que haría un XSS) | bloqueado | ✅ **BLOQUEADO** por `script-src` |
| Inyectar `<base href>` externo (secuestro de rutas relativas) | bloqueado | ✅ **BLOQUEADO** por `base-uri` |
| Embeber la app en un iframe externo | bloqueado | ✅ `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Llamar una Cloud Function sin token | rechazado | ✅ HTTP 401 |
| Leer Firestore sin sesión | rechazado | ✅ HTTP 403 |

Sobre `eval()`: la política **no incluye** `'unsafe-eval'`, y el bundle compilado no usa `eval()` global ni `new Function()`. La comprobación automatizada de esto es *inconclusa por construcción*: el arnés de pruebas ejecuta código vía el protocolo de depuración del navegador, que se salta la CSP a propósito. Lo que sí está verificado es que la política no lo permite y que la aplicación no lo necesita.

### 5.3 Lo que NO se pudo verificar desde aquí

Requieren una **sesión iniciada** (no tengo credenciales, y no debo introducir contraseñas):

- Abrir un PDF real de R2 desde la cuenta. El visor sí se verificó con un PDF real local de dos páginas; falta únicamente el recorrido autenticado contra R2.
- Subir una foto o cambiar un avatar (PUT firmado a R2).
- Ver imágenes reales de R2 y los tiles del mapa dentro de la app.

Las directivas que esas acciones necesitan (`img-src`/`connect-src` con `*.r2.cloudflarestorage.com`, `img-src` con los tiles y `frame-src` con Google) **sí** están verificadas una por una arriba. Lo que falta es el recorrido autenticado con datos de la cuenta.

**Recorrido de 3 minutos para cerrarlo** (con F12 → Console abierta, buscando `Refused to`):

1. Entrar como Gerente → Reportes → abrir un PDF → descargarlo.
2. Facturas → abrir una factura.
3. Subir una foto en un reporte y cambiar el avatar.
4. Cobertura → ver que salgan los tiles y abrir el popup de un pin (foto + color del estado).
5. Detalle de campaña → que cargue el mapa de Google.

Si aparece algo, está en §1.8 cómo diagnosticarlo, y la vuelta atrás es renombrar la cabecera a `Content-Security-Policy-Report-Only` y desplegar.
