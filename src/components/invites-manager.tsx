import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Mail } from "lucide-react";
import { useTeam } from "@/lib/team";
import { PendingButton } from "@/components/pending-button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { ConfirmButton, useStatusToast } from "@/components/project-parts";
import type { Role } from "@/server/db/schema";
import { createInvite, listInvites, revokeInvite, type PendingInvite } from "@/server/invites";

export const roleChoices: { role: Role; label: string; description: string }[] = [
  { role: "viewer", label: "Viewer", description: "Watches and leaves Comments." },
  { role: "editor", label: "Editor", description: "Also uploads and manages Videos." },
  { role: "owner", label: "Owner", description: "Also manages the Team." },
];

const roleLabel = (role: Role) => roleChoices.find((choice) => choice.role === role)?.label ?? role;

const expiryDate = (expiresAt: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(expiresAt);

const queryKey = ["invites"];

export function InvitesManager() {
  const team = useTeam().data;
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>("viewer");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  useStatusToast(status);
  const linkHeading = useRef<HTMLHeadingElement>(null);
  const pendingHeading = useRef<HTMLHeadingElement>(null);

  const pending = useQuery({ queryKey, queryFn: () => listInvites() });

  const create = useMutation({
    mutationFn: () => createInvite({ data: { role } }),
    onSuccess: (created) => {
      setLink(created.url);
      setCopied(false);
      setStatus(`${roleLabel(created.invite.role)} Invite created`);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ invites: PendingInvite[] }>(queryKey);
      queryClient.setQueryData(queryKey, {
        invites: previous?.invites.filter((invite) => invite.id !== id) ?? [],
      });
      pendingHeading.current?.focus();
      setStatus("Invite revoked");
      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      setStatus("");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    if (link) linkHeading.current?.focus();
  }, [link]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setStatus("Link copied");
    } catch {
      setStatus("Could not copy. Select the link and copy it yourself.");
    }
  }

  const invites = pending.data?.invites;

  return (
    <div className="w-full max-w-xl space-y-8">
      <p role="status" className="sr-only">
        {status}
      </p>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Fieldset className="max-w-none gap-3">
          <FieldsetLegend>Invite someone as</FieldsetLegend>
          <RadioGroup value={role} onValueChange={(next) => setRole(next as Role)}>
            {roleChoices.map((choice) => (
              <label
                key={choice.role}
                htmlFor={`invite-role-${choice.role}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-accent/40"
              >
                <Radio
                  id={`invite-role-${choice.role}`}
                  value={choice.role}
                  aria-labelledby={`role-${choice.role}`}
                />
                <span id={`role-${choice.role}`}>
                  <span className="block font-medium">{choice.label}</span>
                  <span className="block text-sm text-muted-foreground">{choice.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Fieldset>
        <PendingButton type="submit" pending={create.isPending}>
          Create Invite
        </PendingButton>
        {create.isError && <p role="alert">Could not create the Invite. Please try again.</p>}
      </form>

      {link && (
        <section className="flex flex-col gap-3">
          <h2 ref={linkHeading} tabIndex={-1} className="font-semibold outline-none">
            Invite link
          </h2>
          <p className="text-sm text-muted-foreground">
            Copy it now. It is shown only once and works for one person for 7 days.
          </p>
          <Field className="items-stretch">
            <FieldLabel htmlFor="invite-link">Link to send</FieldLabel>
            <Input
              id="invite-link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a
              className={buttonVariants({ variant: "secondary" })}
              href={`https://wa.me/?text=${encodeURIComponent(`You are invited to join ${team?.name ?? "our team"} on Cutnotes. Sign in to accept; this invitation works once and expires after 7 days.\n\n${link}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Send on WhatsApp
            </a>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 ref={pendingHeading} tabIndex={-1} className="text-lg font-semibold outline-none">
          Pending Invites
        </h2>
        {pending.isError && (
          <p role="alert">Could not load pending Invites. Please reload the page.</p>
        )}
        {revoke.isError && <p role="alert">Could not revoke the Invite. Please try again.</p>}
        {pending.isPending && <Skeleton className="h-16" />}
        {invites?.length === 0 && (
          <Empty className="rounded-xl border border-dashed py-8 md:py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Mail aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">No pending Invites.</EmptyTitle>
              <EmptyDescription>
                Create an Invite above to bring someone into the Team.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {invites && invites.length > 0 && (
          <ul className="divide-y">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span>
                  <span className="block font-medium">{roleLabel(invite.role)}</span>
                  <span className="block text-sm text-muted-foreground">
                    Expires {expiryDate(invite.expiresAt)}
                  </span>
                </span>
                <ConfirmButton
                  label={`Revoke ${roleLabel(invite.role)} Invite, expires ${expiryDate(invite.expiresAt)}`}
                  text="Revoke"
                  onConfirm={() => revoke.mutate(invite.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
