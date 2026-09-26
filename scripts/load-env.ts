import { existsSync } from "node:fs";

/** Loads .env.local for CLI scripts (Next.js does this itself for the app). */
export function loadLocalEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

/** Host and database name only, so logs never contain credentials. */
export function describeDatabase(url: string): string {
  const { host, pathname } = new URL(url);
  return `${host}${pathname}`;
}
