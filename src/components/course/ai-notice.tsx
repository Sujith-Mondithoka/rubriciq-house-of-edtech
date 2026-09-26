import { BotIcon, BotOffIcon } from "lucide-react";

/** Tells students whether their work may be sent to an AI provider (CLAUDE.md AI rules). */
export function AiNotice({ aiEnabled }: { aiEnabled: boolean }) {
  const Icon = aiEnabled ? BotIcon : BotOffIcon;
  return (
    <aside
      aria-label={aiEnabled ? "AI-assisted feedback" : "AI is off"}
      className="flex gap-3 rounded-xl border bg-card p-4 text-sm"
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="grid gap-1">
        <p className="font-medium">{aiEnabled ? "AI-assisted feedback" : "AI is off"}</p>
        {aiEnabled ? (
          <>
            <p className="text-muted-foreground">
              Submissions in this course may be sent to Google Gemini to draft feedback. A teacher
              reviews every grade.
            </p>
            <p className="text-muted-foreground">
              This app uses Gemini&apos;s free tier, where Google may use submitted content to
              improve its products. Don&apos;t include personal information you would not want
              shared.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            AI is turned off for this course. Submissions are never sent to an AI provider.
          </p>
        )}
      </div>
    </aside>
  );
}
