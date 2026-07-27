import BackChevron from "../BackChevron";

type IconId = "mall" | "road" | "buildings" | "globe";

function ProductIcon({ id }: { id: IconId }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#0877FF",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (id === "mall") {
    return (
      <svg {...common}>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    );
  }
  if (id === "road") {
    return (
      <svg {...common}>
        <path d="M9 20 11 4" />
        <path d="M15 20 13 4" />
        <line x1="12" y1="6" x2="12" y2="9" />
        <line x1="12" y1="12" x2="12" y2="15" />
        <line x1="12" y1="17" x2="12" y2="19" />
      </svg>
    );
  }
  if (id === "buildings") {
    return (
      <svg {...common}>
        <path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
        <path d="M14 10h4a1 1 0 0 1 1 1v10" />
        <line x1="9" y1="7" x2="10" y2="7" />
        <line x1="9" y1="11" x2="10" y2="11" />
        <line x1="9" y1="15" x2="10" y2="15" />
        <line x1="17" y1="14" x2="18" y2="14" />
        <line x1="17" y1="18" x2="18" y2="18" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
    </svg>
  );
}

interface Producto {
  icon: IconId;
  nombre: string;
  desc: string;
  precio: string;
}

const PRODUCTOS: Producto[] = [
  {
    icon: "mall",
    nombre: "Pantalla Premium Centro Comercial",
    desc: "Alto tráfico peatonal, formato vertical full HD, rotación de 15 segundos.",
    precio: "Desde S/ 1,200 / mes",
  },
  {
    icon: "road",
    nombre: "Pantalla Vial Avenida Principal",
    desc: "Visibilidad para tráfico vehicular en las avenidas con mayor flujo de la ciudad.",
    precio: "Desde S/ 1,800 / mes",
  },
  {
    icon: "buildings",
    nombre: "Pack Edificios Corporativos",
    desc: "Pantallas en lobbies y ascensores de oficinas corporativas.",
    precio: "Desde S/ 900 / mes",
  },
  {
    icon: "globe",
    nombre: "Pack Cobertura Nacional",
    desc: "Combina pantallas en las principales ciudades del Perú en una sola campaña.",
    precio: "Cotización personalizada",
  },
];

interface Props {
  onBack: () => void;
  onContactar: () => void;
}

export default function Portafolio({ onBack, onContactar }: Props) {
  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Portafolio</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area">
        <div className="card">
          <div className="section-title">Catálogo de productos y ofertas</div>
          {PRODUCTOS.map((p) => (
            <div className="product-card" key={p.nombre}>
              <div className="product-icon">
                <ProductIcon id={p.icon} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="product-name">{p.nombre}</div>
                <div className="product-desc">{p.desc}</div>
                <div className="product-price">{p.precio}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="section-title" style={{ marginBottom: 10 }}>
            ¿Quieres una propuesta a tu medida?
          </div>
          <div
            className="login-btn"
            style={{ display: "inline-block", width: "auto", padding: "12px 28px" }}
            onClick={onContactar}
          >
            Hablar con un asesor
          </div>
        </div>
      </div>
    </div>
  );
}
