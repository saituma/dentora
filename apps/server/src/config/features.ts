
export const features = {
  providerFailover: process.env.FF_PROVIDER_FAILOVER === 'true',

  realtimeCallMonitoring: process.env.FF_REALTIME_CALL_MONITORING === 'true',

  costAnomalyDetection: process.env.FF_COST_ANOMALY_DETECTION === 'true',

  distributedTracing: process.env.FF_DISTRIBUTED_TRACING === 'true',

  twilioMediaStreams: process.env.FF_TWILIO_MEDIA_STREAMS === 'true',

  dynamicModelRouting: process.env.FF_DYNAMIC_MODEL_ROUTING === 'true',

  databaseRls: process.env.FF_DATABASE_RLS === 'true',

  aiConfigChat: process.env.FF_AI_CONFIG_CHAT === 'true',
} as const;

export type FeatureFlags = typeof features;
