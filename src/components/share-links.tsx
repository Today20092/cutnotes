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
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { SharePermission } from "@/server/db/schema";
import { createShareLink, listShareLinks, revokeShareLink } from "@/server/sharing";

export function ShareLinksSheet({
  videoId,
  title,
  projectName,
}: {
  videoId: string;
  title: string;
  projectName: string;
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" />}>Share</SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Share Links</SheetTitle>
          <SheetDescription>
            Anyone with a link can open the latest Revision without an account.
          </SheetDescription>
        </SheetHeader>
        <ShareLinks videoId={videoId} title={title} projectName={projectName} />
      </SheetContent>
    </Sheet>
  );
}

function ShareLinks({
  videoId,
  title,
  projectName,
}: {
  videoId: string;
  title: string;
  projectName: string;
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
    mutationFn: () => createShareLink({ data: { videoId, name, permission } }),
    onSuccess: (link) => {
      setName("");
      setStatus(`Share Link ${link.name} created`);
      setCreatedId(link.id);
      return refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeShareLink({ data: { id } }),
    onSuccess: () => {
      setStatus("Share Link revoked");
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
    <div className="flex flex-col gap-6 p-4">
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
          <FieldsetLegend className="text-sm">Permission</FieldsetLegend>
          <RadioGroup
            value={permission}
            onValueChange={(next) => setPermission(next as SharePermission)}
          >
            {(
              [
                ["comment", "Can comment and draw"],
                ["view", "View only"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <Radio value={value} aria-label={label} />
                {label}
              </label>
            ))}
          </RadioGroup>
        </Fieldset>
        <PendingButton type="submit" pending={create.isPending}>
          Create Share Link
        </PendingButton>
        {create.isError && (
          <p role="alert">Could not create the Share Link. Check the name and try again.</p>
        )}
      </form>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Active links</h3>
        <p className="text-sm text-muted-foreground">
          Revoking stops new access at once. A video token already issued keeps working until it
          expires.
        </p>
        {links.isPending && <Skeleton className="h-16" />}
        {links.isError && <p role="alert">Could not load Share Links. Close this and try again.</p>}
        {revoke.isError && <p role="alert">Could not revoke the Share Link. Try again.</p>}
        {links.data?.links.length === 0 && (
          <Empty className="rounded-xl border border-dashed py-8 md:py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2 aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">No Share Links yet.</EmptyTitle>
              <EmptyDescription>
                Create a link above to let someone review this Video.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <ul className="divide-y">
          {links.data?.links.map((link) => (
            <li key={link.id} className="flex flex-col gap-2 py-3 wrap-anywhere">
              <p className="font-medium">
                {link.name}{" "}
                <Badge variant="secondary">
                  {link.permission === "view" ? "View only" : "Can comment and draw"}
                </Badge>
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonVariants({ variant: "secondary" })}
                  href={`https://wa.me/?text=${encodeURIComponent(`${team?.name ?? "The team"} invited you to ${link.permission === "view" ? "view" : "review"} "${title}" in "${projectName}". ${link.permission === "view" ? "View only." : "Leave comments and drawings."} No account needed.\n\n${urlOf(link.token)}`)}`}
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
