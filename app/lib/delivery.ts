import { getClient } from './linkedapi'
import { sendMessage as csSendMessage } from './connectsafely'
import { getOrgConnectSafelyKey } from './credentials'
import prisma from './prisma'
import { sendDeliveryComplete, sendByokCredentialError } from './notify'

function resolveDelay(useConnectSafely: boolean): number {
  const fallback = process.env.DELIVERY_DELAY_MS
  if (useConnectSafely) {
    return parseInt(process.env.CONNECT_SAFELY_DELIVERY_DELAY_MS ?? fallback ?? '10000', 10)
  }
  return parseInt(process.env.LINKED_API_DELIVERY_DELAY_MS ?? fallback ?? '3000', 10)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function processDeliveryJob(jobId: string, notifyEmail: string): Promise<void> {
  const job = await prisma.deliveryJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      messages: {
        include: {
          runResult: { select: { linkedinUrl: true, enrichedData: true } },
        },
      },
    },
  })

  const useConnectSafely = process.env.CONNECT_SAFELY_DELIVERY_ENABLED === 'true'

  // Resolve delivery identity: BYOK key takes precedence over platform credential
  const orgKey = useConnectSafely ? await getOrgConnectSafelyKey(job.orgId) : null
  const deliveryIdentity = orgKey ? 'byok' : 'platform_agent'

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date(), deliveryIdentity },
  })

  const client = useConnectSafely ? null : getClient()
  const deliveryDelayMs = resolveDelay(useConnectSafely)
  let sentCount = 0
  let failedCount = 0

  const testMode = useConnectSafely
    ? process.env.CONNECT_SAFELY_TEST_DELIVERY === 'true'
    : process.env.LINKED_API_TEST_DELIVERY === 'true'
  const testProfileUrl = useConnectSafely
    ? process.env.CONNECT_SAFELY_TEST_DELIVERY_PROFILE
    : process.env.LINKED_API_TEST_DELIVERY_PROFILE

  if (testMode && !testProfileUrl) {
    throw new Error(
      useConnectSafely
        ? 'CONNECT_SAFELY_TEST_DELIVERY is enabled but CONNECT_SAFELY_TEST_DELIVERY_PROFILE is not set'
        : 'LINKED_API_TEST_DELIVERY is enabled but LINKED_API_TEST_DELIVERY_PROFILE is not set'
    )
  }

  try {
    for (let i = 0; i < job.messages.length; i++) {
      const msg = job.messages[i]
      const intendedRecipient = msg.runResult.linkedinUrl
      const enriched = msg.runResult.enrichedData as Record<string, unknown> | null
      const contactName = (enriched?.full_name as string | null | undefined) ?? intendedRecipient
      const personUrl = testMode ? testProfileUrl! : intendedRecipient
      const text = testMode
        ? `Test message for: ${contactName}\nMessage: ${msg.editedBody ?? msg.body}\nProfile: ${intendedRecipient}`
        : (msg.editedBody ?? msg.body)

      try {
        let success: boolean
        let errorMsg: string | undefined

        if (useConnectSafely) {
          const result = await csSendMessage(personUrl, text, orgKey ?? undefined)

          if (!result.success && (result.errorCode === 'auth_failed' || result.errorCode === 'account_disconnected')) {
            // Credential error is non-retryable and affects the whole account — abort job immediately
            const now = new Date()
            await prisma.$transaction([
              prisma.deliveryJob.update({
                where: { id: jobId },
                data: { status: 'failed', failureCode: result.errorCode, completedAt: now },
              }),
              prisma.generatedMessage.updateMany({
                where: { deliveryJobId: jobId, deliveryStatus: 'pending' },
                data: { deliveryStatus: 'failed' },
              }),
              ...(deliveryIdentity === 'byok'
                ? [prisma.orgIntegration.update({
                    where: { orgId: job.orgId },
                    data: { connectSafelyLastError: result.error },
                  })]
                : []),
            ])
            try {
              await sendByokCredentialError(notifyEmail, jobId, result.errorCode)
            } catch {
              // non-fatal
            }
            return
          }

          success = result.success
          errorMsg = result.success ? undefined : result.error
        } else {
          const workflowId = await client!.sendMessage.execute({ personUrl, text })
          const res = await client!.sendMessage.result(workflowId)
          success = res.errors.length === 0
        }

        if (success) {
          await prisma.generatedMessage.update({
            where: { id: msg.id },
            data: { deliveryStatus: 'sent', sentAt: new Date() },
          })
          sentCount++
          await prisma.deliveryJob.update({
            where: { id: jobId },
            data: { sentCount },
          })
        } else {
          await prisma.generatedMessage.update({
            where: { id: msg.id },
            data: { deliveryStatus: 'failed' },
          })
          failedCount++
          await prisma.deliveryJob.update({
            where: { id: jobId },
            data: { failedCount },
          })
          if (errorMsg) console.error(`[delivery] message ${msg.id} failed: ${errorMsg}`)
        }
      } catch {
        await prisma.generatedMessage.update({
          where: { id: msg.id },
          data: { deliveryStatus: 'failed' },
        })
        failedCount++
        await prisma.deliveryJob.update({
          where: { id: jobId },
          data: { failedCount },
        })
      }

      if (i < job.messages.length - 1) {
        await delay(deliveryDelayMs)
      }
    }

    await prisma.deliveryJob.update({
      where: { id: jobId },
      data: { status: 'complete', completedAt: new Date() },
    })

    try {
      await sendDeliveryComplete(notifyEmail, jobId, sentCount, failedCount)
    } catch {
      // non-fatal
    }
  } catch (err) {
    await prisma.deliveryJob.update({
      where: { id: jobId },
      data: { status: 'failed' },
    })
    throw err
  }
}
