import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/layout/site-footer";

// The footer is a submission requirement: name, GitHub and LinkedIn on every page.
describe("SiteFooter", () => {
  it("shows the author name", () => {
    render(<SiteFooter />);
    expect(screen.getByText("Sujith Mondithoka")).toBeInTheDocument();
  });

  it("links to the author's GitHub and LinkedIn profiles in a new tab", () => {
    render(<SiteFooter />);
    const nav = screen.getByRole("navigation", { name: "Author profiles" });

    const github = within(nav).getByRole("link", { name: /GitHub/ });
    expect(github).toHaveAttribute("href", "https://github.com/Sujith-Mondithoka");

    const linkedin = within(nav).getByRole("link", { name: /LinkedIn/ });
    expect(linkedin).toHaveAttribute("href", "https://www.linkedin.com/in/sujith-m-a6b888249");

    for (const link of [github, linkedin]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAccessibleName(/opens in a new tab/);
    }
  });
});
