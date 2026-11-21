import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { ChevronRight, Mail } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTeam } from "@/lib/team";
import { PendingButton } from "@/components/pending-button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { ConfirmButton, useStatusToast } from "@/components/project-parts";
import { roleLabel, shareRoles } from "@/lib/share-roles";
import type { InviteRole, Role } from "@/server/db/schema";
import { createInvite, listInvites, revokeInvite } from "@/server/invites";

export const roleChoices: { role: Role; label: string; description: string }[] = [
  {
    role: "viewer",
    label: "Viewer",
    description: "Reviews assigned projects. Project roles control uploads.",
  },
  {
    role: "editor",
    label: "Editor",
    description: "Can also create projects. Existing projects require assignment.",
  },
  {
    role: "owner",
    label: "Owner",
    description: "Accesses all projects and manages the Team and sharing.",
  },
];

const expiryDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);

/** A Project Invite offers a Project role; a Team Invite a Team Role. */
export const inviteRoleLabel = (value: InviteRole, scoped: boolean) =>
  scoped ? roleLabel(value) : (roleChoices.find((choice) => choice.role === value)?.label ?? value);

export type Invite = Awaited<ReturnType<typeof listInvites>>["invites"][number];
export const inviteStatus = (invite: Invite) =>
  invite.usedAt !== null
    ? "Accepted"
    : invite.revokedAt !== null
      ? "Revoked"
      : invite.expiresAt <= Date.now()
        ? "Expired"
        : "Pending";

