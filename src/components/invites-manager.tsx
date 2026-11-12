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
import type { Role } from "@/server/db/schema";
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

type Invite = Awaited<ReturnType<typeof listInvites>>["invites"][number];
const inviteStatus = (invite: Invite) =>
  invite.usedAt !== null
    ? "Accepted"
    : invite.revokedAt !== null
      ? "Revoked"
      : invite.expiresAt <= Date.now()
        ? "Expired"
        : "Pending";

export function InvitesManager({ projectId }: { projectId?: string }) {
  const team = useTeam().data;
  const queryClient = useQueryClient();
  const queryKey = ["invites", projectId ?? "all"];
  const [role, setRole] = useState<Role>("viewer");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  useStatusToast(status);
  const linkHeading = useRef<HTMLHeadingElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const label = (value: Role, isProject = Boolean(projectId)) =>
    isProject && value === "viewer"
      ? "Reviewer"
      : (roleChoices.find((choice) => choice.role === value)?.label ?? value);
  const choices = projectId
    ? roleChoices
        .filter((choice) => choice.role !== "owner")
        .map((choice) => ({
          ...choice,
          label: label(choice.role),
          description:
            choice.role === "editor"
              ? "Watches, comments, uploads and manages videos in this project."
              : "Watches and comments in this project.",
        }))
    : roleChoices;

  const history = useQuery({
    queryKey,
    queryFn: () => listInvites({ data: projectId ? { projectId } : undefined }),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invites"] });
  const create = useMutation({
    mutationFn: () => createInvite({ data: { role, note, ...(projectId ? { projectId } : {}) } }),
    onSuccess: (created) => {
      setLink(created.url);
      setCopied(false);
      setStatus(`${label(created.invite.role)} Invite created`);
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onSuccess: () => {
      historyHeading.current?.focus();
      setStatus("Invite revoked");
      void refresh();
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
    <div className="flex w-full max-w-xl flex-col gap-8">
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
        <fieldset>
          <legend className="mb-2 font-medium">Invite someone as</legend>
          <RadioGroup value={role} onValueChange={(next) => setRole(next as Role)}>
            {choices.map((choice) => (
              <label
                key={choice.role}
                htmlFor={`invite-role-${projectId ?? "team"}-${choice.role}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 py-2"
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
        </fieldset>
        <label className="flex flex-col gap-2">
          Optional note
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={240}
            placeholder="For Alex — episode 12"
          />
        </label>
        <p className="text-sm text-muted-foreground">
          The note is for Owners. Anyone with this link can accept it once; it is not tied to an
          email address.
        </p>
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
          <label className="flex flex-col gap-2">
            Link to send
            <Input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          </label>
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
      <section className="flex flex-col gap-3">
        <h2 ref={historyHeading} tabIndex={-1} className="text-lg font-semibold outline-none">
          Invitation history
        </h2>
        {history.isError && <p role="alert">Could not load Invites. Please reload the page.</p>}
        {revoke.isError && <p role="alert">Could not revoke the Invite. Please try again.</p>}
        {history.isPending && <Skeleton className="h-16" />}
        {history.data?.invites.length === 0 && (
          <p className="text-muted-foreground">No Invites yet.</p>
        )}
        <ul className="divide-y">
          {history.data?.invites.map((invite) => {
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
                          hash="people"
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
