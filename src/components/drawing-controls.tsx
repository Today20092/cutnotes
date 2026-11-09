import { Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { drawingColors, readDrawing, validDrawing, type Shape, type Tool } from "@/lib/drawing";

/** The Drawing state and controls shared by the Member and Guest review screens. */
export function useDrawingControls({
  timeMs,
  seek,
  deselect,
}: {
  timeMs: number;
  seek: (timeMs: number) => void;
  deselect: () => void;
}) {
  const [drawing, setDrawing] = useState<Shape[]>([]);
  const [active, setActive] = useState(false);
  const [drawingTime, setDrawingTime] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(drawingColors[0]);
  const [error, setError] = useState("");
  const drawButton = useRef<HTMLButtonElement>(null);
  const time = drawing.length ? (drawingTime ?? timeMs) : timeMs;
  function change(shapes: Shape[]) {
    if (shapes.length && !validDrawing(shapes)) {
      setError("Drawing is too large. Undo or clear before continuing.");
      return;
    }
    setError("");
    setDrawing(shapes);
  }
  /** The Undo and Clear buttons disable once nothing is left, which would drop focus to the page. */
  function remove(shapes: Shape[]) {
    change(shapes);
    if (!shapes.length) requestAnimationFrame(() => drawButton.current?.focus());
  }
  const labels = ["Red", "Yellow", "Green", "Blue", "White"];
  const title = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
  return {
    drawing,
    time,
    stop: () => setActive(false),
    reset: () => {
      setDrawing([]);
      setActive(false);
      setDrawingTime(null);
    },
    /** Pass the selected Comment to replay its Drawing instead of the one being made. */
    overlay: (selected?: { drawing: string | null }) => ({
      shapes: active || !selected ? drawing : readDrawing(selected.drawing),
      active,
      tool,
      color,
      change,
    }),
    controls: (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Drawing controls">
        <Button
          ref={drawButton}
          variant={active ? "default" : "ghost"}
          className="min-h-11 sm:min-h-8"
          aria-pressed={active}
          onClick={() => {
            if (active) {
              setActive(false);
              requestAnimationFrame(() => drawButton.current?.focus());
            } else {
              seek(time);
              if (!drawing.length) setDrawingTime(timeMs);
              deselect();
              setActive(true);
            }
          }}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          {active ? "Finish Drawing" : "Draw"}
        </Button>
        {active && (
          <>
            {(["pen", "arrow", "box"] as const).map((name) => (
              <Button
                key={name}
                variant={tool === name ? "default" : "outline"}
                aria-label={title(name)}
                aria-pressed={tool === name}
                onClick={() => setTool(name)}
              >
                <span aria-hidden="true">{tool === name ? "✓ " : ""}</span>
                {title(name)}
              </Button>
            ))}
            {drawingColors.map((value, i) => (
              <Button
                key={value}
                variant={color === value ? "default" : "outline"}
                aria-label={labels[i]}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
              >
                <span aria-hidden="true">{color === value ? "✓ " : ""}</span>
                {labels[i]}
              </Button>
            ))}
            <Button
              variant="ghost"
              disabled={!drawing.length}
              onClick={() => remove(drawing.slice(0, -1))}
            >
              Undo Drawing
            </Button>
            <Button variant="ghost" disabled={!drawing.length} onClick={() => remove([])}>
              Clear Drawing
            </Button>
            <p className="w-full text-sm text-muted-foreground">
              Draw on the picture, or add a Comment at this moment.
            </p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    ),
  };
}
