import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, FolderOpen, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { MemberScreen } from "@/components/member-screen";
import { PendingButton } from "@/components/pending-button";
import {
  backLinkClass,
  PageBreadcrumb,
  PageHeading,
  ProjectNameSheet,
  videoGridClass,
  VideoGridSkeleton,
  WriteFeedback,
} from "@/components/project-parts";
import { ShareSheet } from "@/components/share-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  folderQuery,
  useCreateProjectInFolder,
  useDeleteFolder,
  useRenameFolder,
  type FolderPage,
} from "@/lib/folders";
import { roleLabel } from "@/lib/share-roles";

export const Route = createFileRoute("/folders/$folderId")({
  head: () => ({ meta: [{ title: "Folder · Cutnotes" }] }),
  component: FolderScreen,
});

function BackLink() {
  return (
    <Link to="/" className={backLinkClass}>
      <ChevronLeft className="size-4" aria-hidden /> Back to Projects
    </Link>
  );
}

function FolderScreen() {
  const { folderId } = Route.useParams();
  return (
    <MemberScreen
      query={folderQuery(folderId)}
      skeleton={<VideoGridSkeleton />}
      notFound={
        <div className="flex flex-col gap-2">
          <BackLink />
          <PageHeading title="Folder not found" />
          <p className="text-muted-foreground">
            It may have been deleted, or you may not have access. Go back to see what you can open.
          </p>
        </div>
      }
    >
      {(page) => <FolderView page={page} />}
    </MemberScreen>
  );
}

function DeleteFolder({ folderId, name }: { folderId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const remove = useDeleteFolder();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="destructive" aria-label={`Delete ${name}`} />}>
        Delete
      </SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>Delete Folder?</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-4 pt-0">
          <p>
            The Folder {name} will be deleted. Its Projects are not deleted: they become unfiled.
            People who can open them only through this Folder lose access.
          </p>
          {remove.isError && <p role="alert">Could not delete {name}. Please try again.</p>}
          <SheetClose render={<Button variant="outline" />}>Keep Folder</SheetClose>
          <PendingButton
            variant="destructive"
            pending={remove.isPending}
            onClick={() =>
              remove.mutate(folderId, {
                onSuccess: () => {
                  setOpen(false);
                  void navigate({ to: "/" });
                },
              })
            }
          >
            Delete {name}
          </PendingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FolderView({ page }: { page: FolderPage }) {
  const { folder, projects, member } = page;
  const isOwner = member.role === "owner";
  const canCreate = isOwner || (member.role === "editor" && folder.role === "editor");
  const startShareOpen = useLocation({ select: (location) => location.hash === "people" });
  const create = useCreateProjectInFolder();
  const rename = useRenameFolder();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");

  const newProjectSheet = (
    <ProjectNameSheet
      title="New project"
      submitLabel="Create Project"
      onSubmit={(name) => {
        setFailure("");
        create.mutate(
          { name, folderId: folder.id },
          {
            onSuccess: () => setStatus(`Project ${name} created`),
            onError: () => setFailure(`Could not create ${name}. Nothing was saved. Try again.`),
          },
        );
      }}
      trigger={
        <Button variant="secondary">
          <Plus aria-hidden /> New project
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb trail={[{ label: "Home", link: <Link to="/" /> }]} current={folder.name} />
      <PageHeading title={folder.name}>
        <Badge variant="secondary" className="self-center">
          {roleLabel(folder.role)}
        </Badge>
        {canCreate && newProjectSheet}
        {isOwner && (
          <ShareSheet kind="folder" id={folder.id} name={folder.name} startOpen={startShareOpen} />
        )}
      </PageHeading>
      <WriteFeedback status={status} failure={failure} />
      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No Projects in this Folder</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Create a Project here to start a review."
                : "An Owner or Editor will add the first one."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && <EmptyContent>{newProjectSheet}</EmptyContent>}
        </Empty>
      ) : (
        <ul className={videoGridClass}>
          {projects.map((project) => (
            <li key={project.id} className="min-w-0">
              <Card className="h-full">
                <CardHeader className="p-4">
                  <CardTitle>
                    <FolderOpen className="mb-3 size-5 text-muted-foreground" aria-hidden />
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="inline-flex min-h-11 items-center rounded font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {project.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>{roleLabel(project.role)}</CardDescription>
                  {project.completedAt !== null && (
                    <CardAction>
                      <Badge variant="secondary">Complete</Badge>
                    </CardAction>
                  )}
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <section
          aria-labelledby="manage-folder-heading"
          className="mt-8 flex flex-col gap-4 border-t pt-6"
        >
          <h2 id="manage-folder-heading" className="text-lg font-semibold">
            Manage Folder
          </h2>
          <div className="flex flex-wrap gap-2">
            <ProjectNameSheet
              title="Rename Folder"
              submitLabel="Save name"
              fieldLabel="Folder name"
              emptyMessage="Enter a name for the Folder."
              initialName={folder.name}
              onSubmit={(name) => {
                setFailure("");
                rename.mutate(
                  { folderId: folder.id, name },
                  {
                    onSuccess: () => setStatus(`Folder renamed to ${name}`),
                    onError: () => setFailure(`Could not rename ${folder.name}. Try again.`),
                  },
                );
              }}
              trigger={
                <Button variant="secondary" aria-label={`Rename ${folder.name}`}>
                  <Pencil aria-hidden /> Rename
                </Button>
              }
            />
            <DeleteFolder folderId={folder.id} name={folder.name} />
          </div>
        </section>
      )}
    </div>
  );
}
