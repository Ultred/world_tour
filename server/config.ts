import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  /** The streamer's TikTok @handle to watch — no login needed for reading a public LIVE.
   * Optional: leave unset and connect from the dev panel instead (POST /api/connect). */
  TIKTOK_USERNAME: z.string().min(1).optional(),
  /** Optional — raises the free Euler Stream rate limit. Not needed to get started. */
  EULER_API_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
});

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
