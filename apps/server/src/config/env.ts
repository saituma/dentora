import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}, z.boolean());

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
  /** Cookie SameSite attribute. Use 'none' when frontend and API are on different domains (requires COOKIE_SECURE=true). */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Cookie Secure flag. Must be true when COOKIE_SAMESITE=none (browsers reject SameSite=None without Secure). */
  COOKIE_SECURE: z.coerce.boolean().default(false),

  PLATFORM_ENV: z.enum(['local', 'ci', 'staging', 'production']).default('local'),
  PLATFORM_VERSION: z.string().default('0.1.0'),
  COST_MARGIN_PERCENT: z.coerce.number().min(0).max(100).default(30),

  DATABASE_URL: z.string().url(),
  DATABASE_REPLICA_URL: z.string().url().optional(), // read replica — falls back to primary if unset
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(20),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().min(1000).max(120000).default(15000),
  DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-ca', 'verify-full']).default('disable'),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_MAX_CONNECTIONS: z.coerce.number().min(1).max(500).default(50),
  REDIS_DISABLED: booleanFromString.default(false),

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
  // ISO 3166-1 alpha-2 country code for auto-purchasing phone numbers on signup.
  // Defaults to GB (UK). Change to US, AU, etc. if you expand to other markets.
  TWILIO_NUMBER_COUNTRY: z.string().default('GB'),
  // Twilio address SID required for purchasing numbers in countries that mandate a registered address (e.g. UK).
  TWILIO_ADDRESS_SID: z.string().optional(),
  // Twilio regulatory bundle SID required for purchasing numbers in countries that require compliance bundles (e.g. UK local numbers).
  TWILIO_BUNDLE_SID: z.string().optional(),

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
  GOOGLE_OAUTH_REDIRECT_URI: z
    .string()
    .default('http://localhost:4000/api/integrations/google/calendar/oauth/callback'),
  GOOGLE_OAUTH_SUCCESS_REDIRECT: z.string().default('http://localhost:3000/onboarding/ai-chat'),
  GOOGLE_OAUTH_ERROR_REDIRECT: z.string().default('http://localhost:3000/onboarding/ai-chat'),
  GOOGLE_AUTH_REDIRECT_URI: z.string().default('http://localhost:4000/api/auth/google/callback'),

  ENABLE_DENTALLY: booleanFromString.default(false),
  ENABLE_SOE_EXACT: booleanFromString.default(false),
  ENABLE_CS_R4_PLUS: booleanFromString.default(false),
  DENTALLY_API_BASE_URL: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim()
        ? value
        : process.env.DENTALLY_BASE_URL || undefined,
    z.string().url().default('https://api.dentally.co'),
  ),
  DENTALLY_SANDBOX_MODE: booleanFromString.default(true),
  DENTALLY_VERIFICATION_ENABLED: booleanFromString.default(false),
  DENTALLY_ALLOW_SANDBOX_WRITES: booleanFromString.default(false),
  DENTALLY_CONTROLLED_PILOT: booleanFromString.default(false),
  DENTALLY_PILOT_TENANT_IDS: z.string().default(''),
  DENTALLY_PILOT_INTEGRATION_IDS: z.string().default(''),
  DENTALLY_APPOINTMENT_PATH: z.string().default('/appointments'),
  DENTALLY_PATIENT_PATH: z.string().default('/patients'),
  DENTALLY_CLINICIAN_PATH: z.string().default('/practitioners'),
  DENTALLY_ROOM_PATH: z.string().default('/sites'),
  DENTALLY_WEBHOOK_PATH: z.string().default('/webhooks'),
  DENTALLY_AUTH_PATH: z.string().default('/user'),
  DENTALLY_WEBHOOK_SIGNATURE_HEADER: z.string().default('x-dentally-signature'),
  DENTALLY_WEBHOOK_TIMESTAMP_HEADER: z.string().default('x-dentally-timestamp'),
  DENTALLY_WEBHOOK_REPLAY_WINDOW_SECONDS: z.coerce.number().min(1).max(3600).default(300),
  DENTALLY_REQUEST_TIMEOUT_MS: z.coerce.number().min(500).max(60000).default(15000),
  DENTALLY_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .preprocess((v) => v === true || v === 'true' || v === '1', z.boolean())
    .default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),

  R2_BUCKET: z.string().default(''),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_ALERT_CHAT_ID: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  OTEL_EXPORTER_ENDPOINT: z.string().default(''),
  SENTRY_DSN: z.string().default(''),

  CLIENT_URL: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

function parseCsvList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isUuidList(value: string): boolean {
  return parseCsvList(value).every((item) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item),
  );
}

function isDentallySandboxBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.sandbox.dentally.co';
  } catch {
    return false;
  }
}

