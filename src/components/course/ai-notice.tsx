import { BotIcon, BotOffIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Tells students whether their work may be sent to an AI provider (CLAUDE.md AI rules). */
export function AiNotice({ aiEnabled }: { aiEnabled: boolean }) {
  return (
    <Alert>
      {aiEnabled ? <BotIcon aria-hidden /> : <BotOffIcon aria-hidden />}
      <AlertTitle>{aiEnabled ? "AI-assisted feedback" : "AI is off"}</AlertTitle>
      <AlertDescription>
        {aiEnabled
          ? "Submissions in this course may be sent to Google Gemini to draft feedback. A teacher reviews every grade."
          : "AI is turned off for this course. Submissions are never sent to an AI provider."}
      </AlertDescription>
    </Alert>
  );
}
