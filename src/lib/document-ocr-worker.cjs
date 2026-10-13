/* eslint-disable @typescript-eslint/no-require-imports -- Isolated native Node OCR worker. */
// Private, ephemeral Node worker. Never log OCR text or write document images to disk.
const { parentPort, workerData } = require("node:worker_threads");
const { createWorker, OEM, PSM } = require("tesseract.js");
const { langPath } = require("@tesseract.js-data/eng");
(async () => {
  let worker;
  try {
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      langPath,
      gzip: true,
      cacheMethod: "none",
      logger: () => {},
      errorHandler: () => {},
      logging: false,
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(
      Buffer.from(workerData.image),
      {},
      { text: false, blocks: true },
    );
    const lines = (data.blocks || []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          text: line.text,
          confidence: Math.min(
            line.confidence,
            ...line.words.map((word) => word.confidence),
          ),
        })),
      ),
    );
    parentPort.postMessage({ lines });
  } catch {
    parentPort.postMessage({ failed: true });
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
})();
