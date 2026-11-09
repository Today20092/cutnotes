import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { PageHeading, WriteFeedback } from "@/components/project-parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role } from "@/server/db/schema";
import { changeMemberRole, listMembers, removeMember } from "@/server/members";

type TeamMember = Awaited<ReturnType<typeof listMembers>>["members"][number];
type MembersData = Awaited<ReturnType<typeof listMembers>>;

const roleLabels: Record<Role, string> = {
  viewer: "Viewer",
  editor: "Editor",
  owner: "Owner",
};
const roleOptions: Role[] = ["viewer", "editor", "owner"];

const queryKey = ["members"];

const hasStatus = (error: unknown, status: number) =>
  error instanceof Response && error.status === status;

function failureMessage(error: unknown, fallback: string) {
  if (hasStatus(error, 409)) {
    return "The Team must keep at least one Owner. Make someone else an Owner first.";
  }
  if (hasStatus(error, 404)) return "That person is no longer on the Team.";
  if (hasStatus(error, 403)) return "Only an Owner can do that.";
  return fallback;
}

export function MembersManager() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const listHeading = useRef<HTMLHeadingElement>(null);

  const list = useQuery({ queryKey, queryFn: () => listMembers(), retry: false });
  const youId = list.data?.youId;

  const settle = (id: string) => {
    void queryClient.invalidateQueries({ queryKey });
    // Changing your own access changes what the app may show you.
    if (id === youId) void queryClient.invalidateQueries({ queryKey: ["app-shell"] });
  };

  /** Applies a change to the cached list and returns the list to restore on failure. */
  async function applyToList(next: (members: TeamMember[]) => TeamMember[]) {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<MembersData>(queryKey);
    if (previous) {
      queryClient.setQueryData<MembersData>(queryKey, {
        ...previous,
        members: next(previous.members),
      });
    }
    setFailure("");
    return { previous };
  }

  const changeRole = useMutation({
    mutationFn: (target: { member: TeamMember; role: Role }) =>
      changeMemberRole({ data: { id: target.member.id, role: target.role } }),
    onMutate: ({ member, role }) =>
      applyToList((members) =>
        members.map((row) => (row.id === member.id ? { ...row, role } : row)),
      ),
    onSuccess: (_result, { member, role }) =>
      setStatus(`${member.displayName} is now ${roleLabels[role]}`),
    onError: (error, _target, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      setStatus("");
      setFailure(failureMessage(error, "Could not change the Role. Please try again."));
    },
    onSettled: (_result, _error, { member }) => settle(member.id),
  });

  const remove = useMutation({
    mutationFn: (member: TeamMember) => removeMember({ data: { id: member.id } }),
    onMutate: (member) => {
      listHeading.current?.focus();
      return applyToList((members) => members.filter((row) => row.id !== member.id));
    },
    onSuccess: (_result, member) => setStatus(`${member.displayName} removed from the Team`),
    onError: (error, _member, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      setStatus("");
      setFailure(failureMessage(error, "Could not remove them. Please try again."));
    },
    onSettled: (_result, _error, member) => settle(member.id),
  });

  return (
    <div className="w-full max-w-xl space-y-6">
      <PageHeading title="Members">
        <Link to="/invites" className={buttonVariants({ variant: "secondary" })}>
          Invite someone
        </Link>
      </PageHeading>
      <WriteFeedback status={status} failure={failure} />

      <section className="space-y-3">
        <h2 ref={listHeading} tabIndex={-1} className="text-lg font-semibold outline-none">
          People on the Team
        </h2>
        {list.isPending && <Skeleton className="h-16" />}
        {hasStatus(list.error, 403) && <p>Only an Owner can manage Members.</p>}
        {list.isError && !hasStatus(list.error, 403) && (
          <p role="alert">Could not load Members. Please reload the page.</p>
        )}
        {list.data && (
          <ul className="divide-y">
            {list.data.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isYou={member.id === youId}
                onChangeRole={(role) => changeRole.mutate({ member, role })}
                onRemove={() => remove.mutate(member)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MemberRow({
  member,
  isYou,
  onChangeRole,
  onRemove,
}: {
  member: TeamMember;
  isYou: boolean;
  onChangeRole: (role: Role) => void;
  onRemove: () => void;
}) {
  const roleId = useId();
  const [confirming, setConfirming] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // The control that had focus is replaced, so focus moves with the swap.
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) removeButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <li className="space-y-3 py-3">
      <div className="font-medium wrap-anywhere">
        {member.displayName}
        {isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
      </div>
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm">
            {isYou
              ? "Remove yourself from the Team? You will lose access straight away."
              : "Remove them from the Team? They will lose access straight away. Their Comments stay."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              type="button"
              variant="destructive"
              aria-label={`Remove ${member.displayName} now`}
              onClick={onRemove}
            >
              Remove
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={roleId} className="text-sm font-medium">
              Role<span className="sr-only"> for {member.displayName}</span>
            </label>
            <select
              id={roleId}
              value={member.role}
              onChange={(event) => onChangeRole(event.target.value as Role)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>
          <Button
            ref={removeButton}
            type="button"
            variant="ghost"
            aria-label={`Remove ${member.displayName}`}
            onClick={() => setConfirming(true)}
          >
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}
