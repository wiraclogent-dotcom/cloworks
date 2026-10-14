// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Switch as ShadSwitch } from "@/components/shadcn/switch";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/ui/Switch";
import { RadioCards } from "@/components/ui/RadioCards";
import { RememberMe } from "@/components/ui/PasswordInput";

afterEach(cleanup);

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const post = (form: HTMLFormElement) => new FormData(form);

describe("Switch in a plain form", () => {
  it("posts on/off: checked → 'on', unchecked → nothing", () => {
    const { container } = render(
      <form>
        <ShadSwitch name="enabled" aria-label="On" defaultChecked />
        <ShadSwitch name="other" aria-label="Off" />
      </form>,
    );
    const fd = post(container.querySelector("form")!);
    expect(fd.get("enabled")).toBe("on");
    expect(fd.get("other")).toBeNull();
  });

  it("follows a click, and a custom value is posted instead of 'on'", () => {
    const { container } = render(<form><ShadSwitch name="s" value="yes" aria-label="S" /></form>);
    const form = container.querySelector("form")!;
    expect(post(form).get("s")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "S" }));
    expect(post(form).get("s")).toBe("yes");
    fireEvent.click(screen.getByRole("switch", { name: "S" }));
    expect(post(form).get("s")).toBeNull();
  });

  it("uses the focus ring, the primary track, padding, colour transition and 55% disabled opacity", () => {
    render(<ShadSwitch aria-label="S" />);
    const t = tokens(screen.getByRole("switch", { name: "S" }));
    for (const c of ["focus-visible:outline-2", "focus-visible:outline-ring", "data-[state=checked]:bg-primary", "data-[state=unchecked]:bg-input", "disabled:opacity-55", "p-0.5", "transition-colors", "duration-150"]) {
      expect(t, c).toContain(c);
    }
  });
});

describe("Checkbox in a plain form", () => {
  it("posts its value (default 'on') when checked and nothing when unchecked", () => {
    const { container } = render(
      <form>
        <Checkbox name="active" aria-label="Active" defaultChecked />
        <Checkbox name="remember" value="1" aria-label="Remember" defaultChecked />
        <Checkbox name="off" aria-label="Off" />
      </form>,
    );
    const fd = post(container.querySelector("form")!);
    expect(fd.get("active")).toBe("on");
    expect(fd.get("remember")).toBe("1");
    expect(fd.get("off")).toBeNull();
  });

  it("toggles on click, is role=checkbox, and never posts when disabled", () => {
    const { container } = render(
      <form>
        <Checkbox name="a" aria-label="A" />
        <Checkbox name="d" aria-label="D" defaultChecked disabled />
      </form>,
    );
    const form = container.querySelector("form")!;
    const a = screen.getByRole("checkbox", { name: "A" });
    expect(a.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(a);
    expect(a.getAttribute("aria-checked")).toBe("true");
    expect(post(form).get("a")).toBe("on");
    expect(post(form).get("d")).toBeNull();
  });

  it("RememberMe is labelled, unchecked, and posts remember=1 only when ticked", () => {
    const { container } = render(<form><RememberMe id="rm" /></form>);
    const form = container.querySelector("form")!;
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(post(form).get("remember")).toBeNull();
    fireEvent.click(screen.getByText("Remember me"));
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(post(form).get("remember")).toBe("1");
  });
});

describe("RadioCards", () => {
  const options = [
    { value: "no", title: "No", description: "Static design only" },
    { value: "yes", title: "Yes, needs motion", description: "Video or animation" },
  ];

  it("posts the chosen value and each radio is named by its card title", () => {
    const { container } = render(<form><RadioCards name="needsMotion" legend="Does this task need motion?" options={options} defaultValue="no" /></form>);
    const form = container.querySelector("form")!;
    expect(screen.getByRole("radiogroup", { name: "Does this task need motion?" })).toBeTruthy();
    const no = screen.getByRole("radio", { name: "No" });
    const yes = screen.getByRole("radio", { name: "Yes, needs motion" });
    expect(no.getAttribute("aria-checked")).toBe("true");
    expect(yes.getAttribute("aria-checked")).toBe("false");
    expect(post(form).get("needsMotion")).toBe("no");
    expect(yes.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(yes.getAttribute("aria-describedby")!)!.textContent).toBe("Video or animation");
    fireEvent.click(yes);
    expect(yes.getAttribute("aria-checked")).toBe("true");
    expect(no.getAttribute("aria-checked")).toBe("false");
    expect(post(form).getAll("needsMotion")).toEqual(["yes"]);
  });

  it("with no default nothing is posted until a card is chosen; clicking the card text chooses it", () => {
    const { container } = render(<form><RadioCards name="workKind" legend="Kind" options={options} /></form>);
    const form = container.querySelector("form")!;
    expect(post(form).get("workKind")).toBeNull();
    fireEvent.click(screen.getByText("Video or animation"));
    expect(post(form).get("workKind")).toBe("yes");
  });

  it("arrow keys move between the radios and choose", async () => {
    const { container } = render(<form><RadioCards name="m" legend="Motion" options={options} defaultValue="no" /></form>);
    const no = screen.getByRole("radio", { name: "No" });
    const yes = screen.getByRole("radio", { name: "Yes, needs motion" });
    no.focus();
    fireEvent.keyDown(no, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(yes));
    expect(yes.getAttribute("aria-checked")).toBe("true");
    expect(post(container.querySelector("form")!).get("m")).toBe("yes");
  });

  it("controlled mode reports the chosen value", () => {
    const onChange = vi.fn();
    render(<RadioCards name="m" legend="Motion" options={options} value="no" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
    expect(onChange).toHaveBeenCalledWith("yes");
    expect(screen.getByRole("radio", { name: "No" }).getAttribute("aria-checked")).toBe("true");
  });

  it("carries required to the radios and invalid to the group", () => {
    render(<RadioCards name="m" legend="Motion" options={options} required invalid />);
    expect(screen.getByRole("radiogroup", { name: "Motion" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("radio", { name: "No" }).hasAttribute("data-disabled")).toBe(false);
    expect(screen.getByRole("radiogroup", { name: "Motion" }).getAttribute("aria-required")).toBe("true");
  });
});

describe("Switch row", () => {
  it("the whole row is the label: role=switch, named by the label, description linked, clicking text toggles", () => {
    const onCheckedChange = vi.fn();
    render(<Switch id="s" label="Counts toward KPI" description="Included in monthly totals" checked={false} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "Counts toward KPI" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(document.getElementById(sw.getAttribute("aria-describedby")!)!.textContent).toBe("Included in monthly totals");
    fireEvent.click(screen.getByText("Included in monthly totals"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("Counts toward KPI"));
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("keeps an extra describedBy and does not toggle when disabled", () => {
    const onCheckedChange = vi.fn();
    render(<Switch id="s" label="L" checked disabled describedBy="err" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "L" }) as HTMLButtonElement;
    expect(sw.getAttribute("aria-describedby")).toBe("err");
    expect(sw.disabled).toBe(true);
    fireEvent.click(screen.getByText("L"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("posts on/off when given a name", () => {
    const { container } = render(<form><Switch id="s" name="enabled" label="L" checked onCheckedChange={() => {}} /></form>);
    expect(post(container.querySelector("form")!).get("enabled")).toBe("on");
  });
});
