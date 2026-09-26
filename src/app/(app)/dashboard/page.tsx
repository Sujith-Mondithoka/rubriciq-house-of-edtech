import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JoinCourseForm } from "@/components/course/join-course-form";
import { ArchivedBadge, RoleBadge } from "@/components/course/role-badge";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
          <p className="text-muted-foreground">Signed in as {user.email}</p>
        </div>
        <Button asChild size="lg">
          <Link href="/courses/new">
            <PlusIcon aria-hidden />
            Create course
          </Link>
        </Button>
      </div>

      <section aria-labelledby="join-heading" className="grid gap-3 rounded-xl border p-4">
        <h2 id="join-heading" className="font-medium">
          Join a course
        </h2>
        <JoinCourseForm action={joinCourseAction} />
      </section>

      <section aria-labelledby="courses-heading" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="courses-heading" className="text-lg font-medium">
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
                          ? "inline-flex h-8 items-center rounded-md bg-background px-3 text-sm font-medium shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          : "inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
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
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">
              {archived ? "No archived courses" : "You are not in any courses yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {archived
                ? "Courses you archive, or that your instructor archives, appear here."
                : "Create a course to teach, or enter a join code above to join one."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {courses.items.map((c) => (
              <li key={c.id}>
                <Card className="relative h-full transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/courses/${c.id}`}
                        className="outline-none after:absolute after:inset-0 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2 whitespace-pre-wrap">
                      {c.description || "No description"}
                    </CardDescription>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <RoleBadge role={c.role} />
                      {c.archivedAt ? <ArchivedBadge /> : null}
                      <span>
                        {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                  </CardHeader>
                </Card>
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
    </div>
  );
}
