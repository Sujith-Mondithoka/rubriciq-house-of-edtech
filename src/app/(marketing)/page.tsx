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

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-16 sm:py-24">
      <section aria-labelledby="hero-heading" className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">{siteConfig.name}</p>
        <h1
          id="hero-heading"
          className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          Faster, fairer feedback on written work.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{siteConfig.description}</p>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border bg-card p-5 text-card-foreground">
              <p className="text-sm text-muted-foreground">Step {index + 1}</p>
              <h3 className="mt-1 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
