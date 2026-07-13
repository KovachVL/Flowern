import { useMemo, useState } from 'react'
import type { AnalysisResult, CallRef, Method } from '../api'

interface Props {
  result: AnalysisResult
}

function CallRefRow({
  method,
  callRef,
  direction,
}: {
  method: Method
  callRef: CallRef
  direction: 'caller' | 'callee'
}) {
  const otherMethod = direction === 'caller' ? callRef.callerMethod : callRef.calleeMethod
  const crossFile = callRef.file !== method.file

  return (
    <li className="call-ref">
      <code className="step-code">{callRef.code}</code>
      <span className="step-loc">
        {callRef.file}:{callRef.line}
        {otherMethod && <em> in {otherMethod}</em>}
        {!otherMethod && direction === 'callee' && <em> (external)</em>}
      </span>
      {crossFile && <span className="badge badge-file">→ different file</span>}
    </li>
  )
}

export default function MethodBrowser({ result }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const methods = useMemo(
    () => [...result.methods].sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)),
    [result.methods],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return methods
    return methods.filter((m) => m.file.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
  }, [methods, query])

  const selected = methods.find((m) => m.id === selectedId) ?? null

  if (methods.length === 0) {
    return <p className="empty-state">No methods were found in this project.</p>
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
          {filtered.map((m) => (
            <li key={m.id}>
              <button className={m.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(m.id)}>
                <span className="method-name">{m.name || '(anonymous)'}</span>
                <span className="method-file">{m.file}</span>
                <span className="flow-count">{m.callers.length + m.callees.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="method-list-detail">
        {selected ? (
          <div className="flow-block">
            <h3>
              {selected.name}
              {selected.params.length > 0 && <span className="method-params">({selected.params.join(', ')})</span>}{' '}
              <span className="method-file">
                {selected.file}:{selected.line}
              </span>
            </h3>

            <h4 className="path-label">
              Called from ({selected.callers.length}){selected.callers.length === 0 && ' — no callers found'}
            </h4>
            {selected.callers.length > 0 && (
              <ul className="call-ref-list">
                {selected.callers.map((c, i) => (
                  <CallRefRow key={i} method={selected} callRef={c} direction="caller" />
                ))}
              </ul>
            )}

            <h4 className="path-label">
              Calls ({selected.callees.length}){selected.callees.length === 0 && ' — no calls found'}
            </h4>
            {selected.callees.length > 0 && (
              <ul className="call-ref-list">
                {selected.callees.map((c, i) => (
                  <CallRefRow key={i} method={selected} callRef={c} direction="callee" />
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="empty-state">Select a method on the left to see its callers and calls.</p>
        )}
      </div>
    </div>
  )
}
