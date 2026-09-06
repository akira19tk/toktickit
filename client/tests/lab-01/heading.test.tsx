// UI-01: TokTickIT heading renders on initial load
// Lab 2 note: App now shows the Requester Selection screen on first visit;
// the brand heading is visible in the loading state, before any API call resolves.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "../../src/App";

describe("App heading", () => {
  it("renders the TokTickIT heading on the initial selection screen", () => {
    render(<App />);
    // The h1 brand heading is part of the loading state — visible synchronously.
    expect(
      screen.getByRole("heading", { name: /toktickit/i })
    ).toBeInTheDocument();
  });
});
