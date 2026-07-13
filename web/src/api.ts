export interface Step {
  code: string
  file: string
  line: number
  method: string
  context?: boolean
}

export interface Flow {
  sinkId: string
  sinkMethod: string
  sinkFile: string
  sinkLine: number
  paths: Step[][]
}

export interface CallRef {
  code: string
  file: string
  line: number
  callerMethod?: string
  calleeMethod?: string
}

export interface Method {
  id: string
  name: string
  file: string
  line: number
  params: string[]
  callers: CallRef[]
  callees: CallRef[]
}

export interface AnalysisResult {
  language: string
  flows: Flow[]
  methods: Method[]
}

export type ProjectStatus = 'queued' | 'preparing' | 'analyzing' | 'done' | 'error'

export interface ProjectStatusResponse {
  projectId: string
  status: ProjectStatus
  error?: string
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function createProjectFromGit(gitUrl: string, language: string): Promise<{ projectId: string }> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'git', gitUrl, language }),
  })
  return unwrap(res)
}

export async function createProjectFromZip(file: File, language: string): Promise<{ projectId: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('language', language)
  const res = await fetch('/api/projects', { method: 'POST', body: form })
  return unwrap(res)
}

export async function getProjectStatus(id: string): Promise<ProjectStatusResponse> {
  const res = await fetch(`/api/projects/${id}`)
  return unwrap(res)
}

export async function getProjectResult(id: string): Promise<AnalysisResult> {
  const res = await fetch(`/api/projects/${id}/result`)
  return unwrap(res)
}
