import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EuiProvider } from "@elastic/eui";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("invokes onGetStarted when clicking Get started", async () => {
    const user = userEvent.setup();
    const onGetStarted = vi.fn();
    render(
      <EuiProvider colorMode="light">
        <LandingPage isUnifiedCloud={false} onGetStarted={onGetStarted} />
      </EuiProvider>
    );
    expect(screen.getByRole("heading", { name: /welcome/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /get started/i }));
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });
});
