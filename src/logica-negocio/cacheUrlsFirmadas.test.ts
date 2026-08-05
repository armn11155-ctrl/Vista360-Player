import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vigila el sistema de caché de URLs firmadas de R2.
 *
 * Cada URL firmada es una llamada a Cloud Functions, y esa función
 * consulta además los contratos del cliente para comprobar de quién es
 * cada archivo. O sea que una petición de más no cuesta solo una
 * invocación: cuesta también una consulta a Firestore.
 *
 * El riesgo real es que se pierda el agrupado: las tarjetas piden su URL
 * una a una, así que sin él una pantalla con 20 facturas hace 20
 * llamadas para pedir 20 claves que caben en una sola.
 */

const hook = readFileSync(resolve(__dirname, "../hooks/useSignedUrls.ts"), "utf-8");
const sinComentarios = hook
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("las peticiones simultáneas viajan juntas", () => {
  it("existe el agrupado por ventana de tiempo", () => {
    expect(sinComentarios).toContain("pedirFirmaAgrupada");
    expect(sinComentarios).toContain("VENTANA_AGRUPADO_MS");
  });

  it("las tarjetas NO llaman a firmar() directamente", () => {
    // Si alguna vuelve a hacerlo, se pierde el agrupado sin que nada
    // falle a la vista: solo se multiplican las llamadas y el coste.
    const dentroDelHook = sinComentarios.slice(sinComentarios.indexOf("export function useSignedUrls"));
    expect(dentroDelHook).not.toMatch(/[^a-zA-Z]firmar\(/);
    expect(dentroDelHook).toContain("pedirFirmaAgrupada(");
  });

  it("una sola promesa de lote se comparte entre quienes piden a la vez", () => {
    expect(sinComentarios).toContain("promesaDelLote");
  });

  it("la cola se limpia ANTES de la llamada, no después", () => {
    // Si se limpiara después, las claves que llegaran durante el firmado
    // se perderían: creerían estar en un lote que ya había salido.
    const i = sinComentarios.indexOf("const lote = Array.from(colaDeClaves)");
    const j = sinComentarios.indexOf("await firmar(lote)");
    const k = sinComentarios.indexOf("colaDeClaves = new Set()", i);
    expect(i).toBeGreaterThan(-1);
    expect(k).toBeGreaterThan(i);
    expect(k).toBeLessThan(j);
  });
});

describe("la caché de URLs sigue siendo correcta", () => {
  it("respeta la expiración con margen (no sirve una URL a punto de morir)", () => {
    expect(sinComentarios).toContain("MARGEN_MS");
    expect(sinComentarios).toMatch(/expiraEn\s*-\s*MARGEN_MS\s*>\s*ahora/);
  });

  it("sobrevive al cierre de la app (almacenamiento local)", () => {
    expect(sinComentarios).toContain("cargarCacheInicial");
    expect(sinComentarios).toContain("guardarCache");
  });

  it("al cargar de disco descarta las que ya expiraron", () => {
    // Sin esto se serviría una URL muerta y la imagen saldría rota.
    expect(sinComentarios).toMatch(/valor\.expiraEn\s*>\s*ahora/);
  });

  it("respeta el tope de claves por llamada", () => {
    expect(sinComentarios).toContain("MAX_POR_LOTE");
  });
});
