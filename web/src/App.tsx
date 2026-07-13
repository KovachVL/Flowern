import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import './App.css'
import ProjectForm from './components/ProjectForm'
import AnalysisStatus from './components/AnalysisStatus'
import MethodList from './components/MethodList'
import MethodBrowser from './components/MethodBrowser'
import { getProjectResult, getProjectStatus } from './api'

const TERMINAL_STATUSES = new Set(['done', 'error'])

type View = 'flows' | 'methods'

function App() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [view, setView] = useState<View>('flows')

  const statusQuery = useQuery({
    queryKey: ['status', projectId],
    queryFn: () => getProjectStatus(projectId as string),
    enabled: projectId !== null,
    refetchInterval: (query) => (TERMINAL_STATUSES.has(query.state.data?.status ?? '') ? false : 1500),
    refetchIntervalInBackground: true,
  })

  const resultQuery = useQuery({
    queryKey: ['result', projectId],
    queryFn: () => getProjectResult(projectId as string),
    enabled: statusQuery.data?.status === 'done',
  })

  function reset() {
    setProjectId(null)
  }

  return (
    <div className="app">
      <header>
        <h1>Flowern</h1>
      </header>

      {projectId === null ? (
        <ProjectForm onCreated={setProjectId} />
      ) : (
        <div className="analysis-panel">
          <button className="reset-button" onClick={reset}>
            ← New analysis
          </button>

          {statusQuery.data && <AnalysisStatus status={statusQuery.data.status} error={statusQuery.data.error} />}

          {resultQuery.data && (
            <>
              <div className="tabs view-tabs">
                <button className={view === 'flows' ? 'active' : ''} onClick={() => setView('flows')}>
                  Tainted flows ({resultQuery.data.flows.length})
                </button>
                <button className={view === 'methods' ? 'active' : ''} onClick={() => setView('methods')}>
                  All methods ({resultQuery.data.methods.length})
                </button>
              </div>
              {view === 'flows' ? (
                <MethodList result={resultQuery.data} />
              ) : (
                <MethodBrowser result={resultQuery.data} />
              )}
            </>
          )}
          {resultQuery.isError && <p className="error">{(resultQuery.error as Error).message}</p>}
        </div>
      )}
    </div>
  )
}

export default App
