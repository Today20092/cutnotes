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
};

/**
 * Cards in status columns. Drag a card, or focus it and press Space to pick it up,
 * Left and Right to change column, Up and Down to place it, and Space to drop.
 */
export const reviewBoard = definePrimitive({
  name: "review-board",
  options: {
    lists: "value",
    defaultLists: "value",
    onListsChange: "callback",
    columns: "value",
    titles: "value",
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
      setStatus(card: string, column: string) {
        const key = pick(titles(), card);
        const list = pick(columns(), column);
        if (!key || !list) return false;
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
      role: "listbox",
      keys: { none: "Each card handles its own keys." },
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }>({
      props: { value: "string" },
      role: "option",
      focus: "roving",
      press: { none: "Space and Enter pick a card up through keydown." },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-selected": String(part.api.transfer.moving(state, part.key)),
        "aria-roledescription": "card",
        "data-grabbed": part.api.transfer.moving(state, part.key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.transfer.keydown(event as KeyboardEvent, key) ||
          api.roving.keydown(event as KeyboardEvent, el!),
        pointerdown: (event, { api, key }) => api.transfer.pointerdown(event as PointerEvent, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.transfer.bindItem(el, part.key)];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
  agent: { actions: ["setStatus"] },
});
