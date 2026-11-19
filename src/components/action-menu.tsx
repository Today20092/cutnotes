import { Ellipsis } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";

export type Action = {
  label: string;
  destructive?: boolean;
  /** The sheet the item opens, already open; call `onClosed` when it closes. */
  sheet?: (onClosed: () => void) => ReactNode;
  /** Runs at once instead, for an item that needs no sheet. */
  onSelect?: () => void;
};

/** A `⋯` button whose items run at once or open a sheet. Focus returns to the button when the sheet closes. */
export function ActionMenu({ label, actions }: { label: string; actions: Action[] }) {
  const [open, setOpen] = useState<Action | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (actions.length === 0) return null;
  const closed = () => {
    setOpen(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button ref={trigger} variant="ghost" size="icon" aria-label={label} />}
        >
          <Ellipsis aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end">
          {actions.map((action) => (
            <MenuItem
              key={action.label}
              className="min-h-11"
              variant={action.destructive ? "destructive" : "default"}
              onSelect={() => (action.sheet ? setOpen(action) : action.onSelect?.())}
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
