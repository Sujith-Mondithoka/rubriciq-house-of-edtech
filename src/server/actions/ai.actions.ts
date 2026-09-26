"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { processRuns } from "@/server/ai/grade-submission";
import { aiConfig, getAiProvider } from "@/server/ai/provider";
import { db } from "@/server/db";

import { makeGenerateAiDraftsHandler } from "./ai.handlers";
import { runAction } from "./run-action";

const generateAiDraftsHandler = makeGenerateAiDraftsHandler(aiConfig);

/**
 * Creates PENDING runs, returns at once, and processes them after the response (at most 3 at a
 * time). The queue and grader poll until the runs finish. `after()` is not a durable queue: a
 * killed function leaves PENDING runs that the next page load marks STALE.
 */
export async function generateAiDraftsAction(input: unknown) {
  return runAction(generateAiDraftsHandler, input, ({ courseId, runIds }) => {
    revalidatePath(`/courses/${courseId}`, "layout");
    const provider = getAiProvider();
    if (provider) after(() => processRuns({ db, provider }, runIds));
  });
}
