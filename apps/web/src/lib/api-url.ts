/** Resolve the NestJS API base URL from env, with dev defaults. */
export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    `http://localhost:${process.env.API_PORT ?? 4000}`
  );
}
