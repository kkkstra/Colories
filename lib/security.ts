export function redactSecret(secret: string): string {
  if (!secret) {
    return '';
  }
  if (secret.length <= 8) {
    return '••••••••';
  }
  return `${secret.slice(0, 3)}••••${secret.slice(-3)}`;
}

export function safeErrorMessage(error: unknown, secret?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  return secret ? raw.split(secret).join('[REDACTED]') : raw;
}

export function createLocalId(prefix = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
