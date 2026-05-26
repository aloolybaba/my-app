export const logger = {
  info(message, meta = {}) {
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  warn(message, meta = {}) {
    console.warn(JSON.stringify({ level: "warn", message, ...meta }));
  },
  error(message, error = undefined, meta = {}) {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        error: error?.stack || error?.message || error,
        ...meta
      })
    );
  }
};
