import {
  announce,
  createRovingFocus,
  createSwipeActions,
  css,
  definePrimitive,
  isRTL,
  live,
  type SwipeDraft,
  type SwipeOpen,
  type SwipeSide,
} from "@ui-sdk/core";

export type QueueNote = { id: string; label: string; removable: boolean };

export type ReviewQueueOptions = {
  notes?: QueueNote[];
  onResolve?: (id: string) => void;
  onRemove?: (id: string) => void;
  onAddNote?: (timecodeMs: number, body: string) => void;
};

/** "1:05", "65" or 65000-style milliseconds. */
export function parseTimecode(time: string | number): number | null {
  if (typeof time === "number") return Number.isFinite(time) && time >= 0 ? time : null;
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(time.trim());
  if (!match) return null;
  return Math.round((Number(match[1] ?? 0) * 60 + Number(match[2])) * 1000);
}

/**
 * A list of open notes. Swipe a row right to resolve it or left to delete it;
 * on a focused row, Right and Left do the same and Up and Down move between rows.
 */
export const reviewQueue = definePrimitive({
  name: "review-queue",
  options: { notes: "value", onResolve: "callback", onRemove: "callback", onAddNote: "callback" },
  state: (_options: ReviewQueueOptions) => ({
    open: null as SwipeOpen | null,
    swiping: null as SwipeDraft | null,
    focused: null as string | null,
  }),
  live: ["swiping"],
  api: (context) => {
    const notes = () => context.options().notes ?? [];
    const find = (idOrLabel: string) => {
      const needle = idOrLabel.trim().toLowerCase();
      return notes().find(
        (note) => note.id === idOrLabel || note.label.toLowerCase().includes(needle),
      );
    };
    const resolve = (idOrLabel: string) => {
      const note = find(idOrLabel);
      if (!note) return false;
      context.options().onResolve?.(note.id);
      announce(`Resolved: ${note.label}`);
      return true;
    };
    const remove = (idOrLabel: string) => {
      const note = find(idOrLabel);
      if (!note?.removable) return false;
      context.options().onRemove?.(note.id);
      announce(`Deleted: ${note.label}. Undo is available for 5 seconds.`);
      return true;
    };
    const act = (key: string, side: SwipeSide) => (side === "start" ? resolve(key) : remove(key));
    const swipe = createSwipeActions(context, {
      key: "open",
      draft: "swiping",
      fullSwipe: () => 0.45,
      onFullSwipe: (key, side) => act(key, side),
    });
    const roving = createRovingFocus(context, {
      slot: "content",
      key: "focused",
      orientation: () => "vertical",
    });
    return {
      act,
      swipe,
      roving,
      notes,
      resolve,
      remove,
      addNote(time: string | number, body: string) {
        const timecodeMs = parseTimecode(time);
        if (timecodeMs === null || !body.trim()) return false;
        context.options().onAddNote?.(timecodeMs, body.trim());
        return true;
      },
      keydown(event: KeyboardEvent, key: string, el: HTMLElement) {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          const towardEnd = (event.key === "ArrowRight") !== isRTL(el);
          act(key, towardEnd ? "start" : "end");
          return;
        }
        if (event.key === "Delete") {
          event.preventDefault();
          remove(key);
          return;
        }
        roving.keydown(event, el);
      },
    };
  },
  slots: (slot) => ({
    root: slot({}),
    row: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        style: css({ position: "relative", overflow: "hidden", "touch-action": "pan-y" }),
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          api.swipe.pointerdown(event as PointerEvent, key, el!),
      },
      bind: (el, part) => part.api.swipe.bindRow(el, part.key),
    }),
    content: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-keyshortcuts": "ArrowRight ArrowLeft Delete",
        style: css({ transform: "translateX(var(--swipe-x, 0px))" }),
      }),
      live: live((state, { api, key }) => api.swipe.contentAttrs(state, key)),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event as KeyboardEvent, key, el!),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    // Keyed by `id`: parts without an id or value share one key and the last row's props.
    actions: slot<{ id: string; row: string; side: SwipeSide }>({
      props: { id: "string", row: "string", side: "string" },
      attrs: (state, { api, props }) => api.swipe.actionsAttrs(state, props.row, props.side),
      bind: (el, { api, props }) => api.swipe.bindActions(el, props.row, props.side),
    }),
    action: slot<{ id: string; row: string; side: SwipeSide }>({
      props: { id: "string", row: "string", side: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, props }) => api.act(props.row, props.side),
    }),
  }),
  agent: {
    actions: ["resolve", "remove", "addNote"],
    items: (api) => api.notes().map((note) => ({ value: note.id, label: note.label })),
  },
});
