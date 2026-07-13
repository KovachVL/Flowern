import type { Step } from '../api'

interface Props {
  steps: Step[]
}

export default function FlowView({ steps }: Props) {
  return (
    <ol className="flow-view">
      {steps.map((step, i) => {
        const prev = steps[i - 1]
        const crossedFile = prev && prev.file !== step.file
        const crossedMethod = prev && prev.method !== step.method

        return (
          <li key={i} className={step.context ? 'context-step' : undefined}>
            {(crossedFile || crossedMethod) && (
              <div className="transition-badges">
                {crossedFile && <span className="badge badge-file">→ different file</span>}
                {crossedMethod && <span className="badge badge-method">→ different function</span>}
              </div>
            )}
            <div className="step">
              <code className="step-code">{step.code || '(no source)'}</code>
              <span className="step-loc">
                {step.context && <em className="context-tag">context — not tainted · </em>}
                {step.file}:{step.line} {step.method && <em>in {step.method}</em>}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
