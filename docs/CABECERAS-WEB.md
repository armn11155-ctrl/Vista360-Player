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

### 1.2 Estrategia en dos capas

Una CSP mal armada rompe la aplicación en silencio y sin forma de probarlo antes de publicar. Por eso va en dos partes:

**Capa 1 — APLICADA (`Content-Security-Policy`).** Solo tres directivas, elegidas porque no pueden romper nada, comprobado una por una:

```
frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- `frame-ancestors 'none'` — equivalente moderno del `X-Frame-Options: DENY` que ya estaba. Se dejan los dos: hay navegadores que ya solo miran CSP.
- `base-uri 'self'` — la app no tiene ninguna etiqueta `<base>` (verificado). Sin esta directiva, un XSS podría inyectar `<base href="//sitio-malo">` y desviar **todas** las rutas relativas de la página.
- `form-action 'self'` — ningún `<form>` de la app declara `action=` hacia fuera (verificado). Impide que un formulario inyectado mande datos a otro sitio.

**Capa 2 — REPORT-ONLY (`Content-Security-Policy-Report-Only`).** La política estricta completa. El navegador **no bloquea nada**: solo anota en la consola lo que habría bloqueado. Sirve para descubrir orígenes que no se ven leyendo el código (redirecciones internas de Firebase, por ejemplo) sin dejar a nadie sin poder trabajar.

### 1.3 La política completa y de dónde sale cada origen

| Directiva | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Todo lo no declarado queda cerrado |
| `script-src` | `'self'` + 1 hash | Solo nuestro bundle y el script en línea de `visor-pdf.html` |
| `style-src` | `'self'` + 3 hashes | Los bloques `<style>` de `index.html`, `visor-pdf.html` y `404.html` |
| `img-src` | `'self' data: blob:` + R2 + tiles | Avatares y fotos (R2, URL firmada), mapa de cobertura, imágenes generadas |
| `font-src` | `'self' data:` | No se usan Google Fonts ni ninguna fuente externa (verificado) |
| `connect-src` | 7 orígenes concretos | Ver abajo |
| `frame-src` | `https://www.google.com` | El iframe del mapa en Detalle de campaña |
| `worker-src` | `'self'` | El service worker de la PWA |
| `manifest-src` | `'self'` | `manifest.json` |
| `media-src` | `'self' blob:` | — |
| `object-src` | `blob:` | Relajación documentada, ver §1.5 |

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

### 1.5 Única relajación: `object-src blob:`

- **Qué dependencia**: `public/visor-pdf.html`, el visor de PDF.
- **Qué necesita**: muestra el documento con `<embed type="application/pdf">` apuntando a un `blob:` local.
- **Por qué**: con `object-src 'none'` el visor de PDF deja de funcionar por completo.
- **Riesgo residual**: permite incrustar objetos desde `blob:`. Para explotarlo hay que poder crear un blob e inyectar un `<embed>`, y eso exige ejecutar script primero — que ya corta `script-src 'self'`. Riesgo bajo y acotado.

Hay una prueba que comprueba que el visor **sigue** usando `<embed>`: si algún día deja de hacerlo, avisa para volver a `object-src 'none'`.

### 1.6 Los hashes se pueden desincronizar (y por eso hay una prueba)

Si alguien edita un bloque `<style>` o `<script>` en línea y no actualiza el hash, el navegador deja de aplicarlo: la pantalla se ve mal o el visor de PDF deja de abrir, **en producción y en silencio**.

Para regenerarlos:

```bash
node scripts/hashes-csp.mjs
```

y copiar la salida a `public/_headers`. La prueba `cabecerasWeb.test.ts` los recalcula desde los HTML reales y falla si no coinciden, así que esto no puede pasar desapercibido en CI. Hay además una prueba que falla si aparece un HTML estático nuevo que nadie metió en la lista.

### 1.7 Cómo pasar de Report-Only a aplicada

1. Abre https://vista360player.pe con la consola del navegador abierta (F12 → Console).
2. Recorre la app tocando lo que usa orígenes externos: **entrar**, **ver un reporte PDF**, **descargar una factura**, **subir una foto o un avatar**, **abrir Cobertura** (mapa), **abrir Detalle de campaña** (iframe de Google Maps), **activar notificaciones**.
3. Busca mensajes que empiecen por `[Report Only] Refused to...`. Cada uno indica un origen que falta.
4. Si no aparece ninguno, mueve el contenido de `Content-Security-Policy-Report-Only` a `Content-Security-Policy` (conservando las tres directivas que ya estaban) y vuelve a desplegar.
5. Si aparece alguno, agrégalo a la directiva correspondiente **con el dominio concreto**, no con un comodín, y repite.

