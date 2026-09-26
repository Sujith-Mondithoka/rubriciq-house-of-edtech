import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DisabledInDemo } from "@/components/common/disabled-in-demo";
import { AiToggle } from "@/components/course/ai-toggle";
import { ArchiveCourseButton } from "@/components/course/archive-course-button";
import { CourseForm } from "@/components/course/course-form";
import { JoinCodePanel } from "@/components/course/join-code-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  archiveCourseAction,
  regenerateJoinCodeAction,
  setCourseAiAction,
  updateCourseAction,
} from "@/server/actions/course.actions";
import { isDemoLocked } from "@/server/authz/demo";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";

export const metadata: Metadata = { title: "Course settings" };

export default async function CourseSettingsPage({
  params,
}: PageProps<"/courses/[courseId]/settings">) {
  const { courseId } = await params;
  const { user, course, member, state } = await loadCourseForMember(courseId);
  if (member.role !== "INSTRUCTOR") notFound();

  if (!can(member, "course:manage", { course: state })) {
    return (
      <Alert>
        <AlertDescription>
          This course is archived, so its settings can no longer be changed.
        </AlertDescription>
      </Alert>
    );
  }
  // The shared demo course: show the settings, but every change is off (enforced on the server too).
  const locked = isDemoLocked(course, user.id);

  return (
    <div className="grid max-w-2xl gap-6">
      {locked ? (
        <Alert>
          <AlertTitle>Settings are disabled in the demo</AlertTitle>
          <AlertDescription>
            Everyone who tries RubricIQ shares this course, so it cannot be renamed, archived or
            have AI switched off. Create your own course from the dashboard to try every setting.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="details-heading" className="grid gap-4 rounded-xl border p-4">
        <h2 id="details-heading" className="font-medium">
          Details
        </h2>
        {locked ? (
          <>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="break-words">{course.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd className="whitespace-pre-wrap">{course.description || "No description"}</dd>
              </div>
            </dl>
            <DisabledInDemo id="details" label="Edit details" />
          </>
        ) : (
          <CourseForm
            mode="edit"
            courseId={course.id}
            defaultValues={{ name: course.name, description: course.description ?? "" }}
            action={updateCourseAction}
          />
        )}
      </section>

      <section aria-labelledby="ai-heading" className="grid gap-4 rounded-xl border p-4">
        <h2 id="ai-heading" className="font-medium">
          AI
        </h2>
        {locked ? (
          <>
            <p className="text-sm">AI grading drafts are {course.aiEnabled ? "on" : "off"}.</p>
            <DisabledInDemo id="ai" label={course.aiEnabled ? "Turn AI off" : "Turn AI on"} />
          </>
        ) : (
          <AiToggle courseId={course.id} aiEnabled={course.aiEnabled} action={setCourseAiAction} />
        )}
      </section>

      <section aria-labelledby="join-heading" className="grid gap-4 rounded-xl border p-4">
        <h2 id="join-heading" className="font-medium">
          Join code
        </h2>
        <JoinCodePanel
          courseId={course.id}
          joinCode={course.joinCode}
          regenerateAction={locked ? undefined : regenerateJoinCodeAction}
        />
        {locked ? <DisabledInDemo id="join-code" label="Regenerate code" /> : null}
      </section>

      <section
        aria-labelledby="archive-heading"
        className="grid gap-3 rounded-xl border border-destructive/30 p-4"
      >
        <h2 id="archive-heading" className="font-medium">
          Archive
        </h2>
        <p className="text-sm text-muted-foreground">
          Archive the course at the end of term. It becomes read-only; nothing is deleted.
        </p>
        <div>
          {locked ? (
            <DisabledInDemo id="archive" label="Archive course" variant="destructive" />
          ) : (
            <ArchiveCourseButton
              courseId={course.id}
              courseName={course.name}
              action={archiveCourseAction}
            />
          )}
        </div>
      </section>
    </div>
  );
}
