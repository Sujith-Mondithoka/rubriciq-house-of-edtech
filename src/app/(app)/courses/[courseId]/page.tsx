import type { Metadata } from "next";

import { AiNotice } from "@/components/course/ai-notice";
import { JoinCodePanel } from "@/components/course/join-code-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loadCourseForMember } from "@/server/authz/load-course";
import { isStaff } from "@/server/authz/policy";
import { db } from "@/server/db";
import { countMembersByRole } from "@/server/services/course.service";

export async function generateMetadata({
  params,
}: PageProps<"/courses/[courseId]">): Promise<Metadata> {
  const { course } = await loadCourseForMember((await params).courseId);
  return { title: course.name };
}

export default async function CourseOverviewPage({ params }: PageProps<"/courses/[courseId]">) {
  const { course, member, state } = await loadCourseForMember((await params).courseId);
  const staff = isStaff(member.role);
  const counts = staff ? await countMembersByRole(db, course.id) : null;

  return (
    <div className="grid gap-6">
      {state.archived ? (
        <Alert>
          <AlertDescription>
            This course is archived. It is read-only and its join code no longer works.
          </AlertDescription>
        </Alert>
      ) : null}

      {course.description ? (
        <p className="whitespace-pre-wrap text-muted-foreground">{course.description}</p>
      ) : null}

      <AiNotice aiEnabled={course.aiEnabled} />

      {staff && counts ? (
        <section aria-labelledby="people-heading" className="grid gap-4 rounded-xl border p-4">
          <h2 id="people-heading" className="font-medium">
            People
          </h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {(
              [
                ["Instructor", counts.INSTRUCTOR],
                ["TAs", counts.TA],
                ["Students", counts.STUDENT],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-lg bg-muted/50 p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
          {!state.archived ? (
            <>
              <JoinCodePanel courseId={course.id} joinCode={course.joinCode} />
              <p className="text-sm text-muted-foreground">
                Share this code with students so they can join from their dashboard.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="assignments-heading" className="grid gap-3">
        <h2 id="assignments-heading" className="text-lg font-medium">
          Assignments
        </h2>
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No assignments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {staff
              ? "Assignments and rubrics you create will be listed here."
              : "Your instructor has not published any assignments yet."}
          </p>
        </div>
      </section>
    </div>
  );
}
