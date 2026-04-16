import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Sends an enrichment completion email to the given address with a sign-in link
 * that redirects to the scoring page after authentication. Call this after
 * enrichment finishes when the user chose the "notify me" path.
 *
 * The sign-in link is the only CTA — clicking it verifies the user's email and
 * grants a session, unifying the notify-me and email-gate activation paths.
 *
 * Non-fatal: callers should catch errors and log them rather than failing the run.
 */
export async function sendEnrichmentComplete(email: string, runId: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://scorestack.io'
  // Sign in first — results are revealed after authentication.
  // callbackUrl lands directly on the score page after sign-in.
  const signInUrl = `${baseUrl}/auth/signin?callbackUrl=${encodeURIComponent(`/run/${runId}/score`)}`

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@scorestack.io',
    to: email,
    subject: 'Your Scorestack results are ready',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111;">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;">Your results are ready</h2>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">
          Your enrichment run has finished. Sign in to view and score your contacts — and save scoring models for future runs.
        </p>
        <a href="${signInUrl}"
          style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:500;text-decoration:none;padding:10px 20px;border-radius:8px;">
          Sign in to view your results →
        </a>
        <p style="font-size:11px;color:#aaa;margin-top:24px;">
          We'll send a magic link to this address. No password needed.
        </p>
      </div>
    `,
  })
}
