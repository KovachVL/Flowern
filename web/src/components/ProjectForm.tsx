import { useState } from 'react'
import { createProjectFromGit, createProjectFromZip } from '../api'

interface Props {
  onCreated: (projectId: string) => void
}

type Tab = 'git' | 'zip'

const LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'java', label: 'Java' },
]

export default function ProjectForm({ onCreated }: Props) {
  const [tab, setTab] = useState<Tab>('git')
  const [gitUrl, setGitUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { projectId } =
        tab === 'git'
          ? await createProjectFromGit(gitUrl.trim(), language)
          : await createProjectFromZip(file as File, language)
      onCreated(projectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to start analysis')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = tab === 'git' ? gitUrl.trim().length > 0 : file !== null

  return (
    <form onSubmit={handleSubmit} className="project-form">
      <div className="tabs">
        <button type="button" className={tab === 'git' ? 'active' : ''} onClick={() => setTab('git')}>
          Git URL
        </button>
        <button type="button" className={tab === 'zip' ? 'active' : ''} onClick={() => setTab('zip')}>
          Upload ZIP
        </button>
      </div>

      {tab === 'git' ? (
        <input
          type="text"
          placeholder="https://github.com/org/repo.git"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
        />
      ) : (
        <input type="file" accept=".zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      )}

      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>

      <button type="submit" disabled={!canSubmit || submitting}>
        {submitting ? 'Starting...' : 'Analyze'}
      </button>

      {error && <p className="error">{error}</p>}
    </form>
  )
}
