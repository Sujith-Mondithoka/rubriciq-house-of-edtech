"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/common/local-date-time";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServerAction } from "@/lib/result";
import { countWords } from "@/lib/text";
import { SUBMISSION_MAX } from "@/lib/validation/submission.schema";

export type EditorSubmission = {
  id: string;
  content: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: Date | null;
  isLate: boolean;
  updatedAt: Date;
};

type Saved = { submission: EditorSubmission };

type SubmissionEditorProps = {
  assignmentId: string;
  dueAt: Date;
  initial: EditorSubmission | null;
  saveAction: ServerAction<Saved>;
  submitAction: ServerAction<Saved>;
  deleteAction: ServerAction<unknown>;
};

const AUTOSAVE_DELAY_MS = 1500;

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string; content: string };

export function SubmissionEditor({
  assignmentId,
  dueAt,
  initial,
  saveAction,
  submitAction,
  deleteAction,
}: SubmissionEditorProps) {
  const [submission, setSubmission] = useState<EditorSubmission | null>(initial);
  const [content, setContent] = useState(initial?.content ?? "");
  const [savedContent, setSavedContent] = useState(initial?.content ?? "");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [confirmLate, setConfirmLate] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const submitted = submission?.status === "SUBMITTED";
  const dirty = content.trim() !== savedContent;
  const words = countWords(content);
  const tooLong = content.length > SUBMISSION_MAX;

  const save = useCallback(
    async (text: string) => {
      setSaveState({ kind: "saving" });
      const result = await saveAction({ assignmentId, content: text });
      if (result.ok) {
        setSubmission(result.data.submission);
        setSavedContent(result.data.submission.content);
        setSaveState({ kind: "saved", at: new Date() });
      } else {
        setSaveState({ kind: "error", message: result.message, content: text });
      }
    },
    [assignmentId, saveAction],
  );

  // Autosave drafts shortly after typing stops; one request at a time, no retry loop on errors.
  useEffect(() => {
    if (submitted || !dirty || tooLong || saveState.kind === "saving") return;
    if (saveState.kind === "error" && saveState.content === content) return;
    const timer = setTimeout(() => void save(content), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, dirty, save, saveState, submitted, tooLong]);

  // Warn before leaving with text that is not stored yet.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const doSubmit = () =>
    startSubmit(async () => {
      const result = await submitAction({ assignmentId, content });
      if (!result.ok) {
        toast.error(result.fieldErrors?.content?.[0] ?? result.message);
        return;
      }
      const saved = result.data.submission;
      setSubmission(saved);
      setSavedContent(saved.content);
      setSaveState({ kind: "idle" });
      toast.success(`${submitted ? "Resubmitted" : "Submitted"}${saved.isLate ? " (late)" : ""}`);
    });

  const onSubmitClick = () => {
    // Decided at click time: the deadline may pass while the page is open.
    if (Date.now() > dueAt.getTime()) setConfirmLate(true);
    else doSubmit();
  };

  const status = (() => {
    if (submitted && dirty) return "Unsaved changes. Resubmit to update your submission.";
    if (submitted) return null;
    switch (saveState.kind) {
      case "saving":
        return "Saving…";
      case "saved":
        return `Draft saved at ${saveState.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      case "error":
        return `Not saved: ${saveState.message}`;
      default:
        return dirty ? "Unsaved changes" : submission ? "Draft saved" : null;
    }
  })();

  return (
    <div className="grid gap-3">
      {submitted && submission?.submittedAt ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          <strong>{submission.isLate ? "Submitted late" : "Submitted"}</strong> on{" "}
          <LocalDateTime iso={submission.submittedAt.toISOString()} />. You can edit and resubmit
          until the deadline.
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="submission-content">Your answer</Label>
        <Textarea
          id="submission-content"
          rows={16}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          aria-describedby="submission-meta submission-status"
          aria-invalid={tooLong || undefined}
          className="min-h-80 font-serif text-base leading-relaxed"
        />
        <div
          id="submission-meta"
          className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"
        >
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span className={tooLong ? "font-medium text-destructive" : undefined}>
            {content.length.toLocaleString("en")} / {SUBMISSION_MAX.toLocaleString("en")} characters
          </span>
        </div>
        <p
          id="submission-status"
          role="status"
          aria-live="polite"
          className={
            saveState.kind === "error" && !submitted
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {status}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          onClick={onSubmitClick}
          disabled={submitting || tooLong || !content.trim() || (submitted && !dirty)}
          aria-busy={submitting}
        >
          {submitting ? "Submitting…" : submitted ? "Resubmit" : "Submit"}
        </Button>
        {!submitted && submission ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="lg" disabled={submitting}>
                Delete draft
              </Button>
            }
            title="Delete your draft?"
            description="Your saved text for this assignment is permanently deleted. This cannot be undone."
            confirmLabel="Delete draft"
            pendingLabel="Deleting…"
            destructive
            onConfirm={async () => {
              const result = await deleteAction({ submissionId: submission.id });
              if (!result.ok) {
                toast.error(result.message);
                return false;
              }
              setSubmission(null);
              setContent("");
              setSavedContent("");
              setSaveState({ kind: "idle" });
              toast.success("Draft deleted");
              return true;
            }}
          />
        ) : null}
      </div>

      <AlertDialog open={confirmLate} onOpenChange={setConfirmLate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit after the deadline?</AlertDialogTitle>
            <AlertDialogDescription>
              The deadline has passed. Your submission will be accepted but marked late.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>Submit late</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
