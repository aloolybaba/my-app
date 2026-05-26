export const logger = {
  info(message, meta = {}) {
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  warn(message, meta = {}) {
    console.warn(JSON.stringify({ level: "warn", message, ...meta }));
  },
  error(message, error = undefined, meta = {}) {
    const detail = error && (error.stack || error.message) ? (error.stack || error.message) : String(error || "");
    console.error("[error] " + message);
    if (detail) console.error(detail);
    if (Object.keys(meta).length > 0) {
      console.error(JSON.stringify(meta));
    }
  }
};
