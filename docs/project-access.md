# Project access

Projects are private to assigned people and active Team Owners. An ordinary project or video URL never grants access. Sign-in returns to the requested page; someone without access sees an unavailable page without project details.

## Team and project roles

Team Owners can open every project, manage membership and invitations, create or revoke guest review links, and complete or delete projects. A Team Editor can create a project without an Owner's help and automatically becomes its project Editor. A Team Viewer cannot create projects.

Project assignments are separate from Team roles:

- **Editor:** watches, comments, uploads videos and revisions, renames projects and videos, changes video status and resolves comments. Existing deletion rules still apply: Editors delete only videos they created; Owners delete any video.
- **Reviewer:** watches and comments, including editing or removing their own comments.

Assigning someone as a project Editor does not grant permission to create projects. Changing their Team Editor/Viewer designation does not change their project assignments. Completed projects retain their existing read-only behavior.

## Owner workflow

Open a project and find **People**. Add an existing Team member as Editor or Reviewer, change their project role, or remove their access. Owners are listed separately and cannot be removed from an individual project.

Use **Invite by link** to admit a new person or an existing member to this project. Choose a role and optionally add a private note for Owners. The link works once, expires after seven days, and can be accepted by the first signed-in person holding it. The note is not an email restriction. The token is shown only when created; create a replacement if it is lost.

A new person accepting a project invitation joins the Team as a Viewer with the chosen project assignment. An existing active member keeps their Team designation. People who already have project access are told so; the invitation stays unused and their role is unchanged. Owners can change an existing assignment in People.

Invitation history includes project, offered role, note, inviter, creation and expiration dates, and accepted/revoked status with dates. Accepted invitations show the actual accepter and link to membership management. Revoking an unused invitation prevents acceptance; an accepted invitation cannot be revoked to remove a member.

Removing a project member preserves their uploads and comments. Removing a Team member clears all project assignments. A fresh invitation can reinstate their original identity, preserving comment authorship, but does not restore old assignments or an old Team designation.

Guest review links are an explicit exception: anyone holding a valid guest link can review its video without project membership. Removing a member does not revoke guest links. Owners revoke those links separately. Already-issued playback credentials may continue working until expiry; removal prevents new credentials and subsequent authorized actions.

## Migration and release

Migration `0008_mature_adam_warlock.sql` creates project assignments and adds project scope and notes to invitations. Existing projects keep their active creators as project Editors. Owners have implicit access. No other existing members are assigned automatically, and existing guest links remain valid.

Before rollout, record the intended assignments for existing projects and review active guest links and pending Team invitations. Apply the recorded assignments using People when the new version is available. Collaborators not assigned at rollout will lose access until an Owner adds them. Keep this review on the intended install; never copy production membership data into repository fixtures.

Apply the migration before running this Worker version, following the setup and release guide. Validate the migration on staging and retain the standard D1 recovery point. The schema change is additive, but rolling back the Worker to the old version restores its team-wide access behavior; prefer a forward fix for an access-control regression. This feature does not deploy itself or change remote data during development.
