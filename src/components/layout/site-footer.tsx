import { siteConfig } from "@/lib/site";

const linkClass =
  "underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SiteFooter() {
  const { author } = siteConfig;

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Built by <span className="font-medium text-foreground">{author.name}</span>
        </p>
        <nav aria-label="Author profiles">
          <ul className="flex gap-4">
            <li>
              <a
                href={author.github}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>
              <a
                href={author.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                LinkedIn
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
