import type { AiConfig } from "@/lib/env-schema";
import { AppError } from "@/lib/errors";
import { generateAiDraftsSchema } from "@/lib/validation/ai.schema";
import { PROMPT_VERSION } from "@/server/ai/prompt";
import { authorize } from "@/server/authz/authorize";
import { can } from "@/server/authz/policy";
import { startAiRuns, sweepStaleRuns } from "@/server/services/ai.service";
import { getAssignmentAccess } from "@/server/services/assignment.service";
import { courseState } from "@/server/services/course.service";

import { defineHandler } from "./handler";

/**
 * Starts AI drafts (bulk or one submission). Checks: grader role, AI configured, course AI on,
 * daily cap and no active run. The runs themselves are processed after the response.
 */
export function makeGenerateAiDraftsHandler(
  config: Pick<AiConfig, "available" | "model" | "dailyCap">,
) {
  return defineHandler(generateAiDraftsSchema, async (ctx, input) => {
    const access = await getAssignmentAccess(ctx.db, input.assignmentId, ctx.user.id);
    if (!access) throw new AppError("NOT_FOUND", "Assignment not found.");
    const course = courseState(access.course);
    if (!can(access.member, "submission:viewAll", { course })) {
      throw new AppError("NOT_FOUND", "Assignment not found.");
    }
    if (!config.available) {
      throw new AppError("CONFLICT", "AI drafting is not set up on this server. Grade manually.");
    }
    if (!course.aiEnabled) {
      throw new AppError("FORBIDDEN", "AI is turned off for this course.");
    }
    authorize(access.member, "ai:run", { course });

    await sweepStaleRuns(ctx.db, access.assignment.id, ctx.now);
    const { runIds } = await startAiRuns(ctx.db, {
      courseId: access.course.id,
      assignmentId: access.assignment.id,
      submissionIds: input.submissionIds ?? null,
      requestedBy: ctx.user.id,
      model: config.model,
      promptVersion: PROMPT_VERSION,
      dailyCap: config.dailyCap,
      now: ctx.now,
    });
    return { courseId: access.course.id, assignmentId: access.assignment.id, runIds };
  });
}
