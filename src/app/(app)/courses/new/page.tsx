import type { Metadata } from "next";
import Link from "next/link";

import { CourseForm } from "@/components/course/course-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createCourseAction } from "@/server/actions/course.actions";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create a course" };

export default async function NewCoursePage() {
  await requireUser();

  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to dashboard
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Create a course</h1>
          </CardTitle>
          <CardDescription>
            You will be the course instructor. A join code for students is created automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseForm mode="create" action={createCourseAction} />
        </CardContent>
      </Card>
    </div>
  );
}
