import "dotenv/config";

/** Configuração validada usada pelas camadas HTTP, banco de dados e tokens. */
export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  nodeEnv: string;
}

/** Lê o ambiente e encerra cedo quando faltam valores reais ou seguros. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  const jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (
    !databaseUrl ||
    !/^postgres(ql)?:\/\//i.test(databaseUrl) ||
    /CHANGE_ME|replace_with|example\.com/i.test(databaseUrl)
  ) {
    throw new Error("DATABASE_URL ausente ou com valor de exemplo.");
  }
  if (jwtSecret.length < 32 || /CHANGE_ME|replace_with|secret/i.test(jwtSecret)) {
    throw new Error(
      "JWT_SECRET deve conter ao menos 32 caracteres aleatórios e não pode ser um valor de exemplo.",
    );
  }
  const corsOrigins = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (env.NODE_ENV === "production" && corsOrigins.length === 0) {
    throw new Error("Configure CORS_ORIGIN com o domínio público do app em produção.");
  }
  for (const origin of corsOrigins) {
    try {
      const parsed = new URL(origin);
      if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin) throw new Error();
    } catch {
      throw new Error(`Origem CORS inválida: ${origin}`);
    }
  }
  return { databaseUrl, jwtSecret, corsOrigins, nodeEnv: env.NODE_ENV ?? "development" };
}

export const config = loadConfig();
