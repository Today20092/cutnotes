/**
 * The map of the app that `/llms.txt` serves: routes, search params, who can open each one and
 * what it is for. Static on purpose: no data, IDs, names or tokens. `test/structure` checks that
 * it matches the route files and their `validateSearch` schemas.
 */
export type RouteEntry = {
  /** The route template, as in the router. */
  path: string;
  purpose: string;
  who: string;
  /** Search param name to its allowed values. Unknown values are dropped, never an error. */
  params: Record<string, string>;
  /** Labels of the buttons and links that do the screen's main jobs. */
  actions: string[];
};

const reviewParams = {
  t: "moment to open at, in seconds from the start",
  comment: "the selected Comment, by its ID",
  filter: "todo | resolved: which Comments the list shows (default todo)",
};

export const routeIndex: RouteEntry[] = [
  {
    path: "/",
    purpose:
      "The board: every Project the person can open, in four Stage columns (New, Editing, In review, Done).",
    who: "Signed-in Members, for the Projects they can open",
    params: {
      stage: "new | editing | in_review | done: show one column",
      view: "board | list: list stacks the columns",
      sheet: "new-project | upload | complete: the open sheet",
      project: "the Project a complete sheet is for, by its ID",
    },
    actions: ["New project", "Upload", "Move to <Stage>", "Complete…"],
  },
  {
    path: "/projects/$projectId",
    purpose: "One Project: its Stage, who has access, and its Videos.",
    who: "Owners, and people assigned to the Project",
    params: {
      sheet:
        "people | upload | rename | complete | delete | rename-video | delete-video | retry-video: the open sheet",
      video: "the Video a *-video sheet is for, by its ID",
    },
    actions: ["Upload", "Manage people", "More actions", "Rename", "Complete", "Delete"],
  },
  {
    path: "/videos/$videoId",
    purpose: "Review one Video: play a Revision, read and add Comments, decide.",
    who: "Owners, and people assigned to the Project",
    params: {
      sheet: "customer | upload | markers: the open sheet",
      revision: "the Revision number (default: the latest)",
      ...reviewParams,
    },
    actions: [
      "Request changes",
      "Approve",
      "Send to customer",
      "Upload new Revision",
      "Send Comment",
    ],
  },
  {
    path: "/members",
    purpose: "The Team: each Member's Role and the Projects they can open.",
    who: "Owners",
    params: {
      q: "search text (name or Project)",
      remove: "the Member a Remove sheet is for, by their ID",
    },
    actions: ["Invite someone", "Remove <name>"],
  },
  {
    path: "/invites",
    purpose: "Create a Team Invite link and see every Invite.",
    who: "Owners",
    params: { project: "show only this Project's Invites, by its ID" },
    actions: ["Create Invite", "Revoke"],
  },
  {
    path: "/feedback",
    purpose: "Problems and ideas people reported through Site feedback.",
    who: "Owners",
    params: { handled: "true: also show handled reports" },
    actions: ["Show handled reports"],
  },
  {
    path: "/settings",
    purpose: "Your account, and links to the Team pages.",
    who: "Signed-in Members",
    params: {},
    actions: ["Manage profile", "Sign out"],
  },
  {
    path: "/invite/$token",
    purpose:
      "Uses the Invite as soon as the page opens after sign-in, then lands on the Team home or the Project it is for.",
    who: "Whoever holds the Invite link, once, within 7 days",
    params: {},
    actions: ["Open project", "Go to Projects", "Sign out"],
  },
  {
    path: "/share/$token",
    purpose: "A Guest reviews exactly one Revision and the Comments made through the same link.",
    who: "Whoever holds the Share Link; no sign-in",
    params: reviewParams,
    actions: ["Continue", "Send Comment"],
  },
];

/** The plain-text page `/llms.txt` serves. */
export function llmsText(entries: RouteEntry[] = routeIndex): string {
  const lines = [
    "# Cutnotes",
    "",
    "> Self-hosted video review for small production teams: Team > Project > Video > Revision > Comment.",
    "",
    "Every screen's state is in its URL. Open a URL to reproduce a screen; a search param that is",
    "missing or has an unknown value is ignored. Sign-in is required except where a route says otherwise.",
    "There is no data, ID or token in this file.",
    "",
    "## Routes",
  ];
  for (const entry of entries) {
    lines.push("", `### ${entry.path}`, entry.purpose, `- Who: ${entry.who}`);
    const params = Object.entries(entry.params);
    if (params.length) lines.push("- Search params:", ...params.map(([k, v]) => `  - ${k}: ${v}`));
    else lines.push("- Search params: none");
    lines.push(`- Actions: ${entry.actions.join(" | ")}`);
  }
  lines.push(
    "",
    "## Pages",
    "- Each page has one main landmark and one h1; board columns are labelled sections and Project cards are articles named by Project and Stage.",
    "",
  );
  return lines.join("\n");
}
