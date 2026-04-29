import { getClient } from './linkedapi'
import prisma from './prisma'
import { sendDeliveryComplete } from './notify'

const DELIVERY_DELAY_MS = parseInt(process.env.DELIVERY_DELAY_MS ?? '3000', 10)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function processDeliveryJob(jobId: string, notifyEmail: string): Promise<void> {
  const job = await prisma.deliveryJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      messages: {
        include: {
          runResult: { select: { linkedinUrl: true } },
        },
      },
    },
  })

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  })

  const client = getClient()
  let sentCount = 0
  let failedCount = 0

  const testMode = process.env.LINKED_API_TEST_DELIVERY === 'true'
  const testProfileUrl = process.env.LINKED_API_TEST_DELIVERY_PROFILE

  if (testMode && !testProfileUrl) {
    throw new Error('LINKED_API_TEST_DELIVERY is enabled but LINKED_API_TEST_DELIVERY_PROFILE is not set')
  }

  try {
    for (let i = 0; i < job.messages.length; i++) {
      const msg = job.messages[i]
      const intendedRecipient = msg.runResult.linkedinUrl
      const personUrl = testMode ? testProfileUrl! : intendedRecipient
      const text = testMode
        ? `test delivery for ${intendedRecipient}`
        : (msg.editedBody ?? msg.body)

      try {
        const workflowId = await client.sendMessage.execute({ personUrl, text })
        const res = await client.sendMessage.result(workflowId)

        if (res.errors.length === 0) {
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
        await delay(DELIVERY_DELAY_MS)
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
