import { z } from "zod";

const beatSuccess = z
  .object({
    urlContains: z.string().optional(),
    titleContains: z.string().optional(),
    visibleText: z.string().optional(),
    headingContains: z.string().optional(),
    elementState: z.string().optional(),
  })
  .refine(
    (s) =>
      Boolean(
        s.urlContains ||
          s.titleContains ||
          s.visibleText ||
          s.headingContains ||
          s.elementState,
      ),
    { message: "Each beat needs at least one success checkpoint" },
  );

export const beatSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  action: z.string().min(1),
  where: z.string().optional(),
  targetText: z.string().optional(),
  success: beatSuccess,
  narration: z.string().min(1),
  waitAfterMs: z.number().int().nonnegative().optional(),
  optional: z.boolean().optional(),
});

export const jobInputSchema = z.object({
  website_url: z
    .string()
    .url()
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
      message: "website_url must be http(s)",
    })
    .refine((u) => !u.toLowerCase().startsWith("javascript:"), {
      message: "javascript: URLs are not allowed",
    }),
  script: z.string().min(1),
  walkthrough: z.array(z.string().min(1).max(240)).max(12).optional(),
  beats: z.array(beatSchema).max(20).optional(),
  product_name: z.string().optional(),
  credentials: z
    .object({
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
  voice: z
    .object({
      engine: z.enum(["say", "edge-tts", "piper"]).optional(),
      language: z.string().optional(),
      rate: z.number().optional(),
    })
    .optional(),
  viewport: z.enum(["1440x900", "1920x1080"]).optional(),
  headless: z.boolean().optional(),
  require_script_confirm: z.boolean().optional(),
  i_have_right_to_record: z.boolean().optional(),
});

export const createJobBodySchema = z.object({
  mode: z.literal("kane").default("kane"),
  input: jobInputSchema,
  parent_job_id: z.string().uuid().optional(),
});

export function sanitizeInputForDb(input: z.infer<typeof jobInputSchema>) {
  const copy = structuredClone(input);
  if (copy.credentials) {
    copy.credentials = {
      username: copy.credentials.username ? "[redacted]" : undefined,
      password: copy.credentials.password ? "[redacted]" : undefined,
    };
  }
  return {
    stored: {
      ...copy,
      credentialsPresent: Boolean(
        input.credentials?.username || input.credentials?.password,
      ),
    },
    secrets: input.credentials,
  };
}

export function evaluateSuccess(
  page: { url: string; title: string; text: string },
  success: z.infer<typeof beatSuccess>,
): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let passed = true;
  if (success.urlContains) {
    const ok = page.url.toLowerCase().includes(success.urlContains.toLowerCase());
    details.push(`urlContains ${success.urlContains}: ${ok}`);
    passed = passed && ok;
  }
  if (success.titleContains) {
    const ok = page.title.toLowerCase().includes(success.titleContains.toLowerCase());
    details.push(`titleContains ${success.titleContains}: ${ok}`);
    passed = passed && ok;
  }
  if (success.visibleText) {
    const ok = page.text.toLowerCase().includes(success.visibleText.toLowerCase());
    details.push(`visibleText ${success.visibleText}: ${ok}`);
    passed = passed && ok;
  }
  if (success.headingContains) {
    const ok = page.text.toLowerCase().includes(success.headingContains.toLowerCase());
    details.push(`headingContains ${success.headingContains}: ${ok}`);
    passed = passed && ok;
  }
  return { passed, details };
}
