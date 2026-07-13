import { useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Panel, MarkerType, Handle, Position, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Step } from '../api'

interface Props {
  paths: Step[][]
}

const FILE_COLORS = ['#646cff', '#e8590c', '#2f9e44', '#c2255c', '#0ca678', '#f08c00', '#7048e8', '#1971c2']

function colorForFile(file: string): string {
  let hash = 0
  for (let i = 0; i < file.length; i++) hash = (hash * 31 + file.charCodeAt(i)) | 0
  return FILE_COLORS[Math.abs(hash) % FILE_COLORS.length]
}

function stepKey(s: Step): string {
  return `${s.file}:${s.line}:${s.code}`
}

function StepNode({ data }: { data: { step: Step; color: string } }) {
  const { step, color } = data
  return (
    <div className={`graph-node${step.context ? ' graph-node-context' : ''}`} style={{ borderColor: color }}>
      <Handle type="target" position={Position.Left} style={{ background: color, visibility: 'hidden' }} />
      <div className="graph-node-file" style={{ color }}>
        {step.file}:{step.line}
      </div>
      <code className="graph-node-code">{step.code || '(no source)'}</code>
      {step.method && <div className="graph-node-method">{step.method}</div>}
      <Handle type="source" position={Position.Right} style={{ background: color, visibility: 'hidden' }} />
    </div>
  )
}

const nodeTypes = { step: StepNode }

const NODE_W = 300
const NODE_H = 130

function buildLayout(paths: Step[][]): { nodes: Node[]; edges: Edge[] } {
  const stepById = new Map<string, Step>()
  const edgeSet = new Map<string, { source: string; target: string }>()
  const firstSeen = new Map<string, number>()
  let counter = 0

  for (const path of paths) {
    let prevId: string | null = null
    for (const step of path) {
      const id = stepKey(step)
      if (!stepById.has(id)) stepById.set(id, step)
      if (!firstSeen.has(id)) firstSeen.set(id, counter++)
      if (prevId !== null && prevId !== id) {
        const edgeId = `${prevId}=>${id}`
        if (!edgeSet.has(edgeId)) edgeSet.set(edgeId, { source: prevId, target: id })
      }
      prevId = id
    }
  }

  const ids = [...stepById.keys()]
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const id of ids) {
    incoming.set(id, [])
    outgoing.set(id, [])
  }
  for (const e of edgeSet.values()) {
    incoming.get(e.target)!.push(e.source)
    outgoing.get(e.source)!.push(e.target)
  }

  const depth = new Map<string, number>()
  const inDegree = new Map<string, number>()
  for (const id of ids) inDegree.set(id, incoming.get(id)!.length)
  const queue = ids.filter((id) => inDegree.get(id) === 0)
  for (const id of queue) depth.set(id, 0)
  let qi = 0
  while (qi < queue.length) {
    const id = queue[qi++]
    for (const next of outgoing.get(id)!) {
      depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1))
      const remaining = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  const byDepth = new Map<number, string[]>()
  for (const id of ids) {
    const d = depth.get(id) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(id)
  }
  for (const list of byDepth.values()) {
    list.sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0))
  }

  const position = new Map<string, { x: number; y: number }>()
  for (const [d, list] of byDepth) {
    list.forEach((id, i) => position.set(id, { x: d * NODE_W, y: i * NODE_H }))
  }

  const nodes: Node[] = ids.map((id) => ({
    id,
    type: 'step',
    position: position.get(id) ?? { x: 0, y: 0 },
    data: { step: stepById.get(id)!, color: colorForFile(stepById.get(id)!.file) },
    draggable: false,
  }))

  const edges: Edge[] = [...edgeSet.values()].map((e) => {
    const sourceStep = stepById.get(e.source)!
    const targetStep = stepById.get(e.target)!
    const crossFile = sourceStep.file !== targetStep.file
    const color = crossFile ? '#e8590c' : '#646cff'
    return {
      id: `${e.source}=>${e.target}`,
      source: e.source,
      target: e.target,
      style: { stroke: color, strokeWidth: crossFile ? 2.5 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })

  return { nodes, edges }
}

export default function FlowGraph({ paths }: Props) {
  const { nodes, edges } = useMemo(() => buildLayout(paths), [paths])
  const [fullscreen, setFullscreen] = useState(false)
  const height = Math.max(360, Math.max(...nodes.map((n) => n.position.y)) + NODE_H + 40)

  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  return (
    <div className={fullscreen ? 'flow-graph flow-graph-fullscreen' : 'flow-graph'} style={fullscreen ? undefined : { height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <button className="graph-fullscreen-toggle" onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? '✕ Close' : '⤢ Fullscreen'}
          </button>
        </Panel>
      </ReactFlow>
    </div>
  )
}
