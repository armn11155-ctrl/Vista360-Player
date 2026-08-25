import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

export type CommandKind = "cliente" | "campana" | "panel" | "modulo" | "accion";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  detail?: string;
  keywords?: string[];
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  contexto?: string;
}

const ETIQUETAS: Record<CommandKind, string> = {
  cliente: "Cliente",
  campana: "Campaña",
  panel: "Panel",
  modulo: "Ir a",
  accion: "Acción",
};

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .trim();
}

/**
 * Buscador global totalmente local. Los elementos vienen de datos que la
 * pantalla ya tiene en memoria; escribir nunca dispara Firestore, Functions ni
 * R2. Cmd/Ctrl+K funciona en laptop y el mismo diálogo se puede abrir desde el
 * botón visible del sidebar/selector en móvil.
 */
export default function CommandPalette({ open, onOpenChange, items, contexto }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const queryDeferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    focoAnteriorRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflowAnterior;
      focoAnteriorRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const resultados = useMemo(() => {
    const termino = normalizar(queryDeferred);
    if (!termino) return items.slice(0, 12);
    const palabras = termino.split(/\s+/).filter(Boolean);
    return items
      .filter((item) => {
        const texto = normalizar([item.label, item.detail, ...(item.keywords ?? [])].filter(Boolean).join(" "));
        return palabras.every((palabra) => texto.includes(palabra));
      })
      .slice(0, 20);
  }, [items, queryDeferred]);

  useEffect(() => {
    setActiveIndex((indice) => Math.min(indice, Math.max(0, resultados.length - 1)));
  }, [resultados.length]);

  function ejecutar(item: CommandItem | undefined) {
    if (!item) return;
    onOpenChange(false);
    item.onSelect();
  }

  if (!open) return null;

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onOpenChange(false);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((indice) => Math.min(indice + 1, resultados.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((indice) => Math.max(indice - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            ejecutar(resultados[activeIndex]);
          }
        }}
      >
        <div className="command-palette-head">
          <span className="command-palette-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" />
            </svg>
          </span>
          <div className="command-palette-input-wrap">
            <label id="command-palette-title" htmlFor="command-palette-input">Buscar en Vista360</label>
            <input
              ref={inputRef}
              id="command-palette-input"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-results"
              aria-activedescendant={resultados[activeIndex] ? `command-${resultados[activeIndex].id}` : undefined}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              placeholder="Clientes, campañas, paneles o módulos…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <kbd>ESC</kbd>
        </div>

        {contexto && <div className="command-palette-context">Buscando en {contexto}</div>}

        <div id="command-palette-results" className="command-palette-results" role="listbox">
          {resultados.length > 0 ? resultados.map((item, index) => (
            <button
              type="button"
              id={`command-${item.id}`}
              key={item.id}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => ejecutar(item)}
            >
              <span className={`command-palette-kind kind-${item.kind}`}>{ETIQUETAS[item.kind]}</span>
              <span className="command-palette-copy">
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </span>
              <span className="command-palette-enter" aria-hidden="true">↵</span>
            </button>
          )) : (
            <div className="command-palette-empty">
              <strong>Sin coincidencias</strong>
              <span>Prueba con el nombre del cliente, campaña o sección.</span>
            </div>
          )}
        </div>
        <div className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> recorrer</span>
          <span><kbd>↵</kbd> abrir</span>
          <span>Sin consultas adicionales</span>
        </div>
      </div>
    </div>
  );
}
