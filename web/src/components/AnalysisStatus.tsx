import type { ProjectStatus } from '../api'

const LABELS: Record<ProjectStatus, string> = {
  queued: 'Queued...',
  preparing: 'Fetching project source...',
  analyzing: 'Running Joern analysis (this can take a while)...',
  done: 'Done',
  error: 'Failed',
}

interface Props {
  status: ProjectStatus
  error?: string
}

export default function AnalysisStatus({ status, error }: Props) {
  if (status === 'done') return null

  return (
    <div className="analysis-status">
      {status !== 'error' && <span className="spinner" aria-hidden />}
      <span>{LABELS[status]}</span>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
