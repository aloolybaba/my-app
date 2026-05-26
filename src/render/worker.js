import { parentPort, workerData } from "node:worker_threads";
import { parseLitematic } from "./litematic.js";
import { renderIsometric } from "./isometric.js";

try {
  const schematic = await parseLitematic(workerData.inputPath);
  const result = await renderIsometric(schematic, {
    outputPath: workerData.outputPath,
    minecraftVersion: workerData.minecraftVersion,
    textureRoot: workerData.textureRoot
  });
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
