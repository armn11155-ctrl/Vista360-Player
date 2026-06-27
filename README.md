# Vista360 Player

Portal web para los **clientes (anunciantes)** de Vista360 — entran con su
cuenta y ven sus propias campañas: estado, evidencias fotográficas de sus
anuncios en los paneles, y reportes. Usa el **mismo proyecto de Firebase**
que [Vista360](https://github.com/armn11155-ctrl/Vista360) (el ERP interno),
pero cada cliente solo ve sus propios datos — nunca los de otro cliente ni
información financiera interna.

## Cómo funciona

1. El dueño le crea la cuenta a cada cliente con un script (ver más abajo) —
   **no hay auto-registro**.
2. El cliente entra con su correo y contraseña.
3. La app busca su vínculo en `portalUsers/{uid}` para saber a qué
   `cliente_id` de Vista360 corresponde.
4. Desde ahí, todo lo que ve viene de Firestore en tiempo real:
   - **Inicio**: resumen (campañas activas, pantallas, última evidencia, próximo vencimiento)
   - **Mis campañas**: sus contratos, con estado derivado de fecha (Activa/Programada/Finalizada)
   - **Detalle**: info del contrato y del panel
   - **Evidencias**: las fotos reales de `contrato.fotos_campania`
   - **Perfil**: datos de su cuenta, cerrar sesión
   - **Nueva campaña**: formulario que crea una solicitud en `solicitudesCampana` (el dueño la revisa desde Vista360, igual que ya hace con `solicitudesWeb`)
   - **Reportes**: por ahora es una pantalla "próximamente" — generar PDFs/ZIP reales es la siguiente fase

## Setup local

```bash
git clone git@github.com:armn11155-ctrl/Vista360-Player.git
cd Vista360-Player
npm install
cp .env.example .env.local
```

Completa `.env.local` con las **mismas credenciales de Firebase que usa
Vista360** (las encuentras en su `.env.local`, sección `VITE_FIREBASE_*`).

```bash
npm run dev       # http://localhost:5174
```

## ⚠️ Pasos obligatorios en Firebase / Vista360 antes de usarlo

Este portal necesita reglas de Firestore que dejen a un cliente leer
**solo sus propios** `contratos`/`clientes`, sin tocar nada financiero
interno. Ya preparé ese cambio (`firestore.rules` + el script de creación
de cuentas) para subir al repo **Vista360** — avísame y lo subo ahí, y
luego se despliega una vez con:

```bash
cd ../Vista360
firebase deploy --only firestore:rules
```

## Crear el acceso de un cliente nuevo

Con el script `scripts/crear-acceso-cliente.mjs` (en el repo Vista360):

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
  node scripts/crear-acceso-cliente.mjs <cliente_id> <email> <password-temporal>
```

Esto crea la cuenta de Firebase Auth del cliente y la vincula a su
`cliente_id` existente en Vista360 — el cliente ya puede entrar de
inmediato a Vista360-Player con ese correo y contraseña.

## Deploy a producción

Igual que Vista360: se despliega como sitio estático en Cloudflare Pages
(`npm run build` → carpeta `dist/`). Configura las variables `VITE_*` en
Cloudflare Pages → Settings → Environment variables.
