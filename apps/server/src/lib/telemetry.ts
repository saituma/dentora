
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

const resourceAttributes = {
  [ATTR_SERVICE_NAME]: 'dental-flow-api',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
};

const traceExporter = new OTLPTraceExporter({
  url: `${OTEL_ENDPOINT}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${OTEL_ENDPOINT}/v1/metrics`,
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 30_000,
});

const sdk = new NodeSDK({
  serviceName: 'dental-flow-api',
  traceExporter,
  metricReader,
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (req) => {
        return req.url === '/api/health' || req.url === '/api/health/ready';
      },
    }),
    new ExpressInstrumentation(),
  ],
});

export function initTelemetry(): void {
  try {
    sdk.start();
    console.log('[otel] OpenTelemetry SDK started');
  } catch (err) {
    console.warn('[otel] Failed to start OpenTelemetry SDK:', err);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  try {
    await sdk.shutdown();
    console.log('[otel] OpenTelemetry SDK shut down');
  } catch (err) {
    console.warn('[otel] Error shutting down OpenTelemetry:', err);
  }
}
