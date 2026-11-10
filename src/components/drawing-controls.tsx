import { cn } from "@/lib/utils";
import { Group } from "@/components/ui/group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Eraser, MoveUpRight, Pencil, Square, Undo2, Pen } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { drawingColors, validDrawing, type Shape, type Tool } from "@/lib/drawing";

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
    overlay: (selected?: { drawing: Shape[] | null }) => ({
      shapes: active || !selected ? drawing : (selected.drawing ?? []),
      active,
      tool,
      color,
      change,
    }),
    controls: (
      <div
        className={cn("flex flex-wrap items-center gap-2", active && "w-full")}
        role="group"
        aria-label="Drawing controls"
      >
        <Button
          ref={drawButton}
          variant={active ? "default" : "ghost"}
          className="w-fit"
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
          {active ? "Finish drawing" : "Draw"}
        </Button>
        {active && (
          <>
            <ToggleGroup
              aria-label="Drawing tool"
              value={[tool]}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "pen" || next === "arrow" || next === "box") setTool(next);
              }}
              variant="outline"
            >
              {(["pen", "arrow", "box"] as const).map((name) => (
                <ToggleGroupItem
                  key={name}
                  value={name}
                  className="size-11 p-0 data-pressed:ring-2 data-pressed:ring-inset data-pressed:ring-foreground"
                  aria-label={title(name)}
                  title={title(name)}
                >
                  {name === "pen" ? (
                    <Pen aria-hidden />
                  ) : name === "arrow" ? (
                    <MoveUpRight aria-hidden />
                  ) : (
                    <Square aria-hidden />
                  )}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              aria-label="Drawing color"
              value={[color]}
              onValueChange={(values) => {
                if (values[0]) setColor(values[0]);
              }}
            >
              {drawingColors.map((value, i) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="size-11 p-0 data-pressed:ring-2 data-pressed:ring-inset data-pressed:ring-foreground"
                  aria-label={labels[i]}
                  title={labels[i]}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-full border border-foreground/40 text-xs text-black"
                    style={{ backgroundColor: value }}
                  >
                    {color === value ? "✓" : ""}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Group aria-label="Edit drawing">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Undo Drawing"
                title="Undo Drawing"
                disabled={!drawing.length}
                onClick={() => remove(drawing.slice(0, -1))}
              >
                <Undo2 aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear Drawing"
                title="Clear Drawing"
                disabled={!drawing.length}
                onClick={() => remove([])}
              >
                <Eraser aria-hidden />
              </Button>
            </Group>
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
