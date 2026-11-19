import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { InvitesManager } from "@/components/invites-manager";
import { PendingButton } from "@/components/pending-button";
import { ConfirmButton, WriteFeedback } from "@/components/project-parts";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { foldersKey } from "@/lib/folders";
import { roleLabel, shareRoles } from "@/lib/share-roles";
import { projectsKey } from "@/lib/writes";
import type { ProjectRole } from "@/server/db/schema";
import { listFolderMembers, removeFolderMember, setFolderMember } from "@/server/folders";
import {
  listProjectMembers,
  removeProjectMember,
  setProjectMember,
} from "@/server/project-members";

type Kind = "project" | "folder";

const wideSheetClass = "sm:max-w-lg data-[side=right]:sm:max-w-lg";

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

/** One place to see and change who can open a Folder or a Project. */
export function ShareSheet({
  kind,
  id,
  name,
  startOpen = false,
}: {
  kind: Kind;
  id: string;
  name: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const mobile = useIsMobile();
  const noun = kind === "folder" ? "Folder" : "Project";
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="secondary" aria-label={`Share ${name}`} />}>
        <Share2 aria-hidden /> Share
      </SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"} className={wideSheetClass}>
        <SheetHeader>
          <SheetTitle>
            Share {noun} {name}
          </SheetTitle>
          <SheetDescription>
            {kind === "folder"
              ? "People you add can open every Project in this Folder, including new ones."
              : "Only people with access and Owners can open this Project. Guest review links are separate."}
          </SheetDescription>
        </SheetHeader>
        <SharePanel kind={kind} id={id} noun={noun} />
      </SheetContent>
    </Sheet>
  );
}

function SharePanel({ kind, id, noun }: { kind: Kind; id: string; noun: string }) {
  const client = useQueryClient();
  const queryKey = [kind === "folder" ? "folder-members" : "project-members", id];
  const people = useQuery({
    queryKey,
    queryFn: async () => {
      if (kind === "folder") {
        const { members } = await listFolderMembers({ data: { folderId: id } });
        return {
          folder: null,
          members: members.map((member) => ({ ...member, folderRole: null as ProjectRole | null })),
        };
      }
      return listProjectMembers({ data: { projectId: id } });
    },
    retry: false,
  });
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const memberField = useId();
  const roleField = useId();
  const roleHelp = useId();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: projectsKey }),
      client.invalidateQueries({ queryKey: foldersKey }),
      client.invalidateQueries({ queryKey: ["review"] }),
    ]);
  const assign = useMutation({
    mutationFn: (data: { memberId: string; role: ProjectRole }) =>
      kind === "folder"
        ? setFolderMember({ data: { folderId: id, ...data } })
        : setProjectMember({ data: { projectId: id, ...data } }),
    onSuccess: async () => {
      setMemberId("");
      setStatus(`Access given. The person can now open this ${noun}.`);
      await refresh();
      // The submit button disables itself once the person is added, which would drop focus.
      heading.current?.focus();
    },
  });
  const remove = useMutation({
    mutationFn: (target: string) =>
      kind === "folder"
        ? removeFolderMember({ data: { folderId: id, memberId: target } })
        : removeProjectMember({ data: { projectId: id, memberId: target } }),
    onSuccess: async () => {
      setStatus(`Person removed from this ${noun}`);
      await refresh();
      heading.current?.focus();
    },
  });
  const folderName = people.data?.folder?.name;
  const withAccess = people.data?.members.filter(
    (person) => person.teamRole === "owner" || person.role !== null || person.folderRole !== null,
  );
  const available = people.data?.members.filter(
    (person) => person.teamRole !== "owner" && person.role === null && person.folderRole === null,
  );
  const chosen = shareRoles.find((choice) => choice.role === role)!;

  return (
    <div id="people" className="flex scroll-mt-6 flex-col gap-8 p-4 pt-0">
      <WriteFeedback
        status={status}
        failure={
          assign.isError || remove.isError
            ? `Could not change ${noun} access. Please try again.`
            : ""
        }
      />
      <section aria-labelledby={`${memberField}-heading`} className="flex flex-col gap-2">
        <h3
          id={`${memberField}-heading`}
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          People with access
        </h3>
        {people.isPending && <Skeleton className="h-16" />}
        {people.isError && (
          <p role="alert">Could not load people. Please close this and try again.</p>
        )}
        <ul className="divide-y">
          {withAccess?.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 wrap-anywhere">
                <p className="font-medium">{person.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {person.teamRole === "owner"
                    ? "Owner · always has access"
                    : person.role === null
                      ? `${roleLabel(person.folderRole!)}, from the Folder `
                      : person.folderRole
                        ? `Also ${roleLabel(person.folderRole)} from the Folder `
                        : `Added by ${person.addedBy}`}
                  {person.teamRole !== "owner" && person.folderRole && people.data?.folder && (
                    <>
                      <Link
                        to="/folders/$folderId"
                        params={{ folderId: people.data.folder.id }}
                        hash="people"
                        className="underline underline-offset-4"
                      >
                        {folderName}
                      </Link>
                      {person.role === null && ". Change it there."}
                    </>
                  )}
                </p>
              </div>
              {person.teamRole !== "owner" && person.role !== null && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <RoleSelect
                    label={`${noun} role for ${person.displayName}`}
                    value={person.role}
                    disabled={assign.isPending}
                    onChange={(next) => assign.mutate({ memberId: person.id, role: next })}
                  />
                  <ConfirmButton
                    label={`Remove ${person.displayName} from this ${noun.toLowerCase()}`}
                    text="Remove"
                    onConfirm={() => remove.mutate(person.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby={`${roleField}-heading`}>
        <h3 id={`${roleField}-heading`} className="mb-2 text-lg font-semibold">
          Add people
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
              Add to {noun.toLowerCase()}
            </PendingButton>
          </form>
        )}
      </section>
      <section aria-labelledby={`${memberField}-invite`} className="flex flex-col gap-3">
        <h3 id={`${memberField}-invite`} className="text-lg font-semibold">
          Invite by link
        </h3>
        <p className="text-sm text-muted-foreground">
          For a new person or a Team member. The link works once and gives access to this{" "}
          {noun.toLowerCase()} only.
        </p>
        <InvitesManager nested {...(kind === "folder" ? { folderId: id } : { projectId: id })} />
      </section>
    </div>
  );
}
