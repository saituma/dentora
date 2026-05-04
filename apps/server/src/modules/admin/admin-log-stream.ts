
import { EventEmitter } from 'events';

export interface LogEntry {
  level: number;
  time: string;
  msg: string;
  [key: string]: unknown;
}

const MAX_BUFFER_SIZE = 100;
const ringBuffer: LogEntry[] = [];

export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50);

export function pushLogEntry(entry: LogEntry): void {
  ringBuffer.push(entry);
  if (ringBuffer.length > MAX_BUFFER_SIZE) {
    ringBuffer.shift();
  }
  logEmitter.emit('log', entry);
}

export function getRecentLogs(): LogEntry[] {
  return [...ringBuffer];
}
