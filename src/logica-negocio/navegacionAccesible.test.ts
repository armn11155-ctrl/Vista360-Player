import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = resolve(__dirname, "../..");

function leer(ruta: string) {
  return readFileSync(resolve(raiz, ruta), "utf8");
}

describe("navegación accesible", () => {
  it("no implementa volver con divs que el teclado no puede enfocar", () => {
    const carpeta = resolve(raiz, "src/components/screens");
    const pantallas = readdirSync(carpeta).filter((nombre) => nombre.endsWith(".tsx") && !nombre.endsWith(".test.tsx"));

    for (const pantalla of pantallas) {
      expect(leer(`src/components/screens/${pantalla}`)).not.toContain('<div className="back-btn"');
    }
  });

  it("mantiene la acción compartida como botón nativo con nombre accesible", () => {
    const boton = leer("src/components/BackButton.tsx");
    expect(boton).toContain('type="button"');
    expect(boton).toContain("aria-label={label}");
  });

  it("expone las pestañas del detalle de campaña con semántica de tabs", () => {
    const detalle = leer("src/components/screens/DetalleCampana.tsx");
    expect(detalle).toContain('role="tablist"');
    expect(detalle).toContain('role="tab"');
    expect(detalle).toContain("aria-selected={tab === t.id}");
  });

  it("permite activar con teclado las tarjetas que funcionan como enlaces", () => {
    const accesos = leer("src/components/screens/Accesos.tsx");
    const paneles = leer("src/components/screens/Paneles.tsx");
    const inicio = leer("src/components/screens/Inicio.tsx");
    const solicitudes = leer("src/components/screens/SolicitudesCampana.tsx");
    const sidebar = leer("src/components/Sidebar.tsx");

    expect(accesos).toContain('aria-label={`Editar usuario ${nombreDeUsuario(inv)}`}');
    expect(paneles).toContain('aria-label={`Editar panel ${p.nombre}`}');
    expect(inicio).toContain('role={item.onClick ? "button" : undefined}');
    expect(solicitudes).toContain('aria-label={`Abrir solicitud ${s.nombre} de ${nombreCliente(s.cliente_id)}`}');
    expect(sidebar).toContain('<button type="button" className="sidebar-close"');

    for (const codigo of [accesos, paneles, inicio, solicitudes]) {
      expect(codigo).toContain("event.key !== \"Enter\"");
      expect(codigo).toContain('event.key !== " "');
    }
  });
});
