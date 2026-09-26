import {
  ArrowRightIcon,
  EyeIcon,
  KeyboardIcon,
  PowerOffIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { DemoLoginButtons } from "@/components/auth/demo-login-buttons";
import { GraderPreview } from "@/components/marketing/grader-preview";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

const steps = [
  {
    title: "Build a rubric",
    body: "Define criteria and performance levels once. Students see exactly how they will be graded.",
  },
  {
    title: "AI drafts the feedback",
    body: "Each criterion gets a suggested level, written feedback and quoted evidence from the submission.",
  },
  {
    title: "You review and release",
    body: "Accept or override every suggestion. Nothing reaches a student until you release it.",
  },
];

const trust: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: EyeIcon,
    title: "A person releases every grade",
    body: "AI only drafts. Students never see a score until a teacher has reviewed it.",
  },
  {
    icon: QuoteIcon,
    title: "Evidence, quoted word for word",
    body: "Quotes that are not in the submission are dropped and flagged, never shown as proof.",
  },
  {
    icon: PowerOffIcon,
    title: "AI is optional",
    body: "Turn it off for a course; manual grading works exactly the same.",
  },
  {
    icon: KeyboardIcon,
    title: "Accessible by default",
    body: "Keyboard-first grading, visible focus, and checked against WCAG 2.1 AA.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section
        aria-labelledby="hero-heading"
        className="border-b bg-gradient-to-b from-accent/60 to-background"
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr]">
          <div className="grid gap-6">
            <p className="w-fit rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Rubrics · AI drafts · human release
            </p>
            <h1
              id="hero-heading"
              className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
            >
              Faster, fairer feedback on written work.
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              {siteConfig.description}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-10 px-4">
                <Link href="#demo">
                  Try the demo
                  <ArrowRightIcon aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-10 bg-card px-4">
                <Link href="/sign-up">Create an account</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              No setup: sign in to a seeded course in one click. Demo data resets daily.
            </p>
          </div>
          <GraderPreview />
        </div>
      </section>

      <section aria-labelledby="trust-heading" className="mx-auto w-full max-w-6xl px-4 py-14">
        <h2 id="trust-heading" className="sr-only">
          Why teachers can trust it
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map(({ icon: Icon, title, body }) => (
            <li key={title} className="grid content-start gap-2">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"
              >
                <Icon className="size-4.5" />
              </span>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="border-y bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14">
          <div className="grid gap-2">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading" className="section-title text-2xl">
              From rubric to released grade in three steps
            </h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="grid content-start gap-3">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <h3 className="font-medium">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="demo"
        aria-labelledby="demo-heading"
        className="mx-auto grid w-full max-w-6xl scroll-mt-20 gap-6 px-4 py-14"
      >
        <div className="grid gap-2">
          <p className="eyebrow">Live demo</p>
          <h2 id="demo-heading" className="section-title text-2xl">
            Try it in one click
          </h2>
          <p className="text-muted-foreground">
            Sign in to a demo course with essays at every stage of grading.
          </p>
        </div>
        <DemoLoginButtons />
      </section>
    </div>
  );
}
