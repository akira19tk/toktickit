// UI-01: TokTickIT heading renders
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "../../src/App";

describe("App heading", () => {
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /toktickit/i })
    ).toBeInTheDocument();
  });
});
