
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let sdk: NodeSDK | null = null;

if (OTEL_ENDPOINT) {
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

  sdk = new NodeSDK({
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
}

export function initTelemetry(): void {
  if (!sdk) {
    console.log('[otel] No OTEL_EXPORTER_OTLP_ENDPOINT set — telemetry disabled');
    return;
  }
  try {
    sdk.start();
    console.log('[otel] OpenTelemetry SDK started');
  } catch (err) {
    console.warn('[otel] Failed to start OpenTelemetry SDK:', err);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    console.log('[otel] OpenTelemetry SDK shut down');
  } catch (err) {
    console.warn('[otel] Error shutting down OpenTelemetry:', err);
  }
}
