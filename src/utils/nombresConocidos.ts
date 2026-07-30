// Cuentas creadas a mano antes de que existiera el campo "nombre" en
// portalUsers (la del Gerente original, armn.101@hotmail.com) nunca lo
// tuvieron, así que en varios lados de la app se caía al correo o al
// nombre del rol ("Gerente") en vez de al nombre real -- se vio en Mi
// perfil, el sidebar y la lista de Personal interno. Hay una Cloud
// Function (actualizarNombrePropio) que lo corrige escribiendo en
// Firestore, pero eso depende de que esté desplegada; mientras tanto (o
// si nunca se despliega) esto asegura que el nombre correcto se vea
// igual, sin depender del servidor. En cuanto Firestore sí tenga el
// campo "nombre" (por la función, o editado a mano desde Mi perfil), ese
// valor real gana siempre -- esto es solo el último fallback. Un solo
// lugar para esta tabla evita que los distintos usos se desincronicen.
export const NOMBRES_CONOCIDOS: Record<string, string> = {
  "armn.101@hotmail.com": "Alan Martínez",
};

export function nombreConocidoPorEmail(email: string | null | undefined): string | undefined {
  return NOMBRES_CONOCIDOS[(email ?? "").trim().toLowerCase()];
}
