import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Navegación a Papelera (frontend) -- misma lección aprendida en
 * producción con "Analítica de acceso" (ver menuPorRol.test.ts):
 * `isAdmin` en esta app significa "no está mirando como cliente", NO
 * "es el Gerente" -- es verdadero también para un Trabajador. Un botón o
 * un `case` de pantalla que gatee por `isAdmin` en vez de `esGerente`
 * termina mostrándole a un Trabajador un botón que el backend le va a
 * rechazar con un error técnico. Para Papelera el riesgo es mayor que
 * para Analítica: si un Trabajador llegara a ENTRAR (el backend igual lo
 * bloquea, ver papeleraRecuperacion.test.ts), vería facturas y
 * comprobantes de pago de TODOS los clientes, no solo información de
 * actividad.
 */
const RAIZ = resolve(__dirname, "../..");
const app = readFileSync(resolve(RAIZ, "src/App.tsx"), "utf-8");
const adminClientPicker = readFileSync(resolve(RAIZ, "src/components/AdminClientPicker.tsx"), "utf-8");

describe("Papelera solo es alcanzable por el Gerente", () => {
  it('el botón "Papelera" del Centro de gestión está gateado por esGerente, no solo por isAdmin', () => {
    const bloque = adminClientPicker.slice(
      adminClientPicker.indexOf("{esGerente && onOpenPapelera && ("),
      adminClientPicker.indexOf("{esGerente && onOpenPapelera && (") + 400
    );
    expect(bloque).toContain("esGerente && onOpenPapelera");
  });

  it('App.tsx solo activa onOpenPapelera cuando esGerente es true (undefined en cualquier otro caso, así el botón no aparece)', () => {
    expect(app).toContain('onOpenPapelera={esGerente ? () => setView("papelera") : undefined}');
  });

  it('la vista "papelera" solo entra a la rama de pantallas admin-only si esGerente es true -- NO basta con isAdmin', () => {
    const inicio = app.indexOf('if (view === "solicitudes"');
    const fin = app.indexOf("\n", inicio);
    const condicion = app.slice(inicio, fin);
    expect(condicion).toContain('(view === "papelera" && esGerente)');
  });

  it('el render de "papelera" es un case propio -- no cae en el "else" genérico que hoy usa AnaliticaClientes', () => {
    const idxCase = app.indexOf('view === "papelera"\n                          ? <Papelera');
    expect(idxCase).toBeGreaterThan(-1);
  });

  it('"papelera" está en la lista de vistas de pantalla completa (sin barra inferior compitiendo)', () => {
    const bloque = app.slice(app.indexOf("const SIDEBAR_VIEWS"), app.indexOf("const SIDEBAR_VIEWS") + 400);
    expect(bloque).toContain('"papelera"');
  });

  it('Papelera se carga bajo demanda (lazy), como el resto de pantallas solo-Gerente', () => {
    expect(app).toContain('const Papelera = pantallaLazy(() => import("./components/screens/Papelera"));');
  });
});
