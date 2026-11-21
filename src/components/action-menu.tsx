import { Ellipsis } from "lucide-react";
import { useRef, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";

/** A quiet icon button. `label` is its accessible name and its hover and focus tooltip; touch shows no tooltip, so use it only for well-known glyphs. */
export function IconAction({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

export type Action<Id extends string = string> = {
  label: string;
  destructive?: boolean;
  /** Names the sheet in the URL (`?sheet=<id>`) for an item that opens one. */
  id?: Id;
  /** The sheet the item opens, already open; call `onClosed` when it closes. */
  sheet?: (onClosed: () => void) => ReactNode;
  /** Runs at once instead, for an item that needs no sheet. */
  onSelect?: () => void;
};

/**
 * A `⋯` button whose items run at once or open a sheet. Which sheet is open lives in the URL:
 * `current` is the open action's `id` and `onCurrentChange` writes it. Focus returns to the
 * button when the sheet closes.
 */
export function ActionMenu<Id extends string = string>({
  label,
  actions,
  current,
  onCurrentChange,
  triggerContent,
}: {
  label: string;
  actions: Action<Id>[];
  current?: string;
  onCurrentChange?: (id: Id | undefined) => void;
  triggerContent?: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  if (actions.length === 0) return null;
  const open = current ? actions.find((action) => action.id === current) : undefined;
  const closed = () => {
    onCurrentChange?.(undefined);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              ref={trigger}
              variant="ghost"
              size={triggerContent ? "sm" : "icon"}
              className={triggerContent ? "min-h-11 px-1 sm:pointer-fine:min-h-0" : undefined}
              aria-label={label}
            />
          }
        >
          {triggerContent ?? <Ellipsis aria-hidden />}
        </MenuTrigger>
        <MenuPopup align="end">
          {actions.map((action) => (
            <MenuItem
              key={action.label}
              className="min-h-11"
              variant={action.destructive ? "destructive" : "default"}
              onSelect={() => (action.sheet ? onCurrentChange?.(action.id) : action.onSelect?.())}
            >
              {action.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
      {open?.sheet?.(closed)}
    </>
  );
}
