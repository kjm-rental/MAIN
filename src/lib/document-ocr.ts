import "server-only";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { parseDocumentOcr, type OcrEvidence } from "./document-ocr-fields";
let active = false;
const unavailable = (reason: string): OcrEvidence => ({
  available: false,
  fields: {},
  warnings: [reason],
});
/** One OCR job per process at a time; hard time limit, local models, memory-only images. */
export async function recognizeDocument(
  image: Buffer,
  timeoutMs = 8000,
): Promise<OcrEvidence> {
  if (active || typeof createWorker !== "function")
    return unavailable("OCR is busy or unavailable; manual review required.");
  active = true;
  let worker: Worker | undefined;
  try {
    const lines = await new Promise<{ text: string; confidence: number }[]>(
      (resolve, reject) => {
        worker = new Worker(
          path.join(process.cwd(), "src/lib/document-ocr-worker.cjs"),
          { workerData: { image } },
        );
        const timeout = setTimeout(
          () => reject(new Error("OCR unavailable")),
          Math.max(100, Math.min(timeoutMs, 8000)),
        );
        worker.once("message", (message) => {
          clearTimeout(timeout);
          if (message.failed || !Array.isArray(message.lines))
            reject(new Error("OCR unavailable"));
          else resolve(message.lines);
        });
        worker.once("error", () => {
          clearTimeout(timeout);
          reject(new Error("OCR unavailable"));
        });
        worker.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("OCR unavailable"));
        });
      },
    );
    return parseDocumentOcr(lines);
  } catch {
    return unavailable("OCR could not safely finish; manual review required.");
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    active = false;
  }
}
