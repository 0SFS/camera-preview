import { createHelpTooltip, createIconButton } from "@foss-earth/ui/browser";
import type { CameraPreviewOptions, CameraPreview } from "./types";
export type { CameraPreviewOptions, CameraPreview, CameraPreviewFrame, CameraPreviewInteraction } from "./types";

const styles = `
.osfs-camera-preview{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.5rem;border:1px solid var(--foss-border,rgba(128,128,128,.3));border-radius:.65rem;min-width:0;width:100%;box-sizing:border-box}
.osfs-camera-preview__label{flex:1;min-width:5rem;font-size:.85rem}
.osfs-camera-preview__status{font-size:.75rem;opacity:.8}
.osfs-camera-preview__image{display:block;width:100%;height:auto;border-radius:.35rem;background:#080b10}
.osfs-camera-preview__image--interactive{touch-action:none;cursor:grab;user-select:none}
.osfs-camera-preview__image--interactive:active{cursor:grabbing}
.osfs-camera-preview__image--interactive[aria-disabled="true"]{cursor:default}
.osfs-camera-preview__error{width:100%;font-size:.8rem;overflow-wrap:anywhere;margin:0}
`;

/** A browser-only provider. It imports no renderer, aircraft, capture encoder or flight runtime. */
export function createCameraPreview(options: CameraPreviewOptions): CameraPreview {
  const { document } = options;
  const view = document.defaultView;
  if (!view) throw new Error("Camera preview requires a browser window.");
  const element = document.createElement("section");
  element.className = "osfs-camera-preview";
  element.setAttribute("aria-label", "Camera preview component");
  const style = document.createElement("style"); style.textContent = styles;
  const label = document.createElement("strong");
  label.className = "osfs-camera-preview__label";
  label.textContent = options.label;
  const status = document.createElement("span");
  status.className = "osfs-camera-preview__status";
  status.setAttribute("role", "status"); status.textContent = "Off";
  const retry = createIconButton(document, { icon: "reset", label: "Retry camera preview" });
  retry.hidden = true;
  const explanation = document.createElement("p");
  explanation.textContent = options.attachInteraction
    ? "Live view from the selected camera and gimbal. Drag or swipe with two fingers to aim the gimbal, using the same controls as the 360 image viewer. Pinch or use a mouse wheel to zoom this preview; still photos keep the camera's full field of view and resolution. Closing this tab stops preview rendering."
    : "Live view from the selected camera and gimbal. The preview preserves the sensor's field of view and aspect ratio. Closing this tab stops preview rendering; still photos retain the camera's full capture resolution.";
  const help = createHelpTooltip({ label: "Explain camera preview", content: explanation });
  // The self-contained mod has its own shared-UI bundle; keep its help id distinct
  // from the host's copy of the same factory.
  explanation.id = `osfs-camera-preview-help-${view.crypto.randomUUID()}`;
  help.button.setAttribute("aria-controls", explanation.id);
  const canvas = document.createElement("canvas");
  canvas.className = "osfs-camera-preview__image";
  canvas.setAttribute("aria-label", "Camera preview");
  canvas.setAttribute("role", "img");
  canvas.width = 4; canvas.height = 3;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) { help.destroy(); throw new Error("Camera preview display is unavailable."); }
  const error = document.createElement("p");
  error.className = "osfs-camera-preview__error";
  error.setAttribute("role", "alert"); error.hidden = true;
  element.append(style, label, status, retry, help.element, canvas, error);
  let interaction: ReturnType<NonNullable<CameraPreviewOptions["attachInteraction"]>> | undefined;
  try { interaction = options.attachInteraction?.(canvas); }
  catch (cause) { help.destroy(); element.remove(); throw cause; }
  if (interaction) {
    canvas.classList.add("osfs-camera-preview__image--interactive");
    canvas.title = "Drag or two-finger swipe to aim; pinch or mouse wheel to zoom preview.";
  }

  const requestedFps = options.maxFps ?? 15;
  const interval = 1000 / Math.min(15, Math.max(1, Number.isFinite(requestedFps) ? requestedFps : 15));
  let active = false;
  let destroyed = false;
  let failed = false;
  let reading = false;
  let generation = 0;
  let timer: number | null = null;
  const clearTimer = (): void => {
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
  };
  const schedule = (delay = 0): void => {
    if (!active || destroyed || failed || reading || timer !== null) return;
    timer = view.setTimeout(() => { timer = null; void draw(); }, delay);
  };
  const draw = async (): Promise<void> => {
    if (!active || destroyed || failed || reading) return;
    reading = true;
    const token = generation;
    const started = view.performance.now();
    try {
      const frame = await options.readFrame();
      if (destroyed || !active || token !== generation) return;
      if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0
        || frame.rgba.length !== frame.width * frame.height * 4) throw new Error("Camera preview received an invalid frame.");
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width; canvas.height = frame.height;
      }
      const image = context.createImageData(frame.width, frame.height);
      image.data.set(frame.rgba);
      context.putImageData(image, 0, 0);
      status.textContent = "Live";
    } catch (cause) {
      if (destroyed || !active || token !== generation) return;
      failed = true;
      status.textContent = "Unavailable";
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      error.hidden = false; retry.hidden = false;
    } finally {
      reading = false;
      schedule(token === generation ? Math.max(0, interval - (view.performance.now() - started)) : 0);
    }
  };
  const restart = (): void => {
    if (destroyed || !active) return;
    generation++;
    failed = false; error.hidden = true; retry.hidden = true;
    status.textContent = "Loading";
    clearTimer(); schedule();
  };
  retry.addEventListener("click", restart);
  return {
    element,
    setActive(on): void {
      if (destroyed || active === on) return;
      active = on;
      interaction?.setActive(on);
      if (on) restart();
      else {
        generation++; clearTimer(); help.close();
        status.textContent = "Paused";
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true; active = false; generation++; clearTimer();
      retry.removeEventListener("click", restart);
      help.destroy();
      try { interaction?.destroy(); }
      finally {
        canvas.width = canvas.height = 0;
        element.remove();
      }
    },
  };
}
