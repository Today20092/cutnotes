import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Fragment, useRef, useState, type RefObject } from "react";
import { roleChoices } from "@/components/invites-manager";
import { PageHeading, WriteFeedback } from "@/components/project-parts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Role } from "@/server/db/schema";
import { changeMemberRole, listMembers, removeMember } from "@/server/members";

type TeamMember = Awaited<ReturnType<typeof listMembers>>["members"][number];
type MembersData = Awaited<ReturnType<typeof listMembers>>;

const roleLabels = Object.fromEntries(
  roleChoices.map((choice) => [choice.role, choice.label]),
) as Record<Role, string>;

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
                afterRemove={listHeading}
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
  afterRemove,
}: {
  member: TeamMember;
  isYou: boolean;
  onChangeRole: (role: Role) => void;
  onRemove: () => void;
  afterRemove: RefObject<HTMLElement | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const removed = useRef(false);
  const mobile = useIsMobile();
  const name = member.displayName;

  return (
    <Item render={<li />} className="rounded-none px-0 py-3">
      <ItemMedia>
        <Avatar aria-hidden className="size-10 text-sm uppercase">
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none block w-auto text-base wrap-break-word">
          {/* Lets a long email wrap after the @ instead of mid-word. */}
          {name.split("@").map((part, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <>
                  @<wbr />
                </>
              )}
              {part}
            </Fragment>
          ))}
          {isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
        </ItemTitle>
        <p className="text-sm text-muted-foreground">
          Joined {new Date(member.createdAt).toLocaleDateString()}
          {member.invitedBy ? ` · Invited by ${member.invitedBy}` : ""}
        </p>
        {member.invitationNote && (
          <p className="text-sm text-muted-foreground">Invitation note: {member.invitationNote}</p>
        )}
      </ItemContent>
      {/* Phone: actions go on their own line, under the name. */}
      <ItemActions className="w-full justify-between ps-12.5 sm:w-auto sm:ps-0">
        <Select<Role>
          value={member.role}
          items={roleLabels}
          onValueChange={(role) => role && role !== member.role && onChangeRole(role)}
        >
          <SelectTrigger aria-label={`Role for ${name}`} className="w-auto min-w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {roleChoices.map((choice) => (
              <SelectItem key={choice.role} value={choice.role} label={choice.label}>
                <span className="block">{choice.label}</span>
                <span className="block text-xs text-muted-foreground in-data-highlighted:text-accent-foreground">
                  {choice.description}
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Sheet open={confirming} onOpenChange={setConfirming}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="pointer-coarse:size-11"
                aria-label={`Remove ${name}`}
              />
            }
          >
            <Trash2 aria-hidden />
          </SheetTrigger>
          <SheetContent
            side={mobile ? "bottom" : "right"}
            // After a removal this row is gone, so focus goes to the list heading.
            finalFocus={() => (removed.current ? afterRemove.current : true)}
          >
            <SheetHeader>
              <SheetTitle>{isYou ? "Remove yourself?" : `Remove ${name}?`}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-4 pt-0">
              <p>
                {isYou
                  ? "You will lose access to the Team straight away."
                  : "They will lose access to every project. Their uploads and Comments stay. Rejoining requires fresh project assignments."}
              </p>
              <SheetClose render={<Button variant="outline" />}>Keep Member</SheetClose>
              <Button
                variant="destructive"
                onClick={() => {
                  removed.current = true;
                  setConfirming(false);
                  onRemove();
                }}
              >
                Remove from Team
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </ItemActions>
    </Item>
  );
}
