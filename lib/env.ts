type AdminUser = {
  username: string;
  password: string;
};

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  return process.env[name];
}

export function getAdminUser(): AdminUser {
  const raw = getEnv("ADMIN_USER_JSON");
  const parsed = JSON.parse(raw) as Partial<AdminUser>;
  if (!parsed.username || !parsed.password) {
    throw new Error("ADMIN_USER_JSON must include username and password.");
  }
  return { username: parsed.username, password: parsed.password };
}
