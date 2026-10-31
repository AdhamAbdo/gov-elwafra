export type EmailMessage = { to: string; subject: string; text: string };
export type EmailResult = { outcome: "accepted" | "rejected" | "error"; providerId?: string; response: string };
export interface EmailProvider { send(message: EmailMessage): Promise<EmailResult> }

/** Resend HTTP API adapter. "accepted" means the provider queued the message; delivery is NOT confirmed. */
class ResendProvider implements EmailProvider {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch) {}
  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const res = await this.fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }) });
      const raw = await res.text();
      if (!res.ok) return { outcome: res.status >= 500 || res.status === 429 ? "error" : "rejected", response: `HTTP ${res.status}: ${raw.slice(0, 300)}` };
      let id: string | undefined; try { id = (JSON.parse(raw) as { id?: string }).id; } catch { /* response without JSON id */ }
      return { outcome: "accepted", providerId: id, response: `HTTP ${res.status}` };
    } catch (error) { return { outcome: "error", response: error instanceof Error ? error.message : String(error) }; }
  }
}

/** Returns null when the provider is not configured, so callers can record "skipped_unconfigured" instead of faking a send. */
export function createEmailProvider(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): EmailProvider | null {
  return env.RESEND_API_KEY && env.EMAIL_FROM ? new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM, fetchImpl) : null;
}
