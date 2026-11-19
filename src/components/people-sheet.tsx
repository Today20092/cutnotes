import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { InviteLinkForm, inviteStatus } from "@/components/invites-manager";
import { PendingButton } from "@/components/pending-button";
import type { Person } from "@/components/people";
import { PersonAvatar } from "@/components/person-avatar";
import { ConfirmButton, WriteFeedback } from "@/components/project-parts";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { roleLabel, shareRoles } from "@/lib/share-roles";
import { projectsKey } from "@/lib/writes";
import type { ProjectRole } from "@/server/db/schema";
import { listInvites, revokeInvite } from "@/server/invites";
import {
  listProjectMembers,
  removeProjectMember,
  setProjectMember,
} from "@/server/project-members";

const wideSheetClass = "sm:max-w-lg data-[side=right]:sm:max-w-lg";
const rowClass = "flex flex-wrap items-center justify-between gap-3 py-3";

const expiryDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp);

function RoleSelect({
  label,
  value,
  disabled,
  onChange,
  ...props
}: {
  label?: string;
  value: ProjectRole;
  disabled?: boolean;
  onChange: (role: ProjectRole) => void;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <NativeSelect
      {...props}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ProjectRole)}
    >
      {shareRoles.map((choice) => (
        <option key={choice.role} value={choice.role}>
          {choice.label}
        </option>
      ))}
    </NativeSelect>
  );
}

