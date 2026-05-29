import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { fetchCompanyByUrl } from '@/app/lib/linkedapi'

const PatchOrgSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  companyLinkedInUrl: z
    .string()
    .url()
    .refine((v) => v.includes('linkedin.com/company/'), {
      message: 'Must be a LinkedIn company page URL',
    })
    .nullable()
    .optional(),
})

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, companyLinkedInUrl: true, companyData: true },
  })

  if (!org) return NextResponse.json({ error: 'org_not_found' }, { status: 404 })

  return NextResponse.json({
    name: org.name,
    companyLinkedInUrl: org.companyLinkedInUrl,
    companyData: org.companyData,
  })
}

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
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.companyLinkedInUrl !== undefined
        ? {
            companyLinkedInUrl: parsed.data.companyLinkedInUrl,
            ...(parsed.data.companyLinkedInUrl === null ? { companyData: Prisma.DbNull } : {}),
          }
        : {}),
    },
    select: { name: true, companyLinkedInUrl: true },
  })

  // Fire-and-forget company enrichment — errors must not fail the response
  if (parsed.data.companyLinkedInUrl) {
    const urlToEnrich = parsed.data.companyLinkedInUrl
    void fetchCompanyByUrl(urlToEnrich)
      .then((data) => {
        if (data) {
          return prisma.organization.update({
            where: { id: orgId },
            data: { companyData: data as unknown as Prisma.InputJsonValue },
          })
        }
      })
      .catch((err) => console.warn('[org] company enrichment failed, skipping:', err))
  }

  return NextResponse.json({ name: org.name, companyLinkedInUrl: org.companyLinkedInUrl })
}
