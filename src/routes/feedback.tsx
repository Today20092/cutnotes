import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { PendingButton } from "@/components/pending-button";
import { PageBreadcrumb, PageHeading, useStatusToast } from "@/components/project-parts";
import { SettingsLayout } from "@/components/settings-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { listFeedback, markFeedback } from "@/server/feedback";

export const Route = createFileRoute("/feedback")({
  head: () => ({ meta: [{ title: "Site feedback · Cutnotes" }] }),
  component: FeedbackPage,
});

const kindLabel = { broken: "Something broke", idea: "Idea or UI feedback", other: "Other" };

function FeedbackPage() {
  return (
    <MemberScreen query={appShellQuery} skeleton={<Skeleton className="h-40" />}>
      {({ member }) => (
        <SettingsLayout>
          <PageBreadcrumb
            trail={[
              { label: "Projects", link: <Link to="/" /> },
              { label: "Settings", link: <Link to="/settings" /> },
            ]}
            current="Site feedback"
          />
          <PageHeading title="Site feedback" />
          {member.role === "owner" ? (
            <FeedbackList />
          ) : (
            <p>Only an Owner can read Site feedback.</p>
          )}
        </SettingsLayout>
      )}
    </MemberScreen>
  );
}

function FeedbackList() {
  const client = useQueryClient();
  const queryKey = ["feedback"];
  const [status, setStatus] = useState("");
  const [showHandled, setShowHandled] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useStatusToast(status);
  const list = useQuery({ queryKey, queryFn: () => listFeedback() });
  const mark = useMutation({
    mutationFn: (data: { id: string; handled: boolean; note?: string }) => markFeedback({ data }),
    onSuccess: (_result, { handled }) => {
      setStatus(handled ? "Marked handled" : "Marked new");
      return client.invalidateQueries({ queryKey });
    },
  });

  if (list.isPending) return <Skeleton className="h-40" />;
  if (list.isError) return <p role="alert">Could not load Site feedback. Reload the page.</p>;
  const reports = list.data.reports.filter((report) => showHandled || report.handledAt === null);
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {status}
      </p>
      <label className="flex min-h-11 items-center gap-2">
        <Checkbox checked={showHandled} onCheckedChange={(checked) => setShowHandled(checked)} />
        Show handled reports
      </label>
      {mark.isError && <p role="alert">Could not update the report. Try again.</p>}
      {reports.length === 0 && <p className="text-muted-foreground">No reports.</p>}
      <ul className="flex flex-col gap-4">
        {reports.map((report) => (
          <li
            key={report.id}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 wrap-anywhere"
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{kindLabel[report.kind]}</span> ·{" "}
              {new Date(report.createdAt).toLocaleString()} ·{" "}
              {report.memberName ?? report.contact ?? "No name given"}
              {report.handledAt !== null && " · Handled"}
            </p>
            <p className="whitespace-pre-wrap">{report.message}</p>
            {report.memberName && report.contact && (
              <p className="text-sm">Contact: {report.contact}</p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer content-center text-sm">
                Technical details
              </summary>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                {pretty(report.diagnostics)}
              </pre>
            </details>
            {report.handledAt === null ? (
              <label className="text-sm">
                Handled note (optional)
                <Textarea
                  maxLength={2000}
                  value={notes[report.id] ?? ""}
                  onChange={(event) => setNotes({ ...notes, [report.id]: event.target.value })}
                />
              </label>
            ) : (
              report.handledNote && (
                <p className="text-sm whitespace-pre-wrap">{report.handledNote}</p>
              )
            )}
            <PendingButton
              variant="secondary"
              className="w-fit"
              pending={mark.isPending && mark.variables?.id === report.id}
              onClick={() =>
                mark.mutate({
                  id: report.id,
                  handled: report.handledAt === null,
                  note: notes[report.id],
                })
              }
            >
              {report.handledAt === null ? "Mark handled" : "Mark new"}
            </PendingButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pretty(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