function PersonName({
  name,
  avatarUrl,
  detail,
}: {
  name: string;
  avatarUrl: string | null;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 wrap-anywhere">
      <PersonAvatar name={name} src={avatarUrl} />
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Who can open a Project. Owners change it here; everyone else with access sees the list.
 * Opened by `?sheet=people` on the Project page.
 */
export function PeopleSheet({
  projectId,
  name,
  people,
  canManage,
  open,
  onOpenChange,
}: {
  projectId: string;
  name: string;
  people: Person[];
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={mobile ? "bottom" : "right"} className={wideSheetClass}>
        <SheetHeader>
          <SheetTitle>People</SheetTitle>
          <SheetDescription>
            Who can open {name}. Team Owners always have access. Guest review links are separate.
          </SheetDescription>
        </SheetHeader>
        {canManage ? (
          <ManagePeople projectId={projectId} />
        ) : (
          <div className="p-4 pt-0">
            <h3 className="text-section">People with access</h3>
            {people.length === 0 ? (
              <p className="py-3 text-muted-foreground">Only Team Owners have access.</p>
            ) : (
              <ul className="divide-y">
                {people.map((person) => (
                  <li key={person.id} className={rowClass}>
                    <PersonName
                      name={person.displayName}
                      avatarUrl={person.avatarUrl}
                      detail={roleLabel(person.role)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ManagePeople({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const queryKey = ["project-members", projectId];
  const team = useQuery({
    queryKey,
    queryFn: () => listProjectMembers({ data: { projectId } }),
    retry: false,
  });
  const invites = useQuery({
    queryKey: ["invites", projectId],
    queryFn: () => listInvites({ data: { projectId } }),
    retry: false,
  });
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<ProjectRole>("uploader");
  const [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const memberField = useId();
  const roleField = useId();
  const roleHelp = useId();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: ["invites"] }),
      client.invalidateQueries({ queryKey: projectsKey }),
      client.invalidateQueries({ queryKey: ["review"] }),
    ]);
  // The control that was used disappears or disables itself, so focus returns to the list.
  const done = async (message: string) => {
    setStatus(message);
    await refresh();
    heading.current?.focus();
  };
  const assign = useMutation({
    mutationFn: (data: { memberId: string; role: ProjectRole }) =>
      setProjectMember({ data: { projectId, ...data } }),
    onSuccess: async () => {
      setMemberId("");
      await done("Access given. The person can now open this Project.");
    },
  });
  const remove = useMutation({
    mutationFn: (target: string) => removeProjectMember({ data: { projectId, memberId: target } }),
    onSuccess: () => done("Person removed from this Project"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onSuccess: () => done("Invite revoked"),
  });
  const members = team.data?.members;
  const owners = members?.filter((person) => person.teamRole === "owner");
  const assigned = members?.filter((person) => person.teamRole !== "owner" && person.role !== null);
  const available = members?.filter(
    (person) => person.teamRole !== "owner" && person.role === null,
  );
  const pending = invites.data?.invites.filter((invite) => inviteStatus(invite) === "Pending");
  const chosen = shareRoles.find((choice) => choice.role === role)!;

  return (
    <div id="people" className="flex flex-col gap-8 p-4 pt-0">
      <WriteFeedback
        status={status}
        failure={
          assign.isError || remove.isError || revoke.isError
            ? "Could not change Project access. Please try again."
            : ""
        }
      />
      <section aria-labelledby={`${roleField}-heading`}>
        <h3 id={`${roleField}-heading`} className="mb-2 text-section">
          Add from Team
        </h3>
        {available && available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every Team member already has access. To bring in someone new, use an invite link below.
          </p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (memberId) assign.mutate({ memberId, role });
            }}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor={memberField}>Team member</label>
              <NativeSelect
                id={memberField}
                value={memberId}
                required
                onChange={(event) => setMemberId(event.target.value)}
              >
                <option value="">Choose a person</option>
                {available?.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={roleField}>Role</label>
              <RoleSelect
                id={roleField}
                value={role}
                onChange={setRole}
                aria-describedby={roleHelp}
              />
              <p id={roleHelp} className="text-sm text-muted-foreground">
                {chosen.description}
              </p>
            </div>
            <PendingButton type="submit" pending={assign.isPending} disabled={!memberId}>
              Add to project
            </PendingButton>
          </form>
        )}
      </section>
      <section aria-labelledby={`${memberField}-invite`} className="flex flex-col gap-3">
        <h3 id={`${memberField}-invite`} className="text-section">
          Invite link
        </h3>
        <p className="text-sm text-muted-foreground">
          For someone new, or a Team member. The link works once and opens this project only.
        </p>
        <InviteLinkForm nested projectId={projectId} />
      </section>
      <section aria-labelledby={`${memberField}-heading`} className="flex flex-col gap-2">
        <h3
          id={`${memberField}-heading`}
          ref={heading}
          tabIndex={-1}
          className="text-section outline-none"
        >
          People with access
        </h3>
        {(team.isPending || invites.isPending) && <Skeleton className="h-16" />}
        {(team.isError || invites.isError) && (
          <p role="alert">Could not load people. Please close this and try again.</p>
        )}
        <ul className="divide-y">
          {owners?.map((person) => (
            <li key={person.id} className={rowClass}>
              <PersonName
                name={person.displayName}
                avatarUrl={person.avatarUrl}
                detail="Owner · always has access"
              />
            </li>
          ))}
          {assigned?.map((person) => (
            <li key={person.id} className={rowClass}>
              <PersonName
                name={person.displayName}
                avatarUrl={person.avatarUrl}
                detail={`Added by ${person.addedBy ?? "a former member"}`}
              />
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <RoleSelect
                  label={`Project role for ${person.displayName}`}
                  value={person.role!}
                  disabled={assign.isPending}
                  onChange={(next) => assign.mutate({ memberId: person.id, role: next })}
                />
                <ConfirmButton
                  label={`Remove ${person.displayName} from this project`}
                  text="Remove"
                  onConfirm={() => remove.mutate(person.id)}
                />
              </div>
            </li>
          ))}
          {pending?.map((invite) => (
            <li key={invite.id} className={rowClass}>
              <div className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {invite.note || "Invite link"}
                  <Badge variant="secondary">Pending</Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {roleLabel(invite.role)} · expires {expiryDate(invite.expiresAt)}
                </p>
              </div>
              <ConfirmButton
                label={`Revoke ${roleLabel(invite.role)} Invite${invite.note ? `: ${invite.note}` : ""}`}
                text="Revoke"
                onConfirm={() => revoke.mutate(invite.id)}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
