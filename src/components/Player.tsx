import { useCallback, useEffect, useRef, useState } from "react";
import type { ContenidoDigital, ContenidoItem } from "../types";

const DEFAULT_IMAGE_SECONDS = 8;
const TRANSITION_MS = 700;

interface Props {
  /** Se asume que `items` no cambia durante la vida de este componente.
   *  El padre debe pasar una `key` distinta cuando llega una playlist
   *  nueva, para que React remonte el player en lugar de mutar en vivo
   *  (más simple y sin estados pegados de la playlist anterior). */
  contenido: ContenidoDigital;
}

function nextIndex(i: number, len: number) {
  return (i + 1) % len;
}

export default function Player({ contenido }: Props) {
  const items = contenido.items;
  const [pos, setPos] = useState(0);
  const [frontLayer, setFrontLayer] = useState<0 | 1>(0);
  const [layerContent, setLayerContent] = useState<[ContenidoItem, ContenidoItem]>(() => [
    items[0],
    items[nextIndex(0, items.length)],
  ]);

  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const timerRef = useRef<number | null>(null);

  const advance = useCallback(() => {
    setPos((p) => {
      const newPos = nextIndex(p, items.length);
      const back = frontLayer === 0 ? 1 : 0;
      setLayerContent((prev) => {
        const updated = [...prev] as [ContenidoItem, ContenidoItem];
        updated[back] = items[nextIndex(newPos, items.length)];
        return updated;
      });
      setFrontLayer(back);
      return newPos;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, frontLayer]);

  // Reproduce/pausa los <video> según cuál capa está al frente, y
  // programa el avance automático (imágenes por temporizador, videos
  // al terminar de reproducirse).
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);

    const frontItem = layerContent[frontLayer];
    const backIdx = frontLayer === 0 ? 1 : 0;

    videoRefs.current.forEach((el, idx) => {
      if (!el) return;
      if (idx === frontLayer) {
        el.currentTime = 0;
        el.loop = items.length === 1;
        el.play().catch(() => {
          /* el navegador puede bloquear autoplay sin gesto previo —
             el click de "Conectar" en el pareo ya cuenta como gesto,
             así que esto debería funcionar en la práctica */
        });
      } else {
        el.pause();
      }
    });
    void backIdx;

    if (frontItem.tipo === "imagen") {
      const ms = (frontItem.duracionSeg ?? DEFAULT_IMAGE_SECONDS) * 1000;
      timerRef.current = window.setTimeout(advance, ms);
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [frontLayer, layerContent, items.length, advance]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      {([0, 1] as const).map((layerIdx) => {
        const item = layerContent[layerIdx];
        const isFront = layerIdx === frontLayer;
        return (
          <div
            key={layerIdx}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isFront ? 1 : 0,
              transition: `opacity ${TRANSITION_MS}ms ease`,
              zIndex: isFront ? 1 : 0,
            }}
          >
            {item.tipo === "imagen" ? (
              <img
                src={item.url}
                alt=""
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <video
                ref={(el) => {
                  videoRefs.current[layerIdx] = el;
                }}
                src={item.url}
                muted
                playsInline
                preload="auto"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onEnded={() => isFront && advance()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
