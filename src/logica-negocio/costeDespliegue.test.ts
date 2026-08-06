import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vigila el ÚNICO cargo real que hoy tiene este proyecto en la factura.
 *
 * Firestore y las invocaciones de Functions están dentro del plan gratuito
 * (0,6% y 0,1% de la cuota). Lo que sí se cobra es el ALMACENAMIENTO de las
 * imágenes de contenedor: Cloud Functions v2 construye una imagen por
 * función y por despliegue, las guarda en Artifact Registry, y NO las borra
 * nunca. Cada despliegue añade basura permanente a la factura.
 *
 * `functions:artifacts:setpolicy` le pone fecha de caducidad a esas
 * imágenes. Este test existe porque es un paso silencioso: si alguien lo
 * quita del workflow, nada se rompe, nada avisa, y el cargo vuelve a
 * crecer mes a mes sin que nadie lo note hasta ver la factura.
 */

const raiz = resolve(__dirname, "../..");
const wf = readFileSync(
  resolve(raiz, ".github/workflows/setup-r2-secrets-and-deploy.yml"),
  "utf-8",
);

/** El paso, sin comentarios: lo que de verdad se ejecuta. */
function comandosDelPaso(nombreParcial: string): string {
  const inicio = wf.indexOf(nombreParcial);
  expect(inicio, `no se encontró el paso: ${nombreParcial}`).toBeGreaterThan(-1);
  const desdeElNombre = wf.lastIndexOf("- name:", inicio);
  const siguiente = wf.indexOf("- name:", inicio + nombreParcial.length);
  return wf
    .slice(desdeElNombre, siguiente === -1 ? undefined : siguiente)
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

describe("el despliegue no deja basura que se cobre para siempre", () => {
  it("programa el borrado automático de imágenes de contenedor viejas", () => {
    expect(comandosDelPaso("imagenes de contenedor viejas")).toContain(
      "functions:artifacts:setpolicy",
    );
  });

  it("NO pisa una política de limpieza que ya exista", () => {
    // El proyecto ya tenía una de 1 día, más agresiva --y más barata--
    // que los 3 días que pedía este paso. Sobrescribirla habría sido un
    // retroceso disfrazado de mejora.
    const paso = comandosDelPaso("imagenes de contenedor viejas");
    expect(paso).not.toContain("--force");
    expect(paso).toContain("currently deletes images older than");
    expect(paso).toContain("No se toca.");
  });

  it("si de verdad no se pudo programar, avisa (sin tumbar el despliegue)", () => {
    const paso = comandosDelPaso("imagenes de contenedor viejas");
    expect(paso).toContain("::warning::");
  });

  it("conserva algunos días de imágenes para poder revertir un despliegue malo", () => {
    // Con --days 0 se borraría la imagen en uso y no habría a dónde volver
    // si el despliegue nuevo sale defectuoso.
    const paso = comandosDelPaso("imagenes de contenedor viejas");
    const dias = /--days\s+(\d+)/.exec(paso);
    expect(dias, "la política debe fijar --days explícitamente").not.toBeNull();
    expect(Number(dias![1])).toBeGreaterThanOrEqual(1);
  });

  it("la limpieza NO puede tumbar un despliegue que ya terminó bien", () => {
    // Es un paso de higiene, no de despliegue. Si Artifact Registry
    // responde mal, las Cloud Functions ya están arriba y funcionando:
    // marcar la ejecución en rojo solo confundiría.
    expect(comandosDelPaso("imagenes de contenedor viejas")).toContain("set +e");
  });

  it("corre aunque un paso anterior haya fallado", () => {
    // Un despliegue a medias es justo cuando MÁS imágenes huérfanas quedan.
    expect(comandosDelPaso("imagenes de contenedor viejas")).toContain("if: always()");
  });
});
