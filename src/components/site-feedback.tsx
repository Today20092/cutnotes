import { useMutation } from "@tanstack/react-query";
import { MessageSquareWarning } from "lucide-react";
import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { collectDiagnostics, describeError } from "@/lib/diagnostics";
import type { FeedbackKind } from "@/server/db/schema";
import { sendFeedback } from "@/server/feedback";

const kinds = [
  ["broken", "Something broke"],
  ["idea", "Idea or UI feedback"],
  ["other", "Other"],
] as const;

/**
 * Site feedback about Cutnotes itself, open to anyone. It needs no sign-in and no Clerk,
 * so it still works when sign-in is the thing that broke.
 */
export function SiteFeedback({
  look = "link",
  error,
}: {
  /** `icon` for the app shell's top row; `link` for quiet text elsewhere. */
  look?: "icon" | "link";
  /** The error an error screen shows, attached to the report. */
  error?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const label = error === undefined ? "Site feedback" : "Report this problem";
  const trigger =
    look === "icon" ? (
      <Button variant="ghost" aria-label={label} title={label} className="size-11 [&_svg]:size-5" />
    ) : (
      <Button variant={error === undefined ? "link" : "secondary"} className="text-sm" />
    );
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setRound((value) => value + 1);
      }}
    >
      <SheetTrigger render={trigger}>
        {look === "icon" ? <MessageSquareWarning aria-hidden /> : label}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Site feedback</SheetTitle>
          <SheetDescription>
            Tell us what broke or what could work better. Technical details about this page are sent
            with your message.
          </SheetDescription>
        </SheetHeader>
        <FeedbackForm key={round} error={error} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function FeedbackForm({ error, onClose }: { error?: unknown; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>(error === undefined ? "idea" : "broken");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [missing, setMissing] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      sendFeedback({
        data: {
          kind,
          message,
          contact: contact.trim() || undefined,
          diagnostics: collectDiagnostics(
            error === undefined ? {} : { screenError: describeError(error) },
          ),
        },
      }),
  });

  if (send.isSuccess)
    return (
      <div className="flex flex-col gap-4 p-4">
        <p role="status" tabIndex={-1} ref={(note) => note?.focus()} className="outline-none">
          Thank you. Your feedback was sent.
        </p>
        <Button variant="secondary" className="w-fit" onClick={onClose}>
          Close
        </Button>
      </div>
    );

  const rateLimited = send.error instanceof Response && send.error.status === 429;
  return (
    <form
      noValidate
      className="flex flex-col gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!message.trim()) {
          setMissing(true);
          return;
        }
        send.mutate();
      }}
    >
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">What is it about?</legend>
        <RadioGroup value={kind} onValueChange={(next) => setKind(next as FeedbackKind)}>
          {kinds.map(([value, text]) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <Radio value={value} aria-label={text} />
              {text}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="feedback-message" className="text-sm font-medium">
          Message
        </label>
        <Textarea
          id="feedback-message"
          required
          maxLength={5000}
          rows={5}
          value={message}
          aria-invalid={missing}
          aria-describedby={missing ? "feedback-message-error" : "feedback-message-hint"}
          onChange={(event) => {
            setMessage(event.target.value);
            setMissing(false);
          }}
        />
        {missing ? (
          <p id="feedback-message-error" role="alert" className="text-sm text-destructive">
            Write a message.
          </p>
        ) : (
          <p id="feedback-message-hint" className="text-sm text-muted-foreground">
            What were you doing, and what happened?
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="feedback-contact" className="text-sm font-medium">
          Your name or email (optional)
        </label>
        <Input
          id="feedback-contact"
          autoComplete="email"
          maxLength={200}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
        />
      </div>
      <PendingButton type="submit" pending={send.isPending}>
        Send feedback
      </PendingButton>
      {send.isError && (
        <p role="alert" className="text-sm">
          {rateLimited
            ? "Too many reports right now. Wait a minute and try again."
            : "Could not send your feedback. Your text is kept; try again."}
        </p>
      )}
    </form>
  );
}
