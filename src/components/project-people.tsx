import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { InvitesManager } from "@/components/invites-manager";
import { ConfirmButton, WriteFeedback } from "@/components/project-parts";
import { PendingButton } from "@/components/pending-button";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listProjectMembers,
  removeProjectMember,
  setProjectMember,
} from "@/server/project-members";
import type { ProjectRole } from "@/server/db/schema";

export function ProjectPeople({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const queryKey = ["project-members", projectId];
  const people = useQuery({
    queryKey,
    queryFn: () => listProjectMembers({ data: { projectId } }),
    retry: false,
  });
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: ["projects"] }),
      client.invalidateQueries({ queryKey: ["review"] }),
    ]);
  };
  const assign = useMutation({
    mutationFn: (data: { memberId: string; role: ProjectRole }) =>
      setProjectMember({ data: { projectId, ...data } }),
    onSuccess: async () => {
      setMemberId("");
      setStatus("Project access updated");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (target: string) => removeProjectMember({ data: { projectId, memberId: target } }),
    onSuccess: async () => {
      setStatus("Member removed from this project");
      await refresh();
      heading.current?.focus();
    },
  });
  const assigned = people.data?.members.filter(
    (person) => person.teamRole === "owner" || person.role !== null,
  );
  const available = people.data?.members.filter(
    (person) => person.teamRole !== "owner" && person.role === null,
  );
  return (
    <section
      id="people"
      aria-labelledby="project-people-heading"
      className="mt-8 flex max-w-xl scroll-mt-6 flex-col gap-6 border-t pt-6"
    >
      <div className="flex flex-col gap-2">
        <h2
          id="project-people-heading"
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          People
        </h2>
        <p className="text-sm text-muted-foreground">
          Only assigned people and Team Owners can open this project. Owners always have access.
          Guest review links are separate.
        </p>
      </div>
      <WriteFeedback
        status={status}
        failure={
          assign.isError || remove.isError
            ? "Could not change project access. Please try again."
            : ""
        }
      />
      {people.isPending && <Skeleton className="h-16" />}
      {people.isError && (
        <p role="alert">Could not load project members. Please reload the page.</p>
      )}
      <ul className="divide-y">
        {assigned?.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 wrap-anywhere">
              <p className="font-medium">{person.displayName}</p>
              {person.teamRole === "owner" ? (
                <p className="text-sm text-muted-foreground">Owner · access to all projects</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Added by {person.addedBy} · {new Date(person.addedAt!).toLocaleString()}
                </p>
              )}
            </div>
            {person.teamRole !== "owner" && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <NativeSelect
                  aria-label={`Project role for ${person.displayName}`}
                  value={person.role ?? "viewer"}
                  disabled={assign.isPending}
                  onChange={(event) =>
                    assign.mutate({ memberId: person.id, role: event.target.value as ProjectRole })
                  }
                >
                  <option value="viewer">Reviewer</option>
                  <option value="editor">Editor</option>
                </NativeSelect>
                <ConfirmButton
                  label={`Remove ${person.displayName} from this project`}
                  text="Remove"
                  onConfirm={() => remove.mutate(person.id)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {available && available.length > 0 && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (memberId) assign.mutate({ memberId, role });
          }}
        >
          <h3 className="font-semibold">Add a Team member</h3>
          <div className="flex flex-col gap-2">
            <label htmlFor={`project-person-${projectId}`}>Team member</label>
            <NativeSelect
              id={`project-person-${projectId}`}
              value={memberId}
              required
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">Choose a person</option>
              {available.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`project-role-${projectId}`}>Project role</label>
            <NativeSelect
              id={`project-role-${projectId}`}
              value={role}
              onChange={(event) => setRole(event.target.value as ProjectRole)}
            >
              <option value="viewer">Reviewer</option>
              <option value="editor">Editor</option>
            </NativeSelect>
          </div>
          <PendingButton type="submit" pending={assign.isPending} disabled={!memberId}>
            Add to project
          </PendingButton>
        </form>
      )}
      <section className="flex flex-col gap-3" aria-labelledby="project-invite-heading">
        <h3 id="project-invite-heading" className="font-semibold">
          Invite by link
        </h3>
        <p className="text-sm text-muted-foreground">
          Invite a new person or an existing Team member. This grants access to this project only.
        </p>
        <InvitesManager projectId={projectId} />
      </section>
    </section>
  );
}
