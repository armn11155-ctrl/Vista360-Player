import { useLayoutEffect } from "react";

/**
 * Sincroniza la barra de estado (status bar / theme-color) con el color
 * real del header de la pantalla actual — igual que hace Vista360 (ERP).
 *
 * Sin esto, en iOS la barra de estado (iconos blancos, por
 * "black-translucent" en index.html) puede quedar pegada sobre un fondo
 * claro y volverse invisible, o se ve un destello del color equivocado
 * (el gris/blanco por defecto) durante el rebote elástico del scroll o
 * antes de que React monte. useLayoutEffect corre ANTES del primer paint
 * del navegador, así que el cambio de color es instantáneo, sin parpadeo.
 */
export function useThemeColor(color: string) {
  useLayoutEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
    document.documentElement.style.background = "#FFFFFF";
    document.body.style.background = "#FFFFFF";
  }, [color]);
}
