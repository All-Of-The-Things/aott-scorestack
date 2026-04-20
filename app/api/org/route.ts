import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

const PatchOrgSchema = z.object({
  name: z.string().min(1).max(80),
})

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })
  }

  const body = await req.json()
  const parsed = PatchOrgSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { name: parsed.data.name },
    select: { name: true },
  })

  return NextResponse.json({ name: org.name })
}
