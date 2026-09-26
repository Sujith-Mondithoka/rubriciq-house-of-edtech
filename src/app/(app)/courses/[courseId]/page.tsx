import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AssignmentList } from "@/components/assignment/assignment-list";
import { AiNotice } from "@/components/course/ai-notice";
import { JoinCodePanel } from "@/components/course/join-code-panel";
import { SubmissionStatusBadge } from "@/components/submission/submission-status-badge";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { parsePage } from "@/lib/pagination";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can, isStaff } from "@/server/authz/policy";
import { db } from "@/server/db";
import { listAssignments } from "@/server/services/assignment.service";
import { countMembersByRole } from "@/server/services/course.service";
import { countSubmissions, getOwnSubmissionStatuses } from "@/server/services/submission.service";

export async function generateMetadata({
  params,
}: PageProps<"/courses/[courseId]">): Promise<Metadata> {
  const { course } = await loadCourseForMember((await params).courseId);
  return { title: course.name };
}

export default async function CourseOverviewPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]">) {
  const { user, course, member, state } = await loadCourseForMember((await params).courseId);
  const staff = isStaff(member.role);
  const pageRequest = parsePage((await searchParams).page, 20);
  const [counts, assignments] = await Promise.all([
    staff ? countMembersByRole(db, course.id) : null,
    listAssignments(db, course.id, { includeDrafts: staff }, pageRequest),
  ]);
  const ids = assignments.items.map((a) => a.id);
  // One batched query for the whole page: counts for staff, own status for students.
  const [submissionCounts, ownStatuses] = await Promise.all([
    staff ? countSubmissions(db, ids) : null,
    staff ? null : getOwnSubmissionStatuses(db, user.id, ids),
  ]);
  const canCreate = can(member, "assignment:create", { course: state });

  return (
    <div className="grid gap-8">
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

      <section aria-labelledby="assignments-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="assignments-heading" className="section-title">
            Assignments
          </h2>
          {canCreate ? (
            <Button asChild size="lg">
              <Link href={`/courses/${course.id}/assignments/new`}>
                <PlusIcon aria-hidden />
                New assignment
              </Link>
            </Button>
          ) : null}
        </div>
        <AssignmentList
          courseId={course.id}
          items={assignments.items}
          renderMeta={(a) => {
            if (ownStatuses) return <SubmissionStatusBadge own={ownStatuses.get(a.id)} />;
            if (a.status === "DRAFT") return null;
            const c = submissionCounts?.get(a.id);
            return (
              <span className="text-sm text-muted-foreground">
                {c?.submitted ?? 0} submitted{c?.late ? ` (${c.late} late)` : ""}
              </span>
            );
          }}
          emptyTitle="No assignments yet"
          emptyHint={
            canCreate
              ? "Create an assignment, build its rubric, then publish it to students."
              : staff
                ? "The instructor has not created any assignments yet."
                : "Your instructor has not published any assignments yet."
          }
        />
        <PaginationNav
          page={assignments.page}
          hasMore={assignments.hasMore}
          hrefFor={(page) => `/courses/${course.id}?page=${page}`}
          label="Assignment pages"
        />
      </section>

      {staff && counts ? (
        <section aria-labelledby="people-heading" className="card-surface grid gap-4 p-5">
          <h2 id="people-heading" className="section-title">
            People
          </h2>
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                ["Instructor", counts.INSTRUCTOR],
                ["TAs", counts.TA],
                ["Students", counts.STUDENT],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="grid gap-1 rounded-lg bg-muted/60 p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{n}</dd>
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
    </div>
  );
}
