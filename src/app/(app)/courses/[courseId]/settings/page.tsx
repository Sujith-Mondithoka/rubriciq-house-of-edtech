import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AiToggle } from "@/components/course/ai-toggle";
import { ArchiveCourseButton } from "@/components/course/archive-course-button";
import { CourseForm } from "@/components/course/course-form";
import { JoinCodePanel } from "@/components/course/join-code-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  archiveCourseAction,
  regenerateJoinCodeAction,
  setCourseAiAction,
  updateCourseAction,
} from "@/server/actions/course.actions";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";

export const metadata: Metadata = { title: "Course settings" };

export default async function CourseSettingsPage({
  params,
}: PageProps<"/courses/[courseId]/settings">) {
  const { courseId } = await params;
  const { course, member, state } = await loadCourseForMember(courseId);
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

  return (
    <div className="grid max-w-2xl gap-6">
      <section aria-labelledby="details-heading" className="grid gap-4 rounded-xl border p-4">
        <h2 id="details-heading" className="font-medium">
          Details
        </h2>
        <CourseForm
          mode="edit"
          courseId={course.id}
          defaultValues={{ name: course.name, description: course.description ?? "" }}
          action={updateCourseAction}
        />
      </section>

      <section aria-labelledby="ai-heading" className="grid gap-4 rounded-xl border p-4">
        <h2 id="ai-heading" className="font-medium">
          AI
        </h2>
        <AiToggle courseId={course.id} aiEnabled={course.aiEnabled} action={setCourseAiAction} />
      </section>

      <section aria-labelledby="join-heading" className="grid gap-4 rounded-xl border p-4">
        <h2 id="join-heading" className="font-medium">
          Join code
        </h2>
        <JoinCodePanel
          courseId={course.id}
          joinCode={course.joinCode}
          regenerateAction={regenerateJoinCodeAction}
        />
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
          <ArchiveCourseButton
            courseId={course.id}
            courseName={course.name}
            action={archiveCourseAction}
          />
        </div>
      </section>
    </div>
  );
}
