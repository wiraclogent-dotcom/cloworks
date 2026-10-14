// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({ refresh: vi.fn(), inPlace: vi.fn(), submit: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
vi.mock("@/app/(app)/projects/actions", () => ({
  submitProject: (...a: unknown[]) => h.submit(...a),
  submitProjectInPlace: (...a: unknown[]) => h.inPlace(...a),
}));

import { ProjectDetailsCard } from "@/components/projects/ProjectDetailsCard";

afterEach(cleanup);
beforeEach(() => { h.refresh.mockReset(); h.inPlace.mockReset(); h.submit.mockReset(); });

const brands = [{ id: "b1", name: "Zed" }, { id: "b2", name: "Alpha" }];
const owners = [{ id: "u1", name: "Rina" }, { id: "u2", name: "Budi" }];
const project = {
  id: "p1", title: "Autumn campaign", subTitle: "Phase 2", brandName: "Zed", brandId: "b1", ownerId: "u1", ownerName: "Rina",
  status: "CANCELLED" as const, startIso: "2026-09-21T17:00:00.000Z", dueIso: "2026-11-01T17:00:00.000Z", fileUrl: "https://x.test/folder",
};

describe("ProjectDetailsCard read view", () => {
  it("shows brand, owner, Canceled chip, Jakarta start date and the file link", () => {
    render(<ProjectDetailsCard project={project} brands={brands} owners={owners} canManage />);
    expect(screen.getByText("Zed")).toBeTruthy();
    expect(screen.getByText("Rina")).toBeTruthy();
    expect(screen.getByText("Canceled")).toBeTruthy();
    expect(screen.getByText("22 Sep 2026")).toBeTruthy();
    expect(screen.getByText("2 Nov 2026")).toBeTruthy();
    const link = screen.getByRole("link", { name: /x\.test\/folder/ });
    expect(link.getAttribute("href")).toBe("https://x.test/folder");
  });
  it("hides Edit when the user cannot manage", () => {
    render(<ProjectDetailsCard project={project} brands={brands} owners={owners} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("shows dashes for missing values", () => {
    render(<ProjectDetailsCard project={{ ...project, brandName: null, brandId: null, startIso: null, dueIso: null, fileUrl: null }} brands={brands} owners={owners} canManage={false} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });
});

describe("ProjectDetailsCard edit view", () => {
  it("opens a prefilled form with a Cancel button, and Cancel returns to the read view", () => {
    render(<ProjectDetailsCard project={project} brands={brands} owners={owners} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe("Autumn campaign");
    expect((screen.getByLabelText(/Owner/) as HTMLSelectElement).value).toBe("u1");
    expect((document.querySelector('input[name="startDate"]') as HTMLInputElement).value).toBe("2026-09-22");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/Title/)).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });
  it("on a successful save returns to the read view and refreshes the route", async () => {
    h.inPlace.mockResolvedValue({ ok: true, nonce: "n1" });
    render(<ProjectDetailsCard project={project} brands={brands} owners={owners} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy());
    expect(h.inPlace).toHaveBeenCalledWith("p1", null, expect.any(FormData));
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalled();
  });
  it("stays in the form and shows the error when the save fails", async () => {
    h.inPlace.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Fix the errors.", fieldErrors: { title: "Title is required." }, values: { title: "", subTitle: "", brandId: "", ownerId: "u1", status: "NOT_STARTED", startDate: "", dueDate: "", fileUrl: "" }, nonce: "n2" });
    render(<ProjectDetailsCard project={project} brands={brands} owners={owners} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Title is required.")).toBeTruthy());
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
