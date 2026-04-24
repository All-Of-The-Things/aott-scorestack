import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

const resend = new Resend(process.env.RESEND_API_KEY)

const Schema = z.object({
  email:   z.string().email(),
  message: z.string().max(2000).default(''),
})

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  const { email, message } = parsed.data
  const session = await auth()

  await prisma.enterpriseInquiry.create({
    data: {
      userId:  session?.user.id ?? null,
      email,
      message,
    },
  })

  const to = process.env.RESEND_FROM_EMAIL ?? 'hello@scorestack.io'

  try {
    await resend.emails.send({
      from:    to,
      to,
      replyTo: email,
      subject: 'Enterprise plan inquiry — ScoreStack',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111;">
          <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;">New enterprise inquiry</h2>
          <p style="font-size:14px;color:#555;margin:0 0 4px;"><strong>From:</strong> ${email}</p>
          ${message ? `<p style="font-size:14px;color:#333;margin:16px 0 0;white-space:pre-wrap;">${message}</p>` : ''}
        </div>
      `,
    })
  } catch (err) {
    console.error('[inquiries/enterprise] resend error', err)
  }

  return NextResponse.json({ success: true })
}
