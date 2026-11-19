# Cutnotes

A self-hosted tool where a production team reviews video cuts before final delivery.

## Language

### Work

**Project**:
A piece of production work under review, such as one episode. Access is given per Project.
_Avoid_: Folder, workspace

**Video**:
One titled piece of content inside a Project, made up of one or more Revisions.
_Avoid_: Asset, file, stack

**Revision**:
One uploaded cut of a Video.
_Avoid_: Version, render

**Stage**:
Where a whole Project stands, shown as its column on the home board: New, Editing, In review or Done. It moves by itself (an Uploader or Editor joins: Editing; a Revision is ready: In review; Request changes: Editing; every Video approved: Done), and an Owner or the Project's Editor can move it by hand.
_Avoid_: Status, phase, column

**Status**:
Where one Video stands in review: Review, Rework or Done. Status is per Video, Stage is per Project. It changes only through **Request changes** (Rework) and **Approve** (Done) on the Video page, and a new ready Revision turns Rework back into Review.
_Avoid_: Stage, state

**Complete**:
An Owner's decision that a Project is finished, which starts its 14-day countdown to permanent deletion.
_Avoid_: Archive

### Feedback

**Comment**:
A note attached to a moment in one Revision. Comments are flat, with no replies, and do not move to newer Revisions.
_Avoid_: Note, annotation

**Drawing**:
A pen, arrow or box mark on the picture that belongs to a Comment.
_Avoid_: Annotation, markup

**Resolved**:
A Comment an Owner or Editor has marked as dealt with.
_Avoid_: Done, closed

**To do**:
Comments that have not been marked Resolved. Resolving a Comment moves it to the Resolved filter; unresolving it returns it to To do.

### People

**Team**:
The one group of people using an install of Cutnotes.
_Avoid_: Organization, workspace

**Member**:
A signed-in person on the Team, holding one Role.
_Avoid_: User, account

**Role**:
A Member's level of access: Owner, Editor or Viewer.
_Avoid_: Permission level

**Project role**:
A person's assignment on a Project: Reviewer, Uploader or Editor. Separate from the Team Role.

**Uploader**:
A Project role that can watch and comment, add new Videos, and upload Revisions to Videos they created. An Uploader deletes only Videos they created and cannot rename, Request changes, Approve, move the Stage, Resolve or manage people.
_Avoid_: Contributor

**Guest**:
A person using a Share Link who gives only a name and has no sign-in.
_Avoid_: Anonymous user, reviewer

**Share Link**:
A named, revocable link to a Video's latest Revision, either view-only or comment-and-draw.
_Avoid_: Public link

**Invite**:
A single-use link, valid for 7 days, that makes someone a Member with a chosen Role.
_Avoid_: Share Link
