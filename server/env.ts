export interface ServerEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  geminiApiKey: string;
  geminiModel: string;
  certificateSigningSecret: string;
  allowedOrigins: string[];
  codeExecutionUrl: string;
  codeExecutionToken: string;
  aiDailyQuota: number;
  nodeEnv: string;
}

const clean = (v: string | undefined) => (v ?? '').trim();

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const allowedRaw = clean(source.ALLOWED_ORIGINS);
  const allowedOrigins = allowedRaw
    ? allowedRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000'];
  const quota = Number.parseInt(clean(source.AI_DAILY_QUOTA) || '40', 10);
  return {
    supabaseUrl: clean(source.SUPABASE_URL) || clean(source.VITE_SUPABASE_URL),
    supabasePublishableKey: clean(source.SUPABASE_PUBLISHABLE_KEY) || clean(source.VITE_SUPABASE_PUBLISHABLE_KEY),
    supabaseSecretKey: clean(source.SUPABASE_SECRET_KEY) || clean(source.SUPABASE_SERVICE_ROLE_KEY),
    geminiApiKey: clean(source.GEMINI_API_KEY),
    geminiModel: clean(source.GEMINI_MODEL) || 'gemini-2.5-flash',
    certificateSigningSecret: clean(source.CERTIFICATE_SIGNING_SECRET),
    allowedOrigins,
    codeExecutionUrl: clean(source.CODE_EXECUTION_URL),
    codeExecutionToken: clean(source.CODE_EXECUTION_TOKEN),
    aiDailyQuota: Number.isFinite(quota) && quota > 0 ? Math.min(quota, 500) : 40,
    nodeEnv: clean(source.NODE_ENV) || 'development',
  };
}

export function envCapabilities(env: ServerEnv) {
  return {
    supabaseConfigured: Boolean(env.supabaseUrl && env.supabasePublishableKey && env.supabaseSecretKey),
    geminiConfigured: Boolean(env.geminiApiKey),
    certificateSigningConfigured: env.certificateSigningSecret.length >= 32,
    codeExecutionConfigured: Boolean(env.codeExecutionUrl),
  };
}