/** Creates one Invite link: a Team Invite, or with `projectId` an Invite to that Project only. */
export function InviteLinkForm({
  projectId,
  nested = false,
}: {
  projectId?: string;
  nested?: boolean;
}) {
  const scoped = Boolean(projectId);
  const Heading = nested ? "h4" : "h2";
  const team = useTeam().data;
  const queryClient = useQueryClient();
  const [role, setRole] = useState<InviteRole>(scoped ? "uploader" : "viewer");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  useStatusToast(status);
  const linkHeading = useRef<HTMLHeadingElement>(null);
  const choices = scoped ? shareRoles : roleChoices;
  const create = useMutation({
    mutationFn: () => createInvite({ data: { role, note, ...(projectId ? { projectId } : {}) } }),
    onSuccess: (created) => {
      setLink(created.url);
      setCopied(false);
      setStatus(`${inviteRoleLabel(created.invite.role, scoped)} Invite created`);
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
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

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <p role="status" className="sr-only">
        {status}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Fieldset className="max-w-none gap-3">
          <FieldsetLegend>Invite someone as</FieldsetLegend>
          <RadioGroup value={role} onValueChange={(next) => setRole(next as InviteRole)}>
            {choices.map((choice) => (
              <label
                key={choice.role}
                htmlFor={`invite-role-${projectId ?? "team"}-${choice.role}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-accent/40"
              >
                <Radio
                  id={`invite-role-${projectId ?? "team"}-${choice.role}`}
                  value={choice.role}
                />
                <span>
                  <span className="block font-medium">{choice.label}</span>
                  <span className="block text-sm text-muted-foreground">{choice.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Fieldset>
        <Collapsible className="flex flex-col gap-3">
          <CollapsibleTrigger className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            <ChevronRight
              className="size-4 transition-transform group-data-[panel-open]:rotate-90"
              aria-hidden
            />
            More options
          </CollapsibleTrigger>
          <CollapsiblePanel className="flex flex-col gap-2">
            <Field className="items-stretch">
              <FieldLabel>Optional note</FieldLabel>
              <Input
                className="h-11 sm:pointer-fine:h-8"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={240}
                placeholder="For Alex — episode 12"
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              The note is for Owners. Anyone with this link can accept it once; it is not tied to an
              email address.
            </p>
          </CollapsiblePanel>
        </Collapsible>
        <PendingButton type="submit" pending={create.isPending}>
          Create Invite
        </PendingButton>
        {create.isError && <p role="alert">Could not create the Invite. Please try again.</p>}
      </form>
      {link && (
        <section className="flex flex-col gap-3">
          <Heading ref={linkHeading} tabIndex={-1} className="font-semibold outline-none">
            Invite link
          </Heading>
          <p className="text-sm text-muted-foreground">
            Copy it now. It is shown only once and works for one person for 7 days.
          </p>
          <Field className="items-stretch">
            <FieldLabel>Link to send</FieldLabel>
            <Input
              className="h-11 sm:pointer-fine:h-8"
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
              href={`https://wa.me/?text=${encodeURIComponent(`You are invited to ${projectId ? "a project" : (team?.name ?? "our team")} on Cutnotes. Sign in to accept; this invitation works once and expires after 7 days.\n\n${link}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Send on WhatsApp
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

/** A Team Invite link, and the history of every Invite. */
export function InvitesManager({ project }: { project?: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  useStatusToast(status);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const history = useQuery({
    queryKey: ["invites", "all"],
    queryFn: () => listInvites({ data: undefined }),
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onSuccess: () => {
      historyHeading.current?.focus();
      setStatus("Invite revoked");
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });
  const label = inviteRoleLabel;
  // `?project=` narrows the history to one Project's Invites.
  const invites = history.data?.invites.filter(
    (invite) => !project || invite.projectId === project,
  );

  return (
    <div className="flex w-full max-w-xl flex-col gap-8">
      <p role="status" className="sr-only">
        {status}
      </p>
      <InviteLinkForm />
      <section className="flex flex-col gap-3">
        <h2 ref={historyHeading} tabIndex={-1} className="text-section outline-none">
          Invitation history
        </h2>
        {history.isError && <p role="alert">Could not load Invites. Please reload the page.</p>}
        {revoke.isError && <p role="alert">Could not revoke the Invite. Please try again.</p>}
        {history.isPending && <Skeleton className="h-16" />}
        {project && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Showing Invites for one Project.
            <Link to="/invites" className="inline-flex min-h-11 items-center underline">
              Show all Invites
            </Link>
          </p>
        )}
        {invites?.length === 0 && (
          <Empty className="rounded-card border border-dashed py-8 md:py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Mail aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">No Invites yet.</EmptyTitle>
              <EmptyDescription>
                Create an Invite above to bring someone into the Team.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <ul className="divide-y">
          {invites?.map((invite) => {
            const state = inviteStatus(invite);
            return (
              <li key={invite.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
                  <span className="font-medium">
                    {invite.note || `${label(invite.role, Boolean(invite.projectId))} invitation`}
                  </span>
                  <span>
                    {invite.projectName ?? "Team membership"} ·{" "}
                    {label(invite.role, Boolean(invite.projectId))}
                  </span>
                  <Badge variant="secondary" className="w-fit">
                    {state}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Created by {invite.createdBy} · {expiryDate(invite.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Expires {expiryDate(invite.expiresAt)}
                  </p>
                  {invite.revokedAt !== null && (
                    <p className="text-sm text-muted-foreground">
                      Revoked {expiryDate(invite.revokedAt)}
                    </p>
                  )}
                  {invite.usedAt !== null && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Accepted by {invite.acceptedBy ?? "former member"} ·{" "}
                        {expiryDate(invite.usedAt)}
                      </p>
                      {invite.projectId ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: invite.projectId }}
                          search={{ sheet: "people" }}
                          className="inline-flex min-h-11 items-center underline"
                        >
                          Manage membership
                        </Link>
                      ) : (
                        <Link to="/members" className="inline-flex min-h-11 items-center underline">
                          Manage membership
                        </Link>
                      )}
                    </>
                  )}
                </div>
                {state === "Pending" && (
                  <ConfirmButton
                    label={`Revoke ${label(invite.role, Boolean(invite.projectId))} Invite${invite.note ? `: ${invite.note}` : ""}, expires ${expiryDate(invite.expiresAt)}`}
                    text="Revoke"
                    onConfirm={() => revoke.mutate(invite.id)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
