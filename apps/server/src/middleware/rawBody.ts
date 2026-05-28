import type { IncomingMessage, ServerResponse } from 'node:http';

interface RawBodyRequest extends IncomingMessage {
  originalUrl?: string;
  rawBody?: string;
}

export function captureRawBodyForPmsWebhooks(
  req: IncomingMessage,
  _res: ServerResponse,
  buf: Buffer,
  encoding: BufferEncoding,
): void {
  const request = req as RawBodyRequest;
  const path = request.originalUrl ?? request.url ?? '';
  if (!path.startsWith('/api/pms/webhooks')) return;
  request.rawBody = buf.toString(encoding || 'utf8');
}
