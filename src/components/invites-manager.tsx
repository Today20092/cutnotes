import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role } from "@/server/db/schema";
import {
  createInvite,
  listInvites,
  revokeInvite,
  type PendingInvite,
} from "@/server/invites";

const roleChoices: { role: Role; label: string; description: string }[] = [
  { role: "viewer", label: "Viewer", description: "Watches and leaves Comments." },
  { role: "editor", label: "Editor", description: "Also uploads and manages Videos." },
  { role: "owner", label: "Owner", description: "Also manages the Team." },
];

const roleLabel = (role: Role) =>
  roleChoices.find((choice) => choice.role === role)?.label ?? role;

const expiryDate = (expiresAt: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(expiresAt);

const queryKey = ["invites"];

export function InvitesManager() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role>("viewer");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
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
    <div className="mx-auto max-w-xl space-y-8">
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
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Invite someone as</legend>
          {roleChoices.map((choice) => (
            <label
              key={choice.role}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input p-3 has-checked:border-2 has-checked:border-foreground"
            >
              <input
                type="radio"
                name="role"
                className="size-4 accent-foreground"
                checked={role === choice.role}
                onChange={() => setRole(choice.role)}
              />
              <span>
                <span className="block font-medium">{choice.label}</span>
                <span className="block text-sm text-muted-foreground">
                  {choice.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={create.isPending}>
          Create Invite
        </Button>
        {create.isError && (
          <p role="alert">Could not create the Invite. Please try again.</p>
        )}
      </form>

      {link && (
        <section className="space-y-3 rounded-lg border border-input p-4">
          <h2 ref={linkHeading} tabIndex={-1} className="font-semibold outline-none">
            Invite link
          </h2>
          <p className="text-sm text-muted-foreground">
            Copy it now. It is shown only once and works for one person for 7 days.
          </p>
          <div className="space-y-1">
            <label htmlFor="invite-link" className="text-sm font-medium">
              Link to send
            </label>
            <Input
              id="invite-link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={`https://wa.me/?text=${encodeURIComponent(link)}`}
              target="_blank"
              rel="noreferrer"
            >
              Send on WhatsApp
            </a>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 ref={pendingHeading} tabIndex={-1} className="font-semibold outline-none">
          Pending Invites
        </h2>
        {pending.isError && (
          <p role="alert">Could not load pending Invites. Please reload the page.</p>
        )}
        {revoke.isError && (
          <p role="alert">Could not revoke the Invite. Please try again.</p>
        )}
        {pending.isPending && <Skeleton className="h-16" />}
        {invites?.length === 0 && (
          <p className="text-muted-foreground">No pending Invites.</p>
        )}
        {invites && invites.length > 0 && (
          <ul className="divide-y rounded-lg border border-input">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span>
                  <span className="block font-medium">{roleLabel(invite.role)}</span>
                  <span className="block text-sm text-muted-foreground">
                    Expires {expiryDate(invite.expiresAt)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Revoke ${roleLabel(invite.role)} Invite, expires ${expiryDate(invite.expiresAt)}`}
                  onClick={() => revoke.mutate(invite.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
