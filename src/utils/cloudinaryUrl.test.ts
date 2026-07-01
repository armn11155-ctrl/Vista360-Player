import { describe, expect, it } from "vitest";
import { cloudinaryThumb } from "./cloudinaryUrl";

describe("cloudinaryThumb", () => {
  it("inserta la transformación de miniatura después de /image/upload/", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v123/vista360/campanas/abc.jpg";
    expect(cloudinaryThumb(url, 240)).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_240,h_240,q_auto,f_auto/v123/vista360/campanas/abc.jpg"
    );
  });

  it("respeta el tamaño pasado como parámetro", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v123/foto.jpg";
    expect(cloudinaryThumb(url, 80)).toContain("w_80,h_80");
  });

  it("devuelve la URL sin tocar si no es de Cloudinary (imagen)", () => {
    const url = "https://otrodominio.com/foto.jpg";
    expect(cloudinaryThumb(url)).toBe(url);
  });

  it("devuelve la URL sin tocar si es un video (no /image/upload/)", () => {
    const url = "https://res.cloudinary.com/demo/video/upload/v123/clip.mp4";
    expect(cloudinaryThumb(url)).toBe(url);
  });
});
