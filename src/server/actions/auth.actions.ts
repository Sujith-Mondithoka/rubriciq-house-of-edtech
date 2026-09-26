"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { demoRoleSchema } from "@/lib/validation/auth.schema";
import { auth } from "@/server/auth/auth";
import { DEMO_LOGINS, DEMO_PASSWORD } from "@/server/db/demo-accounts";

/** One-click sign-in to a seeded demo account. */
export async function signInAsDemo(formData: FormData) {
  const role = demoRoleSchema.safeParse(formData.get("role"));
  if (!role.success) redirect("/sign-in?error=demo");

  try {
    await auth.api.signInEmail({
      body: { email: DEMO_LOGINS[role.data].email, password: DEMO_PASSWORD },
      headers: await headers(),
    });
  } catch (error) {
    // Demo accounts missing (not seeded) or temporarily reset.
    if (isAPIError(error)) {
      console.warn("Demo sign-in failed", {
        role: role.data,
        status: error.statusCode,
        code: error.body?.code,
        message: error.body?.message,
      });
      redirect("/sign-in?error=demo");
    }
    throw error;
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
