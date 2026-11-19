import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTeam } from "@/lib/team";
import { PendingButton } from "@/components/pending-button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ConfirmButton, useStatusToast } from "@/components/project-parts";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SharePermission } from "@/server/db/schema";
import { createShareLink, listShareLinks, revokeShareLink } from "@/server/sharing";

type Revision = { id: string; number: number };

const permissionLabels: Record<SharePermission, string> = {
  view: "View only",
  comment: "Comment and draw",
};
const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp);

/**
 * Share Links for one Video: each pins one Revision, so the customer sees exactly that cut.
 * Opened by `?sheet=customer` on the Video page.
 */
export function CustomerLinkSheet({
  videoId,
  title,
  revision,
  open,
  onOpenChange,
}: {
  videoId: string;
  title: string;
  /** The Revision being viewed, which a new link pins. */
  revision: Revision;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={mobile ? "bottom" : "right"}
        className="overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Send to customer</SheetTitle>
          <SheetDescription>
            The customer opens Revision {revision.number} of {title} without an account. They see
            only that Revision and their own comments, never your Team's notes.
          </SheetDescription>
        </SheetHeader>
        <CustomerLinks videoId={videoId} title={title} revision={revision} />
      </SheetContent>
    </Sheet>
  );
}

function CustomerLinks({
  videoId,
  title,
  revision,
}: {
  videoId: string;
  title: string;
  revision: Revision;
}) {
  const team = useTeam().data;
  const client = useQueryClient();
  const queryKey = ["share-links", videoId];
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<SharePermission>("comment");
  const [status, setStatus] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const copyNew = useRef<HTMLButtonElement>(null);
  useStatusToast(status);
  const links = useQuery({ queryKey, queryFn: () => listShareLinks({ data: { videoId } }) });
  const refresh = () => client.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: () =>
      createShareLink({ data: { videoId, revisionId: revision.id, name, permission } }),
    onSuccess: (link) => {
      setName("");
      setStatus(`Link for ${link.name} created`);
      setCreatedId(link.id);
      return refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeShareLink({ data: { id } }),
    onSuccess: () => {
      setStatus("Link revoked");
      return refresh();
    },
  });
  // The Copy button for a new link appears only after the list refreshes.
  const newLinkListed = links.data?.links.some((link) => link.id === createdId) ?? false;
  useEffect(() => {
    if (newLinkListed) copyNew.current?.focus();
  }, [newLinkListed, createdId]);
  const urlOf = (token: string) => `${location.origin}/share/${token}`;
  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(urlOf(token));
      setStatus("Link copied");
    } catch {
      setStatus("Could not copy. Use Send on WhatsApp instead.");
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 pt-0">
      <p role="status" className="sr-only">
        {status}
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <p className="font-medium">Revision {revision.number}</p>
        <Field className="items-stretch">
          <FieldLabel htmlFor="share-name">Who is this link for?</FieldLabel>
          <Input
            id="share-name"
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Fieldset className="max-w-none gap-3">
          <FieldsetLegend className="text-sm">What can they do?</FieldsetLegend>
          <RadioGroup
            value={permission}
            onValueChange={(next) => setPermission(next as SharePermission)}
          >
            {(["comment", "view"] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <Radio value={value} aria-label={permissionLabels[value]} />
                {permissionLabels[value]}
              </label>
            ))}
          </RadioGroup>
        </Fieldset>
        <PendingButton type="submit" pending={create.isPending}>
          Create link
        </PendingButton>
        {create.isError && (
          <p role="alert">Could not create the link. Check the name and try again.</p>
        )}
      </form>
      <section className="flex flex-col gap-3" aria-labelledby="customer-links-heading">
        <h3 id="customer-links-heading" className="font-semibold">
          Links for this Video
        </h3>
        <p className="text-sm text-muted-foreground">
          Revoking stops new access at once. A video token already issued keeps working until it
          expires.
        </p>
        {links.isPending && <Skeleton className="h-16" />}
        {links.isError && <p role="alert">Could not load links. Close this and try again.</p>}
        {revoke.isError && <p role="alert">Could not revoke the link. Try again.</p>}
        {links.data?.links.length === 0 && (
          <Empty className="rounded-xl border border-dashed py-8 md:py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2 aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">No links yet.</EmptyTitle>
              <EmptyDescription>
                Create a link above to send this Video to a customer.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <ul className="divide-y">
          {links.data?.links.map((link) => (
            <li key={link.id} className="flex flex-col gap-2 py-3 wrap-anywhere">
              <p className="font-medium">{link.name}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {link.revisionNumber === null
                    ? "Follows latest"
                    : `Revision ${link.revisionNumber}`}
                </Badge>
                <Badge variant="outline">{permissionLabels[link.permission]}</Badge>
                <span>Created {formatDate(link.createdAt)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonVariants({ variant: "secondary" })}
                  href={`https://wa.me/?text=${encodeURIComponent(`${team?.name ?? "The team"} invited you to ${link.permission === "view" ? "view" : "review"} "${title}". ${link.permission === "view" ? "View only." : "Leave comments and drawings."} No account needed.\n\n${urlOf(link.token)}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Send on WhatsApp for ${link.name}`}
                >
                  Send on WhatsApp
                </a>
                <Button
                  ref={link.id === createdId ? copyNew : undefined}
                  type="button"
                  variant={link.id === createdId ? "default" : "secondary"}
                  aria-label={`Copy link for ${link.name}`}
                  onClick={() => void copy(link.token)}
                >
                  Copy link
                </Button>
                <ConfirmButton
                  label={`Revoke link for ${link.name}`}
                  text="Revoke"
                  disabled={revoke.isPending}
                  onConfirm={() => revoke.mutate(link.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
