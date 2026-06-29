import BackChevron from "../BackChevron";

interface Producto {
  icon: string;
  nombre: string;
  desc: string;
  precio: string;
}

const PRODUCTOS: Producto[] = [
  {
    icon: "🏙️",
    nombre: "Pantalla Premium Centro Comercial",
    desc: "Alto tráfico peatonal, formato vertical full HD, rotación de 15 segundos.",
    precio: "Desde S/ 1,200 / mes",
  },
  {
    icon: "🛣️",
    nombre: "Pantalla Vial Avenida Principal",
    desc: "Visibilidad para tráfico vehicular en las avenidas con mayor flujo de la ciudad.",
    precio: "Desde S/ 1,800 / mes",
  },
  {
    icon: "🏢",
    nombre: "Pack Edificios Corporativos",
    desc: "Pantallas en lobbies y ascensores de oficinas corporativas.",
    precio: "Desde S/ 900 / mes",
  },
  {
    icon: "🌎",
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
          {PRODUCTOS.map((p, i) => (
            <div className="product-card" key={i}>
              <div className="product-icon">{p.icon}</div>
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
