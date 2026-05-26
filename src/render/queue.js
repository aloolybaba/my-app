import { Worker } from "node:worker_threads";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

export class RenderQueue {
  constructor() {
    this.queue = [];
    this.active = new Map();
  }

  enqueue(job) {
    this.queue.push(job);
    this.pump();
  }

  statusText() {
    return `Render queue: ${this.queue.length} waiting, ${this.active.size} active.`;
  }

  pump() {
    while (
      this.active.size < config.maxConcurrentRenderJobs &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();
      this.run(job);
    }
  }

  run(job) {
    const workerPath = path.join(process.cwd(), "src", "render", "worker.js");
    const worker = new Worker(workerPath, {
      workerData: {
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        minecraftVersion: config.minecraftVersion,
        textureRoot: config.textureRoot
      }
    });

    this.active.set(job.attachmentId, worker);
    logger.info("Render job started", { attachmentId: job.attachmentId });

    worker.once("message", async (message) => {
      this.active.delete(job.attachmentId);
      if (message.ok) {
        await job.onDone(message.result).catch((error) => {
          logger.error("Render completion handler failed", error);
        });
      } else {
        await job.onError(new Error(message.error)).catch((error) => {
          logger.error("Render error handler failed", error);
        });
      }
      this.pump();
    });

    worker.once("error", async (error) => {
      this.active.delete(job.attachmentId);
      await job.onError(error).catch((handlerError) => {
        logger.error("Render worker error handler failed", handlerError);
      });
      this.pump();
    });
  }
}
