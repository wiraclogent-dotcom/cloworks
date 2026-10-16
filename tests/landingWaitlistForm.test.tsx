// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { failed, told } from "@/lib/authForm";
import { waitlistSuccess } from "@/lib/waitlist";

// The default action is a server action that reaches the database; these tests inject their own.
vi.mock("@/app/waitlistActions", () => ({ joinWaitlist: vi.fn() }));
import { WaitlistForm } from "@/components/landing/WaitlistForm";

afterEach(cleanup);

/** The fields are `required`, so a real submit needs them filled (jsdom blocks an invalid form like a browser does). */
function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText("Team or company"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByLabelText("Team size"), { target: { value: "SIZE_1_5" } });
  fireEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
}

describe("landing: waitlist form", () => {
  it("labels every field and offers the four team sizes", () => {
    render(<WaitlistForm action={vi.fn()} />);
    const email = screen.getByLabelText("Work email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Team or company").getAttribute("autocomplete")).toBe("organization");
    const size = screen.getByLabelText("Team size");
    expect(Array.from(size.querySelectorAll("option")).map((o) => o.textContent)).toEqual(expect.arrayContaining(["1–5", "6–15", "16–50", "50+"]));
    expect(screen.getByRole("button", { name: "Join the waitlist" })).toBeTruthy();
  });

  it("hides the honeypot from people and assistive tech", () => {
    const { container } = render(<WaitlistForm action={vi.fn()} />);
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]');
    expect(trap).not.toBeNull();
    expect(trap!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap!.getAttribute("tabindex")).toBe("-1");
    expect(trap!.getAttribute("autocomplete")).toBe("off");
  });

  it("shows an error in an alert and refills the fields", async () => {
    const action = vi.fn(async () => failed("Enter your work email.", { email: "bad", team: "Acme", teamSize: "SIZE_1_5" }));
    render(<WaitlistForm action={action} />);
    fillAndSubmit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Enter your work email.");
    await waitFor(() => expect((screen.getByLabelText("Team or company") as HTMLInputElement).value).toBe("Acme"));
    expect((screen.getByLabelText("Team size") as HTMLSelectElement).value).toBe("SIZE_1_5");
  });

  it("replaces the fields with the success message", async () => {
    const action = vi.fn(async () => told(waitlistSuccess("a@b.co")));
    render(<WaitlistForm action={action} />);
    fillAndSubmit();
    expect((await screen.findByText(waitlistSuccess("a@b.co"))).textContent).toContain("a@b.co");
    expect(screen.queryByRole("button", { name: "Join the waitlist" })).toBeNull();
    expect(screen.queryByLabelText("Work email")).toBeNull();
  });
});
