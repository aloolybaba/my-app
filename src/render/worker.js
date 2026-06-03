import { parentPort, workerData } from "node:worker_threads";
import { config } from "../config.js";
import { parseLitematic } from "./litematic.js";
import { renderIsometric } from "./isometric.js";
import {
  remoteRendererEnabled,
  renderWithRemoteRenderer
} from "./remoteRenderer.js";

try {
  let result = null;
  if (remoteRendererEnabled()) {
    try {
      result = await renderWithRemoteRenderer(
        workerData.inputPath,
        workerData.outputPath
      );
      parentPort.postMessage({ ok: true, result });
    } catch (error) {
      if (!config.renderAllowJsFallback) {
        throw error;
      }
      console.warn(
        `Minecraft renderer failed; falling back to JavaScript renderer: ${error.message}`
      );
    }
  }

  if (!result) {
    const schematic = await parseLitematic(workerData.inputPath);
    result = await renderIsometric(schematic, {
      outputPath: workerData.outputPath,
      minecraftVersion: workerData.minecraftVersion,
      textureRoot: workerData.textureRoot,
      autoView: true
    });
    parentPort.postMessage({ ok: true, result });
  }
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
