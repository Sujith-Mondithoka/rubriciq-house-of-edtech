import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DisabledInDemo } from "@/components/common/disabled-in-demo";
import { AddTaForm } from "@/components/course/add-ta-form";
import { RemoveMemberButton } from "@/components/course/remove-member-button";
import { ROLE_LABELS, RoleBadge } from "@/components/course/role-badge";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { parsePage } from "@/lib/pagination";
import { addTaAction, removeMemberAction } from "@/server/actions/course.actions";
import { isDemoLocked } from "@/server/authz/demo";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { listMembers } from "@/server/services/course.service";

export const metadata: Metadata = { title: "Members" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function MembersPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]/members">) {
  const { courseId } = await params;
  const { user, course, member, state } = await loadCourseForMember(courseId);
  if (!can(member, "course:viewMembers", { course: state })) notFound();
  const canManage = can(member, "course:manageMembers", { course: state });
  // Members of the shared demo course cannot be removed (enforced on the server too).
  const locked = isDemoLocked(course, user.id);

  const pageRequest = parsePage((await searchParams).page, 50);
  const members = await listMembers(db, course.id, pageRequest);

  return (
    <div className="grid gap-6">
      {canManage ? (
        <section aria-labelledby="add-ta-heading" className="grid gap-3 rounded-xl border p-4">
          <h2 id="add-ta-heading" className="font-medium">
            Teaching assistants
          </h2>
          <AddTaForm courseId={course.id} action={addTaAction} />
        </section>
      ) : null}

      <section aria-labelledby="members-heading" className="grid gap-3">
        <h2 id="members-heading" className="text-lg font-medium">
          Members
        </h2>
        {members.items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No members on this page.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {members.items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="grid min-w-0 gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="break-words">{m.name}</span>
                    <RoleBadge role={m.role} />
                    {m.userId === member.userId ? (
                      <span className="text-sm font-normal text-muted-foreground">(you)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.email} · joined {dateFormat.format(m.joinedAt)}
                  </p>
                </div>
                {canManage && m.role !== "INSTRUCTOR" && locked ? (
                  <DisabledInDemo id={`remove-${m.id}`} label="Remove" />
                ) : canManage && m.role !== "INSTRUCTOR" ? (
                  <RemoveMemberButton
                    memberId={m.id}
                    name={m.name}
                    roleLabel={ROLE_LABELS[m.role]}
                    action={removeMemberAction}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <PaginationNav
          page={members.page}
          hasMore={members.hasMore}
          hrefFor={(page) => `/courses/${course.id}/members?page=${page}`}
          label="Member pages"
        />
      </section>
    </div>
  );
}
