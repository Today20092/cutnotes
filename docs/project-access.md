# Project access

Projects are private to assigned people and active Team Owners. A person is assigned on the Project itself or on the Folder that holds it. An ordinary project or video URL never grants access. Sign-in returns to the requested page; someone without access sees an unavailable page without project details.

## Team and project roles

Team Owners can open every project, manage membership and invitations, create or revoke guest review links, and complete or delete projects. A Team Editor can create a project without an Owner's help and automatically becomes its project Editor. A Team Viewer cannot create projects.

Project assignments are separate from Team roles:

- **Editor:** watches, comments, uploads videos and revisions, renames projects and videos, changes video status and resolves comments. Existing deletion rules still apply: Editors delete only videos they created; Owners delete any video.
- **Uploader:** watches and comments, adds new videos, and uploads revisions to videos they created. Uploaders delete only videos they created. They cannot rename the project or other people's videos, change status, resolve comments or manage people.
- **Reviewer:** watches and comments, including editing or removing their own comments.

Assigning someone as a project Editor does not grant permission to create projects. Changing their Team Editor/Viewer designation does not change their project assignments. Completed projects retain their existing read-only behavior.

## Folders

A Folder is a named group of projects. Owners create, rename and delete Folders, and move a project into a Folder or out of it. A project is in at most one Folder.

An assignment on a Folder (Reviewer, Uploader or Editor) covers every project in it, including projects moved in later. Moving a project out of the Folder ends access that came only from the Folder. A person's role on a project is the higher of their project assignment and their Folder assignment. People see only the Folders they are assigned to; a project they reach through a direct assignment shows as unfiled when they cannot open its Folder.

Deleting a Folder leaves its projects unfiled and removes its assignments and unused Folder invitations. People who had access only through the Folder lose it. Projects, videos and comments are not deleted.

A Team Editor can create a project unfiled, or inside a Folder where their Folder role is Editor. Owners can create projects in any Folder.

Folder invitations work like project invitations: the new person joins the Team as a Viewer with the chosen Folder assignment. People who already have a Folder assignment, and Owners, are told they already have access.

## Owner workflow

Open a project and find **People**. Add an existing Team member as Editor or Reviewer, change their project role, or remove their access. Owners are listed separately and cannot be removed from an individual project.

Use **Invite by link** to admit a new person or an existing member to this project. Choose a role and optionally add a private note for Owners. The link works once, expires after seven days, and can be accepted by the first signed-in person holding it. The note is not an email restriction. The token is shown only when created; create a replacement if it is lost.

A new person accepting a project invitation joins the Team as a Viewer with the chosen project assignment. An existing active member keeps their Team designation. People who already have project access are told so; the invitation stays unused and their role is unchanged. Owners can change an existing assignment in People.

Invitation history includes project, offered role, note, inviter, creation and expiration dates, and accepted/revoked status with dates. Accepted invitations show the actual accepter and link to membership management. Revoking an unused invitation prevents acceptance; an accepted invitation cannot be revoked to remove a member.

Removing a project member preserves their uploads and comments. Removing a Team member clears all project and Folder assignments. A fresh invitation can reinstate their original identity, preserving comment authorship, but does not restore old assignments or an old Team designation.

Guest review links are an explicit exception: anyone holding a valid guest link can review its video without project membership. Removing a member does not revoke guest links. Owners revoke those links separately. Already-issued playback credentials may continue working until expiry; removal prevents new credentials and subsequent authorized actions.

## Migration and release

Migration `0008_mature_adam_warlock.sql` creates project assignments and adds project scope and notes to invitations. Existing projects keep their active creators as project Editors. Owners have implicit access. No other existing members are assigned automatically, and existing guest links remain valid.

Before rollout, record the intended assignments for existing projects and review active guest links and pending Team invitations. Apply the recorded assignments using People when the new version is available. Collaborators not assigned at rollout will lose access until an Owner adds them. Keep this review on the intended install; never copy production membership data into repository fixtures.

Apply the migration before running this Worker version, following the setup and release guide. Validate the migration on staging and retain the standard D1 recovery point. The schema change is additive, but rolling back the Worker to the old version restores its team-wide access behavior; prefer a forward fix for an access-control regression. This feature does not deploy itself or change remote data during development.

Migration `0010_marvelous_scalphunter.sql` adds Folders, Folder assignments, and the Folder column on projects and invitations. It is additive: existing projects stay unfiled, existing assignments and roles are unchanged, and the Uploader role needs no schema change because roles are stored as text. Apply it before running the Worker version that reads Folders.
