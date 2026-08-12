import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import { reautenticar } from "../config/reautenticacion";
import {
  confirmarEnrolamiento,
  desactivarSegundoFactor,
  emailSinVerificar,
  generarSecretoTotp,
  tieneSegundoFactor,
  type SecretoParaEnrolar,
} from "../config/mfa";
import { mensajeDeError } from "../utils/errores";

/**
 * Asistente de "Autenticación en dos pasos" para cuentas Gerente.
 *
 * Orden de los pasos (y por qué ese orden):
 *   1. contraseña   -- Firebase exige sesión reciente para tocar los
 *                      factores, y activar MFA es justo cuando hay que
 *                      estar seguro de quién está al teclado.
 *   2. QR + clave   -- el secreto lo genera Firebase, no nosotros, y no
 *                      se guarda en ningún sitio nuestro.
 *   3. código       -- Firebase verifica el código; solo entonces queda
 *                      enrolado el factor. No hay forma de "activar MFA"
 *                      sin haber demostrado que el autenticador funciona,
 *                      que es lo que evita quedarse fuera por un QR mal
 *                      escaneado.
 */
type Paso = "inicio" | "contrasena" | "qr" | "listo";

export function MfaSetupModal({ onCerrar }: { onCerrar: () => void }) {
  const yaEnrolado = tieneSegundoFactor();
  const sinVerificar = emailSinVerificar();
  const [paso, setPaso] = useState<Paso>("inicio");
  const [contrasena, setContrasena] = useState("");
  const [secreto, setSecreto] = useState<SecretoParaEnrolar | null>(null);
  const [qr, setQr] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // La librería de QR se carga solo si alguien llega de verdad a este
  // paso: es un asistente que se usa una vez en la vida de la cuenta, no
  // tiene sentido que pese en el arranque de la app para todos.
  useEffect(() => {
    if (!secreto) return;
    let vivo = true;
    void import("qrcode")
      .then((mod) => mod.toDataURL(secreto.uri, { margin: 1, width: 220 }))
      .then((url) => { if (vivo) setQr(url); })
      .catch(() => { /* sin QR se puede seguir con la clave en texto */ });
    return () => { vivo = false; };
  }, [secreto]);

  async function registrarEnAuditoria(evento: "enrolado" | "desactivado") {
    // Informativo. Si falla, el segundo factor ya quedó activado igual en
    // Firebase: no tiene sentido revertir nada ni asustar al usuario.
    if (!cloudFunctions) return;
    try {
      await httpsCallable<{ evento: string }, { ok: boolean }>(cloudFunctions, "registrarEventoMfa")({ evento });
    } catch { /* la auditoría no puede romper el flujo de seguridad */ }
  }

  async function empezar() {
    setOcupado(true);
    setError("");
    try {
      await reautenticar(contrasena);
      setContrasena("");
      setSecreto(await generarSecretoTotp());
      setPaso("qr");
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo iniciar la configuración. Revisa tu contraseña."));
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (!secreto) return;
    setOcupado(true);
    setError("");
    try {
      await confirmarEnrolamiento(secreto.secreto, codigo);
      await registrarEnAuditoria("enrolado");
      setPaso("listo");
    } catch (err) {
      setError(mensajeDeError(err, "Código incorrecto o vencido. Prueba con el siguiente que muestre tu aplicación."));
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setError("");
    try {
      await reautenticar(contrasena);
      setContrasena("");
      await desactivarSegundoFactor();
      await registrarEnAuditoria("desactivado");
      onCerrar();
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo desactivar. Revisa tu contraseña."));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 22, width: "100%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>Autenticación en dos pasos</h3>

        {sinVerificar && (
          <p style={{ fontSize: 13, color: "#B45309", background: "#FEF3C7", padding: 10, borderRadius: 10, lineHeight: 1.45 }}>
            Firebase exige que el correo de la cuenta esté verificado antes de poder
            activar el segundo factor. Verifica el correo de esta cuenta y vuelve a
            intentarlo.
          </p>
        )}

        {paso === "inicio" && !sinVerificar && (
          <>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              {yaEnrolado
                ? "Tu cuenta ya pide un código además de la contraseña. Si desactivas el segundo factor, bastará la contraseña para entrar."
                : "Añade un código de un solo uso a tu inicio de sesión. Necesitarás una aplicación como Google Authenticator o Microsoft Authenticator."}
            </p>
            {!yaEnrolado && (
              <p style={{ fontSize: 12, color: "#B45309", background: "#FEF3C7", padding: 10, borderRadius: 10, lineHeight: 1.45 }}>
                Antes de activarlo, asegúrate de poder recuperar la cuenta si pierdes el
                teléfono. Lee el procedimiento de recuperación con tu Gerente.
              </p>
            )}
            <button type="button" onClick={() => setPaso("contrasena")} disabled={ocupado}
              style={{ width: "100%", padding: 14, marginTop: 10, borderRadius: 12, border: "none", background: yaEnrolado ? "#DC2626" : "#0877FF", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {yaEnrolado ? "Desactivar segundo factor" : "Activar"}
            </button>
          </>
        )}

        {paso === "contrasena" && (
          <>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              Escribe tu contraseña para confirmar que eres tú.
            </p>
            <input type="password" autoComplete="current-password" value={contrasena}
              onChange={(e) => setContrasena(e.target.value)} placeholder="Tu contraseña"
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 14 }} />
            <button type="button" disabled={ocupado || !contrasena} onClick={() => void (yaEnrolado ? desactivar() : empezar())}
              style={{ width: "100%", padding: 14, marginTop: 12, borderRadius: 12, border: "none", background: "#0877FF", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {ocupado ? "Comprobando…" : "Continuar"}
            </button>
          </>
        )}

        {paso === "qr" && secreto && (
          <>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              Escanea este código con tu aplicación de autenticación y escribe el código
              de 6 dígitos que aparezca.
            </p>
            {qr && <img src={qr} alt="Código QR para la aplicación de autenticación" style={{ display: "block", margin: "0 auto 10px", width: 200, height: 200 }} />}
            <p style={{ fontSize: 11, color: "#64748B", wordBreak: "break-all", textAlign: "center" }}>
              ¿No puedes escanear? Clave: <strong>{secreto.clave}</strong>
            </p>
            <input type="text" inputMode="numeric" maxLength={6} value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} placeholder="000000"
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 16, textAlign: "center", letterSpacing: 4 }} />
            <button type="button" disabled={ocupado || codigo.length < 6} onClick={() => void confirmar()}
              style={{ width: "100%", padding: 14, marginTop: 12, borderRadius: 12, border: "none", background: "#0877FF", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {ocupado ? "Verificando…" : "Verificar y activar"}
            </button>
          </>
        )}

        {paso === "listo" && (
          <p style={{ fontSize: 13, color: "#166534", background: "#DCFCE7", padding: 12, borderRadius: 10, lineHeight: 1.5 }}>
            Listo. A partir del próximo inicio de sesión te pediremos el código además de
            la contraseña. Guarda tu aplicación de autenticación en un lugar seguro.
          </p>
        )}

        {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 10, lineHeight: 1.4 }}>{error}</div>}

        <button type="button" onClick={onCerrar}
          style={{ width: "100%", padding: 12, marginTop: 10, borderRadius: 12, border: "none", background: "#F3F4F6", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          {paso === "listo" ? "Listo" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
