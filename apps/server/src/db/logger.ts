import { createLogger, format, transports } from "winston";

const logFormat = format.printf(({ level, message, timestamp, stack }) => {
  if (stack) {
    return `${timestamp} ${level}: ${stack}`;
  }

  return `${timestamp} ${level}: ${message}`;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "http",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.splat(),
    format.colorize({ all: true }),
    logFormat
  ),
  transports: [new transports.Console()]
});
