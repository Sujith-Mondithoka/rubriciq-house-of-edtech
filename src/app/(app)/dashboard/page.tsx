import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Checked again here: layouts do not re-run on every navigation.
  const user = await requireUser();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </div>
      <section
        aria-labelledby="courses-heading"
        className="rounded-xl border border-dashed p-8 text-center"
      >
        <h2 id="courses-heading" className="font-medium">
          Your courses
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Courses you teach or have joined will appear here.
        </p>
      </section>
    </div>
  );
}
