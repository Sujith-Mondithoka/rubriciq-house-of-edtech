import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DemoLoginButtons } from "@/components/auth/demo-login-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/validation/auth.schema";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Sign in</h1>
          </CardTitle>
          <CardDescription>Welcome back. Enter your email and password.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {params.error === "demo" ? (
            <Alert variant="destructive">
              <AlertDescription>
                The demo accounts are being reset. Please try again in a minute.
              </AlertDescription>
            </Alert>
          ) : null}
          <SignInForm next={next} />
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <Link
              href={`/sign-up?next=${encodeURIComponent(next)}`}
              className="text-foreground underline underline-offset-4"
            >
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="demo-heading" className="grid gap-3">
        <h2 id="demo-heading" className="font-medium">
          Or explore with a demo account
        </h2>
        <DemoLoginButtons />
      </section>
    </div>
  );
}
