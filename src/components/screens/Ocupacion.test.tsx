import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useOcupacion", async () => {
  const actual = await vi.importActual<typeof import("../../hooks/useOcupacion")>("../../hooks/useOcupacion");
  return {
    ...actual,
    useOcupacion: () => ({
      status: "ready" as const,
      recargar: vi.fn(),
      datos: {
        hoy: "2026-08-12",
        ventanaDias: 45,
        totales: {
          paneles: 1, operativos: 1, enMantenimiento: 0, trabajando: 1,
          libres: 0, ocupacionPct: 100, anunciantesActivos: 1,
          ingresoActivo: 1000, seLiberanEnVentana: 1, lonas: 1,
          lonasLibres: 0, ledConEspacio: 0, unipolares: 0,
          unipolaresConEspacio: 0,
        },
        paneles: [{
          id: "p1", nombre: "Panel Centro", ciudad: "Lima", estado: "Disponible",
          enMantenimiento: false, modalidad: "lona" as const, impactoDiario: 100,
          anunciantesActivos: 1, anunciantesProgramados: 0, ingresoActivo: 1000,
          proximoVencimiento: "2026-08-28", diasLibre: null, nuncaContratado: false,
          ocupantes: [{ clienteId: "c1", clienteNombre: "Cliente Uno", campana: "Agosto", fin: "2026-08-28", diasRestantes: 16, monto: 1000 }],
        }],
        porVencer: [{ panelId: "p1", panelNombre: "Panel Centro", ciudad: "Lima", clienteId: "c1", clienteNombre: "Cliente Uno", campana: "Agosto", fin: "2026-08-28", diasRestantes: 16, monto: 1000 }],
        libres: [],
        cobranza: { facturas: [], total: 0, vencidas: 0, totalVencido: 0 },
      },
    }),
  };
});

import Ocupacion from "./Ocupacion";

describe("Ocupacion", () => {
  it("renderiza el tablero completo con iconos visibles y sin color naranja", () => {
    const { container } = render(<Ocupacion onBack={() => undefined} />);

    expect(screen.getByText("Ocupación de pantallas")).toBeInTheDocument();
    expect(screen.getByText("A quién llamar")).toBeInTheDocument();
    expect(screen.getByText("Inventario")).toBeInTheDocument();
    expect(container.querySelectorAll('svg[stroke="currentColor"]')).toHaveLength(3);
    expect(container.innerHTML).not.toMatch(/#F59E0B|#B45309|245,\s*158,\s*11/i);
  });
});
