import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { buttonVariants } from "@/components/ui/button";
import { roleLabel } from "@/lib/share-roles";
import { cn } from "@/lib/utils";
import type { ProjectRole } from "@/server/db/schema";

export type Person = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: ProjectRole;
};

const describe = (people: Person[]) =>
  people.map((person) => `${person.displayName}, ${roleLabel(person.role)}`).join("; ");

/**
 * Overlapping avatars of the people assigned to a Project. With `label` it is one image
 * named after everyone in it; without, it is decorative and nearby text names them.
 */
export function AvatarStack({
  people,
  max = 4,
  label,
  className,
}: {
  people: Person[];
  max?: number;
  label?: string;
  className?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <div
      className={cn("flex items-center -space-x-2", className)}
      {...(label
        ? { role: "img", "aria-label": `${label}: ${describe(people)}` }
        : { "aria-hidden": true })}
    >
      {shown.map((person) => (
        <PersonAvatar
          key={person.id}
          name={person.displayName}
          src={person.avatarUrl}
          className="size-7 ring-2 ring-background"
        />
      ))}
      {more > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
          +{more}
        </span>
      )}
    </div>
  );
}

/** Who can open this Project, at a glance, with the way into the People sheet. */
export function PeopleStrip({
  projectId,
  people,
  canManage,
}: {
  projectId: string;
  people: Person[];
  canManage: boolean;
}) {
  return (
    <section
      aria-label="People with access"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
    >
      {people.length === 0 ? (
        <p className="text-muted-foreground">Only Team Owners have access</p>
      ) : (
        <>
          <AvatarStack people={people} />
          <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
            {people.slice(0, 3).map((person) => (
              <li key={person.id} className="wrap-anywhere">
                <span className="font-medium">{person.displayName}</span>{" "}
                <span className="text-muted-foreground">{roleLabel(person.role)}</span>
              </li>
            ))}
            {/* The People sheet lists the rest. */}
            {people.length > 3 && (
              <li className="text-muted-foreground">+{people.length - 3} more</li>
            )}
          </ul>
        </>
      )}
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        search={{ sheet: "people" }}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Users aria-hidden /> {canManage ? "Manage people" : "See people"}
      </Link>
    </section>
  );
}
