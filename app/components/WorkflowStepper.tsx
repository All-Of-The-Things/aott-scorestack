interface WorkflowStepperProps {
  currentStep: 2 | 3
}

const STEPS = [
  { n: 1, label: 'Upload & Enrich' },
  { n: 2, label: 'Define criteria' },
  { n: 3, label: 'View results' },
]

export default function WorkflowStepper({ currentStep }: WorkflowStepperProps) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((step, i) => {
        const done = step.n < currentStep
        const active = step.n === currentStep

        return (
          <div key={step.n} className="flex items-center flex-1 last:flex-none">
            {/* Step badge + label */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold
                  ${done ? 'bg-green-100 text-green-700' : active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
              >
                {done ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  step.n
                )}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-gray-800' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>

            {/* Connector — not after last step */}
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px mx-3 bg-gray-200" />
            )}
          </div>
        )
      })}
    </div>
  )
}
