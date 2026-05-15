// Central source of truth for plan feature copy used across UpgradeModal, BillingCTAs, and any other UI.
// null in PLAN_FEATURES means "included" (renders as ✓). Use '—' for "not included".
// Do NOT add "unlimited" copy — features with no cap need no disclosure.

export interface PlanFeatureRow {
  label:   string
  free:    string
  starter: string | null  // null = included (✓)
  pro:     string | null  // null = included (✓)
}

export const PLAN_FEATURES: PlanFeatureRow[] = [
  { label: 'Enrichment runs',   free: '5 runs', starter: null,  pro: null  },
  { label: 'Contacts per run',  free: '50',     starter: null,  pro: null  },
  { label: 'Results visible',   free: '5',      starter: null,  pro: null  },
  { label: 'Scoring models',    free: '1',      starter: '5',   pro: null  },
  { label: 'CSV export',        free: '—',      starter: null,  pro: null  },
  { label: 'AI criteria',       free: '—',      starter: '—',   pro: null  },
  { label: 'AI message gen',    free: '—',      starter: '—',   pro: null  },
  { label: 'LinkedIn delivery', free: '—',      starter: '—',   pro: null  },
  { label: 'Team seats',        free: '1',      starter: '1',   pro: '3'   },
]

export const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free:       ['5 enrichment runs', '50 contacts per run', 'See 5 results', '1 scoring model'],
  starter:    ['Unlimited enrichments & contacts', 'Full results', '5 scoring models', 'CSV export'],
  pro:        ['Everything in Starter', 'Unlimited scoring models', 'AI criteria suggestions', 'AI messages & LinkedIn delivery'],
  enterprise: ['Everything in Pro', 'CRM integrations', 'SSO + white-label', 'Dedicated support & SLA'],
}
