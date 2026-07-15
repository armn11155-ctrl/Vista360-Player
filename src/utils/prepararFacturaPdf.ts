const MAX_FACTURA_PDF_BYTES = 5 * 1024 * 1024;

export function formatoBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function prepararFacturaPdf(file: File): Promise<File> {
  if (file.type !== "application/pdf") {
    throw new Error("Sube un PDF válido.");
  }

  if (file.size > MAX_FACTURA_PDF_BYTES) {
    throw new Error(
      `Ese PDF pesa ${formatoBytes(file.size)}. Para facturas usa un PDF liviano, máximo ${formatoBytes(MAX_FACTURA_PDF_BYTES)}.`
    );
  }

  const nombre = file.name.replace(/\.[^.]+$/, "") || "factura";
  return new File([file], `${nombre}.pdf`, { type: "application/pdf" });
}