No lo hagas a ciegas: el objetivo del Report-Only es exactamente evitar ese salto de fe.

---

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

### 3.1 Bucket R2 — CORREGIDO EN CÓDIGO, PENDIENTE DE APLICAR EN EL BUCKET

**Estaba así**: `AllowedOrigins: ["*"]` con métodos `GET`, `HEAD`, `PUT`.

**Ahora en el código**: lista blanca en `scripts/set-r2-cors.mjs` — producción (raíz y `www`), el dominio `pages.dev` de Cloudflare (lo usan los despliegues de vista previa) y `localhost:5173` para desarrollo.

> ⚠️ **El bucket real todavía NO tiene esta configuración.** El paso
> "Configurar CORS del bucket R2" del workflow de despliegue falla con
> `AccessDenied` (403) y está marcado `continue-on-error: true` a
> propósito: el token de R2 guardado en los secrets se creó con permiso
> **Object Read & Write**, y cambiar la *configuración* de un bucket
> (como CORS) exige **Admin Read & Write**. Es una limitación
> preexistente, ya documentada en el propio workflow, no algo que haya
> cambiado en esta pasada.
>
> Para aplicarlo, cualquiera de las dos vías:
>
> **A) A mano, una sola vez** (lo más rápido): Cloudflare Dashboard →
> R2 → el bucket → *Settings* → *CORS Policy* → *Edit* y pegar:
>
> ```json
> [
>   {
>     "AllowedOrigins": [
>       "https://vista360player.pe",
>       "https://www.vista360player.pe",
>       "https://vista360-player.pages.dev",
>       "http://localhost:5173",
>       "http://127.0.0.1:5173"
>     ],
>     "AllowedMethods": ["GET", "HEAD", "PUT"],
>     "AllowedHeaders": ["*"],
>     "ExposeHeaders": ["Content-Type", "Content-Length", "Content-Disposition"],
>     "MaxAgeSeconds": 3600
>   }
> ]
> ```
>
> **B) Rotar el token de R2** a uno con *Admin Read & Write*, guardarlo
> en los secrets `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` y volver a
> lanzar el workflow. Entonces el script lo aplica solo, y seguirá
> aplicándose en cada despliegue.
>
> **Después de aplicarlo, comprueba que las subidas siguen funcionando**
> (subir un avatar o una foto de reporte). Si la lista de orígenes
> quedara mal, la subida falla con un falso *"sin conexión"*, no con un
> error de CORS visible.

**Cuánto protege esto, honestamente**: el acceso real a R2 lo da la **firma** de la URL, no el CORS. Sin una URL firmada válida no se lee ni se escribe nada, venga el pedido de donde venga. Restringir orígenes no sustituye a la firma; lo que hace es que, si una URL firmada se filtra (historial, captura, chat), no se pueda explotar desde una página cualquiera abierta en el navegador de la víctima. Es defensa en profundidad y cuesta cero.

**Al mantenerlo**: si cambia el dominio del portal, hay que agregarlo a esa lista o las subidas empezarán a fallar con un falso *"sin conexión"* (`fetch` no distingue un bloqueo de CORS de una caída de red).

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
| CSP aplicada | No existía | `frame-ancestors`, `base-uri`, `form-action` |
| CSP completa | No existía | En Report-Only, lista para activar tras verificar |
| `unsafe-eval` / `unsafe-inline` | — | Ninguno de los dos hace falta |
| HSTS | **Ausente** | `max-age=31536000` (sin `includeSubDomains`/`preload`, a propósito) |
| HTTP → HTTPS | Ya funcionaba | VERIFICADO — no se tocó |
| CORS R2 | `*` | Lista blanca de 5 orígenes **en el código**; falta aplicarla en el bucket (token sin permiso Admin, ver §3.1) |
| CORS Cloud Functions | Por defecto | VERIFICADO — no hace falta tocar |
| X-Frame-Options, nosniff, Referrer, Permissions | Ya estaban bien | VERIFICADO — no se tocaron |
