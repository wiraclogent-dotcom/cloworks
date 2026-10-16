// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { usePoll } from "@/lib/usePoll";

let hidden = false;
const setHidden = (v: boolean) => { hidden = v; };
beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (document as unknown as { hidden?: boolean }).hidden;
});

describe("usePoll", () => {
  it("calls fn after the interval and again one interval after the previous call settles", async () => {
    const fn = vi.fn(async () => {});
    renderHook(() => usePoll(fn, 1000));
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not call again while the previous call is pending", async () => {
    let resolve!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    renderHook(() => usePoll(fn, 1000));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fn).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and runs once immediately on becoming visible", async () => {
    const fn = vi.fn(async () => {});
    setHidden(true);
    renderHook(() => usePoll(fn, 1000));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).not.toHaveBeenCalled();
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("enabled:false never calls; flipping to enabled with immediate runs at once", async () => {
    const fn = vi.fn(async () => {});
    const { rerender } = renderHook(({ enabled }) => usePoll(fn, 1000, { enabled, immediate: true }), { initialProps: { enabled: false } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("immediate:true calls on mount", async () => {
    const fn = vi.fn(async () => {});
    renderHook(() => usePoll(fn, 1000, { immediate: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps polling after a rejection", async () => {
    const fn = vi.fn(async () => { throw new Error("boom"); });
    renderHook(() => usePoll(fn, 1000));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a new fn closure each render does not restart the timer, and the latest fn is used", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    const { rerender } = renderHook(({ f }) => usePoll(f, 1000), { initialProps: { f: a } });
    await vi.advanceTimersByTimeAsync(600);
    rerender({ f: b });
    await vi.advanceTimersByTimeAsync(400);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unmount stops polling", async () => {
    const fn = vi.fn(async () => {});
    const { unmount } = renderHook(() => usePoll(fn, 1000));
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
