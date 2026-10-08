export interface Mailer {
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 8000;

let warned = false;

/** Resend over plain HTTP (no SDK). Without RESEND_API_KEY and EMAIL_FROM it returns a no-op mailer. */
export function createMailerFromEnv(env: Env = process.env, fetchImpl: FetchLike = fetch as FetchLike, timeoutMs: number = TIMEOUT_MS): Mailer {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!key || !from) {
    return {
      async send() {
        if (!warned) {
          warned = true;
          console.warn("[mailer] RESEND_API_KEY/EMAIL_FROM not set; email sending is disabled");
        }
      },
    };
  }
  return {
    async send({ to, subject, text }) {
      const res = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    },
  };
}
