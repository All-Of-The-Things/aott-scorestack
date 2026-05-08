import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { encryptCredential } from '@/app/lib/credentials'
import { sendMessage } from '@/app/lib/connectsafely'

function isPro(plan: string | undefined) {
  return plan === 'pro' || plan === 'enterprise'
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId: session.user.orgId },
    select: {
      connectSafelyApiKey: true,
      connectSafelyVerifiedAt: true,
      connectSafelyLastError: true,
    },
  })

  return NextResponse.json({
    connectSafelyConnected: !!integration?.connectSafelyApiKey,
    connectSafelyVerifiedAt: integration?.connectSafelyVerifiedAt ?? null,
    connectSafelyLastError: integration?.connectSafelyLastError ?? null,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'admin_required' }, { status: 403 })
  if (!isPro(session.user.plan)) return NextResponse.json({ error: 'pro_required' }, { status: 403 })

  const body = await req.json() as { connectSafelyApiKey?: string }
  const { connectSafelyApiKey } = body
  if (!connectSafelyApiKey?.trim()) {
    return NextResponse.json({ error: 'connectSafelyApiKey required' }, { status: 400 })
  }

  // Validate by attempting a real send to a clearly-invalid URL — we expect a send_failed or
  // auth error back, but a successful response also means the key is valid.
  // We only need to distinguish auth_failed (bad key) from everything else (key is OK).
  const validation = await sendMessage('https://www.linkedin.com/in/__validation_probe__', 'probe', connectSafelyApiKey.trim())
  if (!validation.success && validation.errorCode === 'auth_failed') {
    return NextResponse.json(
      { error: 'invalid_credential', detail: validation.error },
      { status: 400 }
    )
  }

  const encrypted = encryptCredential(connectSafelyApiKey.trim())
  const now = new Date()

  await prisma.orgIntegration.upsert({
    where: { orgId: session.user.orgId },
    create: {
      orgId: session.user.orgId,
      linkedApiToken: '',
      linkedApiIdToken: '',
      connectSafelyApiKey: encrypted,
      connectSafelyVerifiedAt: now,
      connectSafelyLastError: null,
    },
    update: {
      connectSafelyApiKey: encrypted,
      connectSafelyVerifiedAt: now,
      connectSafelyLastError: null,
    },
  })

  return NextResponse.json({ connected: true, verifiedAt: now })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'admin_required' }, { status: 403 })
  if (!isPro(session.user.plan)) return NextResponse.json({ error: 'pro_required' }, { status: 403 })

  await prisma.orgIntegration.updateMany({
    where: { orgId: session.user.orgId },
    data: {
      connectSafelyApiKey: null,
      connectSafelyVerifiedAt: null,
      connectSafelyLastError: null,
    },
  })

  return NextResponse.json({ connected: false })
}
