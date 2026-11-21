import {
  createChange,
  createRovingFocus,
  createTransfer,
  definePrimitive,
  type TransferDraft,
  type TransferLists,
} from "@ui-sdk/core";

export type ReviewBoardOptions = {
  lists?: TransferLists;
  defaultLists?: TransferLists;
  onListsChange?: (lists: TransferLists) => void;
  /** Column key to its name. */
  columns?: Record<string, string>;
  /** Card key to its name. */
  titles?: Record<string, string>;
  /** Cards that can't be picked up, and that `setStage` refuses to move. */
  locked?: string[];
};

/**
 * Cards in Stage columns. Drag a card, or focus it and press Space to pick it up,
 * Left and Right to change column, Up and Down to place it, and Space to drop.
 * Columns are plain lists and cards are articles, so a card can hold a link and a menu.
 */
export const reviewBoard = definePrimitive({
  name: "review-board",
  options: {
    lists: "value",
    defaultLists: "value",
    onListsChange: "callback",
    columns: "value",
    titles: "value",
    locked: "value",
  },
  controlled: ["lists"],
  state: (options: ReviewBoardOptions) => ({
    lists: options.lists ?? options.defaultLists ?? {},
    moving: null as TransferDraft | null,
    focused: null as string | null,
  }),
  sync: (options) => (options.lists === undefined ? {} : { lists: options.lists }),
  api: (context) => {
    const change = createChange(context);
    const columns = () => context.options().columns ?? {};
    const titles = () => context.options().titles ?? {};
    const transfer = createTransfer(context, {
      key: "lists",
      draft: "moving",
      set: (value, details) => change("lists", value, details),
      order: () => Object.keys(columns()),
      disabled: (key) => (context.options().locked ?? []).includes(key),
      label: (key) => titles()[key],
      listLabel: (list) => columns()[list],
      createAutoScroll: false,
    });
    const roving = createRovingFocus(context, {
      slot: "card",
      key: "focused",
      orientation: () => "vertical",
    });
    const pick = (record: Record<string, string>, name: string) => {
      const needle = name.trim().toLowerCase();
      return Object.keys(record).find(
        (key) => key === name || record[key]!.toLowerCase() === needle,
      );
    };
    return {
      transfer,
      roving,
      /** Moves a card, named by key or title, to the end of a column, named by key or name. */
      setStage(card: string, column: string) {
        const key = pick(titles(), card);
        const list = pick(columns(), column);
        if (!key || !list || (context.options().locked ?? []).includes(key)) return false;
        return transfer.move(key, list, (context.store.get().lists[list] ?? []).length);
      },
    };
  },
  slots: (slot) => ({
    root: slot<{}, { lists: TransferLists }>({
      state: (state, { api }) => ({ lists: api.transfer.lists(state) }),
    }),
    column: slot<{ value: string }>({
      props: { value: "string" },
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-roledescription": "card",
        "data-grabbed": part.api.transfer.moving(state, part.key) ? "" : undefined,
      }),
      on: {
        // Keys pressed on the card's own link or menu keep their usual meaning.
        keydown: (event, { el, api, key }) =>
          event.target === el &&
          (api.transfer.keydown(event as KeyboardEvent, key) ||
            api.roving.keydown(event as KeyboardEvent, el!)),
        pointerdown: (event, { api, key }) => api.transfer.pointerdown(event as PointerEvent, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.transfer.bindItem(el, part.key)];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
  agent: { actions: ["setStage"] },
});
