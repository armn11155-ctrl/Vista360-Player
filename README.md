# Vista360 Player

Reproductor de contenido digital (imágenes / video) que corre **en la pantalla física**
de cada panel. Es el compañero de [Vista360](https://github.com/armn11155-ctrl/Vista360)
(el ERP que administra paneles, clientes y contratos) — usa el **mismo proyecto de
Firebase**, así que el contenido que se asigna se ve reflejado en el panel sin tener
que tocar nada del lado del ERP.

## Cómo funciona

1. Abres la app en el dispositivo conectado a la pantalla (un Android TV box, un
   mini PC con Chrome en kiosko, una smart TV con navegador, etc).
2. La primera vez te pide el **ID del panel** (el mismo que ves en Vista360 →
   Paneles). Lo escribes una sola vez — queda guardado en ese dispositivo.
3. El player se conecta a Firebase de forma anónima y se suscribe en tiempo real
   al documento `contenidoDigital/{panelId}`.
4. Si hay contenido activo, lo reproduce en loop de pantalla completa con
   transición (crossfade). Si cambias la playlist desde Firestore, el panel la
   recibe sola, sin reiniciar.
5. Cada 30s reporta su estado (`playersStatus/{panelId}`) para que desde Vista360
   se pueda ver qué pantallas están encendidas y desde cuándo.

## Setup local

```bash
git clone git@github.com:armn11155-ctrl/Vista360-Player.git
cd Vista360-Player
npm install
cp .env.example .env.local
```

Completa `.env.local` con **las mismas credenciales de Firebase que usa Vista360**
(las encuentras en el `.env.local` del repo Vista360, sección `VITE_FIREBASE_*`).

```bash
npm run dev       # http://localhost:5174
```

## ⚠️ Paso obligatorio en Firebase antes de usarlo

Este player necesita dos colecciones nuevas en Firestore que **no existían**
en el proyecto Vista360 todavía, más reglas de seguridad para que un dispositivo
anónimo (sin login humano) solo pueda leer su contenido y no datos sensibles
(clientes, facturas, gastos, etc).

Ya preparé y subí ese cambio al repo **Vista360** (`firestore.rules`). Para
activarlo en producción hay que desplegarlo una vez:

```bash
cd ../Vista360
firebase deploy --only firestore:rules
```

Sin este paso, el player se queda pegado en "Conectando…" porque Firestore
le va a negar la lectura.

## Asignar contenido a un panel (por ahora, manual)

Todavía no hay una pantalla en Vista360 para esto — se crea el documento
directo en la consola de Firebase (Firestore Database):

- Colección: `contenidoDigital`
- ID del documento: **el mismo ID del panel** (ej. `panel-001`)
- Campos:

```json
{
  "panel_id": "panel-001",
  "activo": true,
  "items": [
    { "tipo": "imagen", "url": "https://.../anuncio1.jpg", "duracionSeg": 10, "orden": 1 },
    { "tipo": "video", "url": "https://.../anuncio2.mp4", "orden": 2 }
  ]
}
```

- `tipo`: `"imagen"` o `"video"`.
- `duracionSeg`: solo aplica a imágenes (cuánto tiempo se queda en pantalla). Los
  videos se reproducen completos y avanzan solos al terminar.
- `orden`: define la secuencia de reproducción.
- `activo: false` o `items: []` → el panel muestra un reloj de espera en vez de
  quedarse en negro.

> Próximo paso natural: agregar una pestaña "Contenido digital" dentro de
> Vista360 (en la sección de Paneles) para editar esto con una UI en vez de
> tocar Firestore a mano. Lo puedo armar cuando quieras — dime y lo hago.

## Deploy a producción

Pensado para desplegarse igual que Vista360, como sitio estático (Cloudflare
Pages, Netlify, Vercel, o un simple `npm run build` + servir `dist/` desde
cualquier hosting). El dispositivo que vea la pantalla solo necesita un
navegador apuntando a esa URL, en modo kiosko/pantalla completa.
