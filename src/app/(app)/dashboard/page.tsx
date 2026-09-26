import { ArchiveIcon, ArrowRightIcon, BookOpenIcon, PlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { JoinCourseForm } from "@/components/course/join-course-form";
import { ArchivedBadge, RoleBadge } from "@/components/course/role-badge";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { Button } from "@/components/ui/button";

import { parsePage } from "@/lib/pagination";
import { joinCourseAction } from "@/server/actions/course.actions";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { listMyCourses } from "@/server/services/course.service";

export const metadata: Metadata = { title: "Dashboard" };

const TABS = [
  { view: "active", label: "Active" },
  { view: "archived", label: "Archived" },
] as const;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  // Checked again here: layouts do not re-run on every navigation.
  const user = await requireUser();
  const params = await searchParams;
  const archived = params.view === "archived";
  const pageRequest = parsePage(params.page, 12);
  const courses = await listMyCourses(db, user.id, { archived }, pageRequest);
  const firstName = user.name.split(" ")[0];

  const hrefFor = (page: number) =>
    `/dashboard?${new URLSearchParams({ ...(archived ? { view: "archived" } : {}), page: String(page) })}`;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="page-title">Welcome, {firstName}</h1>
          <p className="text-muted-foreground">Signed in as {user.email}</p>
        </div>
        <Button asChild variant="outline" size="lg" className="bg-card">
          <Link href="/courses/new">
            <PlusIcon aria-hidden />
            Teaching? Create a course
          </Link>
        </Button>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="courses-heading" className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="courses-heading" className="section-title">
              Your courses
            </h2>
            <nav aria-label="Course list filter">
              <ul className="flex gap-1 rounded-lg bg-muted p-1">
                {TABS.map(({ view, label }) => {
                  const active = (view === "archived") === archived;
                  return (
                    <li key={view}>
                      <Link
                        href={view === "archived" ? "/dashboard?view=archived" : "/dashboard"}
                        aria-current={active ? "page" : undefined}
                        className={
                          active
                            ? "inline-flex h-8 items-center rounded-md bg-card px-3 text-sm font-medium shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            : "inline-flex h-8 items-center rounded-md px-3 text-sm text-foreground/75 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                        }
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          {courses.items.length === 0 ? (
            <EmptyState
              icon={archived ? ArchiveIcon : BookOpenIcon}
              title={archived ? "No archived courses" : "You are not in any courses yet"}
            >
              {archived
                ? "Courses you archive, or that your instructor archives, appear here."
                : "Create a course to teach, or enter a join code to join one."}
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {courses.items.map((c) => (
                <li key={c.id}>
                  <div className="card-surface group relative flex h-full flex-col gap-3 p-4 transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:border-primary/40">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-base font-semibold text-accent-foreground"
                      >
                        {c.name.trim()[0]?.toUpperCase() ?? "C"}
                      </span>
                      <div className="grid min-w-0 gap-1">
                        <h3 className="font-semibold break-words">
                          <Link
                            href={`/courses/${c.id}`}
                            className="outline-none group-hover:underline after:absolute after:inset-0"
                          >
                            {c.name}
                          </Link>
                        </h3>
                        <p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
                          {c.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                      <RoleBadge role={c.role} />
                      {c.archivedAt ? <ArchivedBadge /> : null}
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon aria-hidden className="size-3.5" />
                        {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                      </span>
                      <ArrowRightIcon
                        aria-hidden
                        className="ml-auto size-4 transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <PaginationNav
            page={courses.page}
            hasMore={courses.hasMore}
            hrefFor={hrefFor}
            label="Course pages"
          />
        </section>

        <section
          aria-labelledby="join-heading"
          className="card-surface grid gap-3 p-5 lg:sticky lg:top-20"
        >
          <div className="grid gap-1">
            <h2 id="join-heading" className="font-semibold">
              Join a course
            </h2>
            <p className="text-sm text-muted-foreground">
              Students: enter the code your teacher shared.
            </p>
          </div>
          <JoinCourseForm action={joinCourseAction} />
        </section>
      </div>
    </div>
  );
}
