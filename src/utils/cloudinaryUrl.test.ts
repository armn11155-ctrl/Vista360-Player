import { describe, expect, it } from "vitest";
import { cloudinaryThumb, esVideo } from "./cloudinaryUrl";

describe("esVideo", () => {
  it("true si la URL es de tipo /video/upload/", () => {
    expect(esVideo("https://res.cloudinary.com/demo/video/upload/v1/clip.mp4")).toBe(true);
  });
  it("false para una imagen", () => {
    expect(esVideo("https://res.cloudinary.com/demo/image/upload/v1/foto.jpg")).toBe(false);
  });
});

describe("cloudinaryThumb — imágenes", () => {
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
});

describe("cloudinaryThumb — videos", () => {
  it("genera un frame JPG del video (extensión cambiada, path /video/upload/ conservado)", () => {
    const url = "https://res.cloudinary.com/demo/video/upload/v123/vista360/campanas/clip.mp4";
    expect(cloudinaryThumb(url, 240)).toBe(
      "https://res.cloudinary.com/demo/video/upload/c_fill,w_240,h_240,so_0,q_auto/v123/vista360/campanas/clip.jpg"
    );
  });

  it("funciona con distintas extensiones de video (mov, webm)", () => {
    expect(cloudinaryThumb("https://res.cloudinary.com/demo/video/upload/v1/x.mov")).toMatch(/\.jpg$/);
    expect(cloudinaryThumb("https://res.cloudinary.com/demo/video/upload/v1/x.webm")).toMatch(/\.jpg$/);
  });

  it("respeta el tamaño pasado también para videos", () => {
    const url = "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4";
    expect(cloudinaryThumb(url, 100)).toContain("w_100,h_100");
  });
});
