// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const requestUploadSignature = vi.fn();
const registerUpload = vi.fn();
vi.mock("@/app/(app)/content/actions", () => ({
  requestUploadSignature: (...a: unknown[]) => requestUploadSignature(...a),
  registerUpload: (...a: unknown[]) => registerUpload(...a),
}));

import { MediaUpload } from "@/components/media/MediaUpload";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const fileOf = (name: string, type: string, bytes: number) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};
const pick = (f: File) => fireEvent.change(screen.getByLabelText("Add media"), { target: { files: [f] } });

/** Minimal XHR stand-in: records the request and answers with `response` on send. */
function fakeXhr(status: number, response: object) {
  const sent: { url?: string; body?: FormData } = {};
  class X {
    upload = { onprogress: null as null | ((e: ProgressEvent) => void) };
    status = 0;
    responseText = "";
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    open(_m: string, url: string) { sent.url = url; }
    send(body: FormData) {
      sent.body = body;
      this.status = status;
      this.responseText = JSON.stringify(response);
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("XMLHttpRequest", X);
  return sent;
}

describe("MediaUpload", () => {
  it("rejects an 11 MB image before any network call", () => {
    const xhr = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhr);
    render(<MediaUpload purpose="content" accept="both" onUploaded={vi.fn()} />);
    pick(fileOf("big.jpg", "image/jpeg", 11 * 1024 * 1024));
    expect(screen.getByText("Images must be 10 MB or smaller")).toBeTruthy();
    expect(requestUploadSignature).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it("rejects a 101 MB video and an unsupported type", () => {
    render(<MediaUpload purpose="content" accept="both" onUploaded={vi.fn()} />);
    pick(fileOf("big.mp4", "video/mp4", 101 * 1024 * 1024));
    expect(screen.getByText("Videos must be 100 MB or smaller")).toBeTruthy();
    pick(fileOf("doc.pdf", "application/pdf", 1000));
    expect(screen.getByText("Unsupported file type")).toBeTruthy();
    expect(requestUploadSignature).not.toHaveBeenCalled();
  });

  it("rejects a video when only images are accepted", () => {
    render(<MediaUpload purpose="content" accept="image" onUploaded={vi.fn()} />);
    pick(fileOf("clip.mp4", "video/mp4", 1000));
    expect(screen.getByText("Unsupported file type")).toBeTruthy();
  });

  it("signs, posts every signed param with the file, then registers", async () => {
    requestUploadSignature.mockResolvedValue({ ok: true, upload: { uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload", publicId: "clowork/w/content/abc", params: { signature: "s", api_key: "k", timestamp: "1" } } });
    registerUpload.mockResolvedValue({ ok: true, mediaId: "m1" });
    const sent = fakeXhr(200, { secure_url: "https://res.cloudinary.com/demo/image/upload/abc.jpg" });
    const onUploaded = vi.fn();
    const onBusyChange = vi.fn();
    render(<MediaUpload purpose="content" accept="both" onUploaded={onUploaded} onBusyChange={onBusyChange} />);
    const f = fileOf("a.png", "image/png", 1000);
    pick(f);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ id: "m1", url: "https://res.cloudinary.com/demo/image/upload/abc.jpg", type: "IMAGE" }));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(requestUploadSignature).toHaveBeenCalledWith("content", "image");
    expect(sent.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(sent.body?.get("signature")).toBe("s");
    expect(sent.body?.get("api_key")).toBe("k");
    expect(sent.body?.get("file")).toBe(f);
    expect(registerUpload).toHaveBeenCalledWith("clowork/w/content/abc", "IMAGE");
  });

  it("offers a retry when the upload fails", async () => {
    requestUploadSignature.mockResolvedValue({ ok: true, upload: { uploadUrl: "u", publicId: "p", params: {} } });
    fakeXhr(500, { error: { message: "nope" } });
    render(<MediaUpload purpose="content" accept="both" onUploaded={vi.fn()} />);
    pick(fileOf("a.png", "image/png", 1000));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(requestUploadSignature).toHaveBeenCalledTimes(2));
  });

  it("disables itself when media storage is not configured", async () => {
    requestUploadSignature.mockResolvedValue({ ok: false, code: "NOT_CONFIGURED", message: "Media storage is not configured" });
    render(<MediaUpload purpose="content" accept="both" onUploaded={vi.fn()} />);
    pick(fileOf("a.png", "image/png", 1000));
    expect(await screen.findByText("Media storage is not configured")).toBeTruthy();
    expect((screen.getByLabelText("Add media") as HTMLInputElement).disabled).toBe(true);
  });
});
