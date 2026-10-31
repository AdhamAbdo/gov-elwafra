// Reports only whether email delivery is configured (a boolean). No secret values are returned.
export async function GET() {
  return Response.json({ emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
}
