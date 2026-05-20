import { serve } from 'inngest/next'
import { inngest, enrichContacts } from '@/app/lib/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [enrichContacts],
})
