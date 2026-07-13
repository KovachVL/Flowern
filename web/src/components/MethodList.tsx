import { useMemo, useState } from 'react'
import type { AnalysisResult, Flow } from '../api'
import FlowView from './FlowView'
import FlowGraph from './FlowGraph'

interface Props {
  result: AnalysisResult
}

interface MethodGroup {
  key: string
  file: string
  method: string
  flows: Flow[]
}

function firstDivergentStep(paths: Flow['paths'], index: number) {
  const path = paths[index]
  for (let i = 0; i < path.length; i++) {
    const step = path[i]
    const allMatch = paths.every((p) => p[i] && p[i].file === step.file && p[i].line === step.line)
    if (!allMatch) return step
  }
  return path[path.length - 1]
}

type ViewMode = 'graph' | 'list'

export default function MethodList({ result }: Props) {
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')

  const groups = useMemo<MethodGroup[]>(() => {
    const map = new Map<string, MethodGroup>()
    for (const flow of result.flows) {
      const key = `${flow.sinkFile}::${flow.sinkMethod}`
      const existing = map.get(key)
      if (existing) {
        existing.flows.push(flow)
      } else {
        map.set(key, { key, file: flow.sinkFile, method: flow.sinkMethod, flows: [flow] })
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.file.localeCompare(b.file) || a.method.localeCompare(b.method),
    )
  }, [result.flows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.file.toLowerCase().includes(q) || g.method.toLowerCase().includes(q))
  }, [groups, query])

  const selected = groups.find((g) => g.key === selectedKey) ?? null

  if (groups.length === 0) {
    return <p className="empty-state">No data flows into project methods were found.</p>
  }

  return (
    <div className="method-list">
      <div className="method-list-sidebar">
        <input
          type="text"
          placeholder="Search by file or method..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul>
          {filtered.map((g) => (
            <li key={g.key}>
              <button className={g.key === selectedKey ? 'active' : ''} onClick={() => setSelectedKey(g.key)}>
                <span className="method-name">{g.method || '(anonymous)'}</span>
                <span className="method-file">{g.file}</span>
                <span className="flow-count">{g.flows.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="method-list-detail">
        {selected ? (
          <>
            <div className="tabs view-mode-tabs">
              <button className={viewMode === 'graph' ? 'active' : ''} onClick={() => setViewMode('graph')}>
                Graph
              </button>
              <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
                List
              </button>
            </div>
            {selected.flows.map((flow) => (
              <div className="flow-block" key={flow.sinkId}>
                <h3>
                  {selected.method} <span className="method-file">{flow.sinkFile}:{flow.sinkLine}</span>
                </h3>
                {viewMode === 'graph' ? (
                  <FlowGraph paths={flow.paths} />
                ) : (
                  flow.paths.map((path, i) => (
                    <div className="flow-path" key={i}>
                      {flow.paths.length > 1 && (
                        <h4 className="path-label">via {firstDivergentStep(flow.paths, i)?.code || `path ${i + 1}`}</h4>
                      )}
                      <FlowView steps={path} />
                    </div>
                  ))
                )}
              </div>
            ))}
          </>
        ) : (
          <p className="empty-state">Select a method on the left to see its data flow.</p>
        )}
      </div>
    </div>
  )
}