export function getDentallyEnvFatalErrors(
  config: Pick<
    Env,
    | 'ENABLE_DENTALLY'
    | 'DENTALLY_VERIFICATION_ENABLED'
    | 'DENTALLY_SANDBOX_MODE'
    | 'DENTALLY_ALLOW_SANDBOX_WRITES'
    | 'DENTALLY_API_BASE_URL'
    | 'DENTALLY_CONTROLLED_PILOT'
    | 'DENTALLY_PILOT_TENANT_IDS'
    | 'DENTALLY_PILOT_INTEGRATION_IDS'
  >,
): string[] {
  const fatal: string[] = [];

  if (config.DENTALLY_ALLOW_SANDBOX_WRITES) {
    if (!config.ENABLE_DENTALLY) {
      fatal.push('DENTALLY_ALLOW_SANDBOX_WRITES=true requires ENABLE_DENTALLY=true');
    }
    if (!config.DENTALLY_VERIFICATION_ENABLED) {
      fatal.push('DENTALLY_ALLOW_SANDBOX_WRITES=true requires DENTALLY_VERIFICATION_ENABLED=true');
    }
    if (config.DENTALLY_SANDBOX_MODE) {
      fatal.push('DENTALLY_ALLOW_SANDBOX_WRITES=true requires DENTALLY_SANDBOX_MODE=false');
    }
    if (!isDentallySandboxBaseUrl(config.DENTALLY_API_BASE_URL)) {
      fatal.push('DENTALLY_ALLOW_SANDBOX_WRITES=true requires Dentally sandbox API base URL');
    }
  }

  if (config.DENTALLY_CONTROLLED_PILOT) {
    if (!config.ENABLE_DENTALLY) {
      fatal.push('DENTALLY_CONTROLLED_PILOT=true requires ENABLE_DENTALLY=true');
    }
    if (parseCsvList(config.DENTALLY_PILOT_TENANT_IDS).length === 0) {
      fatal.push('DENTALLY_CONTROLLED_PILOT=true requires DENTALLY_PILOT_TENANT_IDS');
    }
    if (parseCsvList(config.DENTALLY_PILOT_INTEGRATION_IDS).length === 0) {
      fatal.push('DENTALLY_CONTROLLED_PILOT=true requires DENTALLY_PILOT_INTEGRATION_IDS');
    }
  }

  if (config.DENTALLY_PILOT_TENANT_IDS && !isUuidList(config.DENTALLY_PILOT_TENANT_IDS)) {
    fatal.push('DENTALLY_PILOT_TENANT_IDS must be a comma-separated UUID list');
  }
  if (config.DENTALLY_PILOT_INTEGRATION_IDS && !isUuidList(config.DENTALLY_PILOT_INTEGRATION_IDS)) {
    fatal.push('DENTALLY_PILOT_INTEGRATION_IDS must be a comma-separated UUID list');
  }

  return fatal;
}

export function isDefaultOrLocalRedisUrl(redisUrl: string): boolean {
  const normalized = redisUrl.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1') {
    return true;
  }

  try {
    const parsed = new URL(redisUrl.includes('://') ? redisUrl : `redis://${redisUrl}`);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return normalized.includes('localhost') || normalized.includes('127.0.0.1');
  }
}

export function getProductionEnvFatalErrors(
  config: Pick<
    Env,
    | 'NODE_ENV'
    | 'JWT_SECRET'
    | 'ENCRYPTION_KEY'
    | 'DATABASE_URL'
    | 'DATABASE_SSL_MODE'
    | 'REDIS_DISABLED'
    | 'REDIS_URL'
  >,
): string[] {
  if (config.NODE_ENV !== 'production') {
    return [];
  }

  const fatal: string[] = [];
  if (config.JWT_SECRET === 'development-secret-change-in-production-min32chars') {
    fatal.push('JWT_SECRET is still set to the default development value');
  }
  if (config.ENCRYPTION_KEY === '0'.repeat(64)) {
    fatal.push('ENCRYPTION_KEY is still set to the default zero-fill value');
  }
  const dbUrl = config.DATABASE_URL.toLowerCase();
  if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
    fatal.push('DATABASE_URL points to localhost — use a remote database in production');
  }
  if (config.DATABASE_SSL_MODE === 'disable') {
    fatal.push('DATABASE_SSL_MODE must be "require", "verify-ca", or "verify-full" in production');
  }
  if (config.REDIS_DISABLED) {
    fatal.push('REDIS_DISABLED must not be true in production');
  }
  if (isDefaultOrLocalRedisUrl(config.REDIS_URL)) {
    fatal.push('REDIS_URL must point to a remote Redis instance in production');
  }

  return fatal;
}

export function shouldFailStartupOnRedisError(nodeEnv: Env['NODE_ENV']): boolean {
  return nodeEnv === 'production';
}

function loadEnv() {
  if (typeof process.env.GOOGLE_CLIENT_ID === 'string') {
    process.env.GOOGLE_CLIENT_ID = normalizeGoogleClientId(process.env.GOOGLE_CLIENT_ID);
  }

  if (typeof process.env.GOOGLE_CLIENT_SECRET === 'string') {
    process.env.GOOGLE_CLIENT_SECRET = normalizeGoogleClientSecret(
      process.env.GOOGLE_CLIENT_SECRET,
    );
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  if (result.data.COOKIE_SAMESITE === 'none' && !result.data.COOKIE_SECURE) {
    console.error(
      '❌ COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject SameSite=None without Secure)',
    );
    process.exit(1);
  }

  const dentallyFatal = getDentallyEnvFatalErrors(result.data);
  if (dentallyFatal.length > 0) {
    console.error('❌ Unsafe Dentally environment configuration:');
    dentallyFatal.forEach((msg) => console.error(`  - ${msg}`));
    process.exit(1);
  }

  if (result.data.NODE_ENV === 'production') {
    const fatal = getProductionEnvFatalErrors(result.data);

    if (fatal.length > 0) {
      console.error('❌ Unsafe production environment configuration:');
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
    if (!result.data.TELEGRAM_BOT_TOKEN || !result.data.TELEGRAM_ALERT_CHAT_ID) {
      console.warn(
        '⚠️  TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID not set — ops alerts will be disabled',
      );
    }
    const webhookUrl = result.data.TWILIO_WEBHOOK_BASE_URL.toLowerCase();
    if (
      webhookUrl.includes('localhost') ||
      webhookUrl.includes('127.0.0.1') ||
      webhookUrl.includes('ngrok')
    ) {
      console.warn(
        '⚠️  TWILIO_WEBHOOK_BASE_URL points to a local/tunnel address — Twilio calls will fail in production',
      );
    }
  }

  return result.data;
}

export const env = loadEnv();
