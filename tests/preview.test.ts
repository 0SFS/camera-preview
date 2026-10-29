// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraPreview, type CameraPreview, type CameraPreviewFrame, type CameraPreviewOptions } from "../src/index";

const frame: CameraPreviewFrame = { width: 2, height: 1, rgba: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) };
const putImageData = vi.fn();
const previews: CameraPreview[] = [];
beforeEach(() => {
  vi.useFakeTimers(); putImageData.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  for (const preview of previews.splice(0)) preview.destroy();
  document.body.replaceChildren();
  vi.useRealTimers(); vi.restoreAllMocks();
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
function setup(readFrame = vi.fn(async () => frame), options: Pick<CameraPreviewOptions, "attachInteraction"> = {}) {
  const preview = createCameraPreview({ document, label: "FC7303", readFrame, ...options });
  previews.push(preview); document.body.append(preview.element);
  const canvas = preview.element.querySelector("canvas")!;
  return { preview, readFrame, canvas };
}

describe("optional camera preview", () => {
  it("starts inactive, preserves upright RGBA pixels and bounds its update rate", async () => {
    const { preview, readFrame, canvas } = setup();
    await vi.advanceTimersByTimeAsync(200);
    expect(readFrame).not.toHaveBeenCalled();
    preview.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(readFrame).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(2); expect(canvas.height).toBe(1);
    expect(putImageData.mock.calls[0]![0].data).toEqual(new Uint8ClampedArray(frame.rgba));
    expect(preview.element.querySelector('[role="status"]')?.textContent).toBe("Live");
    await vi.advanceTimersByTimeAsync(60);
    expect(readFrame).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(7);
    expect(readFrame).toHaveBeenCalledTimes(2);
    preview.setActive(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(readFrame).toHaveBeenCalledTimes(2);
  });

  it("serializes slow reads and ignores a stale read after hiding and reopening", async () => {
    const first = deferred<CameraPreviewFrame>();
    const readFrame = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(frame);
    const { preview } = setup(readFrame);
    preview.setActive(true); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(readFrame).toHaveBeenCalledOnce();
    preview.setActive(false); preview.setActive(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(readFrame).toHaveBeenCalledOnce();
    first.resolve(frame); await Promise.resolve();
    expect(putImageData).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(readFrame).toHaveBeenCalledTimes(2);
    expect(putImageData).toHaveBeenCalledOnce();
  });

  it("shows failures without retrying in a loop, then supports an explicit retry", async () => {
    const readFrame = vi.fn().mockRejectedValueOnce(new Error("WebGPU sensor unavailable.")).mockResolvedValue(frame);
    const { preview } = setup(readFrame);
    preview.setActive(true); await vi.advanceTimersByTimeAsync(0);
    expect(preview.element.querySelector('[role="alert"]')?.textContent).toBe("WebGPU sensor unavailable.");
    await vi.advanceTimersByTimeAsync(1000);
    expect(readFrame).toHaveBeenCalledOnce();
    preview.element.querySelector<HTMLButtonElement>('[aria-label="Retry camera preview"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(readFrame).toHaveBeenCalledTimes(2);
    expect(preview.element.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(true);
    expect(putImageData).toHaveBeenCalledOnce();
  });

  it("releases its canvas and ignores a read completed after destruction", async () => {
    const pending = deferred<CameraPreviewFrame>();
    const readFrame = vi.fn(() => pending.promise);
    const { preview, canvas } = setup(readFrame);
    preview.setActive(true); await vi.advanceTimersByTimeAsync(0);
    preview.destroy();
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    expect(preview.element.isConnected).toBe(false);
    pending.resolve(frame); await vi.advanceTimersByTimeAsync(1000);
    preview.setActive(true);
    expect(readFrame).toHaveBeenCalledOnce();
    expect(putImageData).not.toHaveBeenCalled();
  });

  it("binds host controls once and matches their lifetime to the visible preview", () => {
    const controls = { setActive: vi.fn(), destroy: vi.fn() };
    const attachInteraction = vi.fn(() => controls);
    const { preview, canvas } = setup(undefined, { attachInteraction });
    expect(attachInteraction).toHaveBeenCalledOnce();
    expect(attachInteraction).toHaveBeenCalledWith(canvas);
    expect(controls.setActive).not.toHaveBeenCalled();
    expect(canvas.classList.contains("osfs-camera-preview__image--interactive")).toBe(true);
    preview.setActive(true); preview.setActive(true);
    preview.setActive(false); preview.setActive(true);
    expect(controls.setActive.mock.calls).toEqual([[true], [false], [true]]);
    expect(attachInteraction).toHaveBeenCalledOnce();
    preview.destroy(); preview.destroy();
    expect(controls.destroy).toHaveBeenCalledOnce();
    preview.setActive(true);
    expect(controls.setActive).toHaveBeenCalledTimes(3);
  });

  it("releases its display even if injected control cleanup fails", () => {
    const { preview, canvas } = setup(undefined, {
      attachInteraction: () => ({ setActive() {}, destroy() { throw new Error("Input cleanup failed"); } }),
    });
    expect(() => preview.destroy()).toThrow("Input cleanup failed");
    expect(preview.element.isConnected).toBe(false);
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    expect(() => preview.destroy()).not.toThrow();
  });
});
