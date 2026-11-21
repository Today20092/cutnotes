import {
  createSwipeActions,
  css,
  definePrimitive,
  live,
  type SwipeDraft,
  type SwipeOpen,
} from "@ui-sdk/core";

type CommentListOptions = {
  comments?: { id: string; label: string; removable: boolean }[];
  onResolve?: (id: string) => void;
  onRemove?: (id: string) => void;
  onAddComment?: (timecodeMs: number, body: string) => void;
};

/** "1:05", "65" or 65000-style milliseconds. */
export function parseTimecode(time: string | number): number | null {
  if (typeof time === "number") return Number.isFinite(time) && time >= 0 ? time : null;
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(time.trim());
  if (!match) return null;
  return Math.round((Number(match[1] ?? 0) * 60 + Number(match[2])) * 1000);
}

export const commentList = definePrimitive({
  name: "comment-list",
  options: {
    comments: "value",
    onResolve: "callback",
    onRemove: "callback",
    onAddComment: "callback",
  },
  state: (_options: CommentListOptions) => ({
    open: null as SwipeOpen | null,
    swiping: null as SwipeDraft | null,
  }),
  live: ["swiping"],
  api: (context) => {
    const comments = () => context.options().comments ?? [];
    const find = (idOrLabel: string) =>
      comments().find(
        (comment) =>
          comment.id === idOrLabel ||
          comment.label.toLowerCase().includes(idOrLabel.trim().toLowerCase()),
      );
    const resolve = (idOrLabel: string) => {
      const comment = find(idOrLabel);
      const onResolve = context.options().onResolve;
      if (!comment || !onResolve) return false;
      onResolve(comment.id);
      return true;
    };
    const swipe = createSwipeActions(context, {
      key: "open",
      draft: "swiping",
      fullSwipe: () => 0.45,
      disabled: (key) => !comments().some((comment) => comment.id === key),
      onFullSwipe: (key, side) => side === "start" && resolve(key),
    });
    return {
      comments,
      resolve,
      swipe,
      remove(idOrLabel: string) {
        const comment = find(idOrLabel);
        const onRemove = context.options().onRemove;
        if (!comment?.removable || !onRemove) return false;
        onRemove(comment.id);
        return true;
      },
      addComment(time: string | number, body: string) {
        const timecodeMs = parseTimecode(time);
        const onAddComment = context.options().onAddComment;
        if (timecodeMs === null || !body.trim() || !onAddComment) return false;
        onAddComment(timecodeMs, body.trim());
        return true;
      },
    };
  },
  slots: (slot) => ({
    root: slot({}),
    row: slot<{ value: string }>({
      props: { value: "string" },
      on: {
        pointerdown: (event, { el, api, key }) => {
          const pointer = event as PointerEvent;
          if (pointer.pointerType === "touch") api.swipe.pointerdown(pointer, key, el!);
        },
      },
      bind: (el, part) => part.api.swipe.bindRow(el, part.key),
    }),
    content: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ style: css({ transform: "translateX(var(--swipe-x, 0px))" }) }),
      live: live((state, { api, key }) => api.swipe.contentAttrs(state, key)),
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { api, key }) => ({
        type: "button",
        ...api.swipe.actionsAttrs(state, key, "start"),
      }),
      bind: (el, { api, key }) => api.swipe.bindActions(el, key, "start"),
      press: ({ api, key }) => api.resolve(key),
    }),
  }),
  agent: {
    actions: ["resolve", "remove", "addComment"],
    items: (api) => api.comments().map(({ id, label }) => ({ value: id, label })),
  },
});
