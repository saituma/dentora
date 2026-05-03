
import { z } from 'zod';

function normalizeGoogleClientId(value: string): string {
  const matches = value.match(/[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/g);
  if (!matches || matches.length === 0) {
    return value;
  }
  return matches[matches.length - 1];
}

function normalizeGoogleClientSecret(value: string): string {
  const matches = value.match(/GOCSPX-[A-Za-z0-9_-]+?(?=GOCSPX-|$)/g);
  if (!matches || matches.length === 0) {
    return value;
  }
  return matches[matches.length - 1];
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** When true, allow browser requests from any https://*.onrender.com origin (API still requires JWT). */
  CORS_ALLOW_ONRENDER: z.coerce.boolean().default(false),

  PLATFORM_ENV: z.enum(['local', 'ci', 'staging', 'production']).default('local'),
  PLATFORM_VERSION: z.string().default('0.1.0'),
  COST_MARGIN_PERCENT: z.coerce.number().min(0).max(100).default(30),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(20),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().min(1000).max(120000).default(15000),
  DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-ca', 'verify-full']).default('disable'),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_MAX_CONNECTIONS: z.coerce.number().min(1).max(500).default(50),
  REDIS_DISABLED: z.coerce.boolean().default(false),

  ENCRYPTION_KEY: z.string().length(64).default('0'.repeat(64)),

  JWT_SECRET: z.string().min(32).default('development-secret-change-in-production-min32chars'),
  JWT_ISSUER: z.string().default('dental-flow'),
  JWT_EXPIRY_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().default(7),

  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_API_KEY_SID: z.string().default(''),
  TWILIO_API_KEY_SECRET: z.string().default(''),
  TWILIO_TWIML_APP_SID: z.string().default(''),
  TWILIO_VERIFY_SERVICE_SID: z.string().default(''),
  TWILIO_WEBHOOK_BASE_URL: z.string().default('http://localhost:4000'),

  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  GOOGLE_AI_API_KEY: z.string().default(''),

  DEEPGRAM_API_KEY: z.string().default(''),
  ASSEMBLYAI_API_KEY: z.string().default(''),

  TTS_PROVIDER: z.enum(['elevenlabs', 'google-tts', 'openai']).default('elevenlabs'),
  ELEVENLABS_API_KEY: z.string().default(''),
  GOOGLE_TTS_API_KEY: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default('http://localhost:4000/api/integrations/google/calendar/oauth/callback'),
  GOOGLE_OAUTH_SUCCESS_REDIRECT: z.string().default('http://localhost:3000/onboarding/ai-chat'),
  GOOGLE_OAUTH_ERROR_REDIRECT: z.string().default('http://localhost:3000/onboarding/ai-chat'),
  GOOGLE_AUTH_REDIRECT_URI: z.string().default('http://localhost:4000/api/auth/google/callback'),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),

  R2_BUCKET: z.string().default(''),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  OTEL_EXPORTER_ENDPOINT: z.string().default(''),
  SENTRY_DSN: z.string().default(''),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_STARTER_PRICE_ID: z.string().default(''),
  STRIPE_GROWTH_PRICE_ID: z.string().default(''),
  STRIPE_PRO_PRICE_ID: z.string().default(''),
  CLIENT_URL: z.string().default('http://localhost:3000'),
});

function loadEnv() {
  if (typeof process.env.GOOGLE_CLIENT_ID === 'string') {
    process.env.GOOGLE_CLIENT_ID = normalizeGoogleClientId(process.env.GOOGLE_CLIENT_ID);
  }

  if (typeof process.env.GOOGLE_CLIENT_SECRET === 'string') {
    process.env.GOOGLE_CLIENT_SECRET = normalizeGoogleClientSecret(process.env.GOOGLE_CLIENT_SECRET);
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  if (result.data.NODE_ENV === 'production') {
    const fatal: string[] = [];
    if (result.data.JWT_SECRET === 'development-secret-change-in-production-min32chars') {
      fatal.push('JWT_SECRET is still set to the default development value');
    }
    if (result.data.ENCRYPTION_KEY === '0'.repeat(64)) {
      fatal.push('ENCRYPTION_KEY is still set to the default zero-fill value');
    }
    // DATABASE_URL must not point to localhost in production
    const dbUrl = result.data.DATABASE_URL.toLowerCase();
    if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
      fatal.push('DATABASE_URL points to localhost — use a remote database in production');
    }

    // Stripe must be configured in production
    if (!result.data.STRIPE_SECRET_KEY) {
      fatal.push('STRIPE_SECRET_KEY is not set');
    }

    // DATABASE_SSL_MODE must be require or stricter in production
    if (result.data.DATABASE_SSL_MODE === 'disable') {
      fatal.push('DATABASE_SSL_MODE must be "require", "verify-ca", or "verify-full" in production');
    }

    if (fatal.length > 0) {
      console.error('❌ Unsafe secrets in production:');
      fatal.forEach((msg) => console.error(`  - ${msg}`));
      process.exit(1);
    }

    // Non-fatal warnings for recommended services
    if (!result.data.SENTRY_DSN) {
      console.warn('⚠️  SENTRY_DSN is not set — error tracking will be disabled in production');
    }
    if (!result.data.SMTP_HOST) {
      console.warn('⚠️  SMTP_HOST is not set — transactional emails will fail in production');
    }
  }

  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
