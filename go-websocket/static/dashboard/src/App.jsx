import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer,
} from '@xyflow/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

// ── edge path registry (module-level Map, shared between edge components and SSE handler) ──
const edgePathStore = new Map();

// ── particle system ───────────────────────────────────────────────────────────

function ensureGradientDefs() {
  const svg = document.querySelector('.react-flow__edges');
  if (!svg || svg.querySelector('#pg-approved')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="pg-approved" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFD200"/>
      <stop offset="100%" stop-color="#FF8B00"/>
    </linearGradient>
    <linearGradient id="pg-fraud" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF6B35"/>
      <stop offset="100%" stop-color="#9B27AF"/>
    </linearGradient>
  `;
  svg.insertBefore(defs, svg.firstChild);
}

function spawnParticle(edgeId, tipo) {
  const pathStr = edgePathStore.get(edgeId);
  if (!pathStr) return;
  const svg = document.querySelector('.react-flow__edges');
  if (!svg) return;

  ensureGradientDefs();

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('r', '6');
  circle.setAttribute('fill', tipo === 'fraude' ? 'url(#pg-fraud)' : 'url(#pg-approved)');
  // Start off-screen so the 1-frame pre-GSAP position is invisible
  circle.setAttribute('transform', 'translate(-9999,-9999)');
  circle.style.pointerEvents = 'none';
  svg.appendChild(circle);

  gsap.to(circle, {
    duration: 1.2,
    ease: 'power2.inOut',
    motionPath: { path: pathStr },
    onComplete: () => circle.remove(),
  });
}

// ── custom node ───────────────────────────────────────────────────────────────

function CustomNode({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div style={{
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.15)',
        borderLeft: `4px solid ${data.langColor}`,
        borderRadius: 8,
        padding: '12px 16px',
        cursor: 'default',
        userSelect: 'none',
      }}>
        <div style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 13,
          fontWeight: 600,
          color: '#FFFFFF',
          whiteSpace: 'nowrap',
        }}>
          {data.label}
        </div>
        <div style={{
          fontFamily: '"Inter", sans-serif',
          fontSize: 11,
          color: '#555555',
          marginTop: 4,
          whiteSpace: 'nowrap',
        }}>
          {data.sublabel}
        </div>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

// ── custom edge ───────────────────────────────────────────────────────────────

function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  useEffect(() => {
    edgePathStore.set(id, edgePath);
    return () => edgePathStore.delete(id);
  }, [id, edgePath]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1.5 }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 10,
            color: '#444444',
            background: '#000000',
            padding: '2px 6px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ── static graph data ─────────────────────────────────────────────────────────

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

const NODES = [
  { id: 'stone',        type: 'custom', position: { x: 0,    y: 0   }, data: { label: 'STONE',                sublabel: 'kotlin producer',                   langColor: '#7F52FF' } },
  { id: 'cielo',        type: 'custom', position: { x: 0,    y: 130 }, data: { label: 'CIELO',                sublabel: 'kotlin producer',                   langColor: '#7F52FF' } },
  { id: 'getnet',       type: 'custom', position: { x: 0,    y: 260 }, data: { label: 'GETNET',               sublabel: 'kotlin producer',                   langColor: '#7F52FF' } },
  { id: 'go-gateway',   type: 'custom', position: { x: 280,  y: 130 }, data: { label: 'GO GATEWAY',           sublabel: 'go · port 8080',                    langColor: '#00ADD8' } },
  { id: 'rust-01',      type: 'custom', position: { x: 600,  y: 40  }, data: { label: 'RUST ANTIFRAUDE · 01', sublabel: 'rust · consumer group: antifraude', langColor: '#CE3262' } },
  { id: 'rust-02',      type: 'custom', position: { x: 600,  y: 220 }, data: { label: 'RUST ANTIFRAUDE · 02', sublabel: 'rust · consumer group: antifraude', langColor: '#CE3262' } },
  { id: 'go-websocket', type: 'custom', position: { x: 940,  y: 130 }, data: { label: 'GO WEBSOCKET',         sublabel: 'go · port 8081 · SSE',              langColor: '#00ADD8' } },
  { id: 'dashboard',    type: 'custom', position: { x: 1230, y: 130 }, data: { label: 'DASHBOARD',            sublabel: 'browser · localhost:8081',          langColor: 'rgba(255,255,255,0.2)' } },
];

const EDGES = [
  { id: 'e-stone-gw',  source: 'stone',        target: 'go-gateway',   type: 'custom', data: { label: 'REST' } },
  { id: 'e-cielo-gw',  source: 'cielo',        target: 'go-gateway',   type: 'custom', data: { label: 'REST' } },
  { id: 'e-getnet-gw', source: 'getnet',       target: 'go-gateway',   type: 'custom', data: { label: 'REST' } },
  { id: 'e-gw-r01',    source: 'go-gateway',   target: 'rust-01',      type: 'custom', data: { label: 'Kafka · transacoes-entrada' } },
  { id: 'e-gw-r02',    source: 'go-gateway',   target: 'rust-02',      type: 'custom', data: { label: 'Kafka · transacoes-entrada' } },
  { id: 'e-r01-ws',    source: 'rust-01',      target: 'go-websocket', type: 'custom', data: { label: 'Kafka · transacoes-resultado' } },
  { id: 'e-r02-ws',    source: 'rust-02',      target: 'go-websocket', type: 'custom', data: { label: 'Kafka · transacoes-resultado' } },
  { id: 'e-ws-dash',   source: 'go-websocket', target: 'dashboard',    type: 'custom', data: { label: 'SSE' } },
];

// ── acquirer edge map ─────────────────────────────────────────────────────────

const ACQUIRER_EDGE = { stone: 'e-stone-gw', cielo: 'e-cielo-gw', getnet: 'e-getnet-gw' };
const INSTANCE_EDGE = { '1': 'e-r01-ws', '2': 'e-r02-ws' };

// ── main component ────────────────────────────────────────────────────────────

export default function App() {
  const [stats, setStats] = useState({ total: 0, aprovadas: 0, fraudes: 0 });
  const [activeInst, setActiveInst] = useState(new Set());
  const timeouts = useRef({});

  const markActive = useCallback((inst) => {
    setActiveInst(prev => new Set([...prev, inst]));
    clearTimeout(timeouts.current[inst]);
    timeouts.current[inst] = setTimeout(() => {
      setActiveInst(prev => { const s = new Set(prev); s.delete(inst); return s; });
    }, 3000);
  }, []);

  useEffect(() => {
    const es = new EventSource('http://localhost:8081/eventos');

    es.onmessage = (e) => {
      let outer;
      try { outer = JSON.parse(e.data); } catch { return; }
      const { tipo, payload: raw } = outer;
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }

      if (tipo === 'aprovada') {
        setStats(p => ({ total: p.total + 1, aprovadas: p.aprovadas + 1, fraudes: p.fraudes }));
        const inst = String(payload.instancia ?? '1');
        markActive(inst);
        spawnParticle(INSTANCE_EDGE[inst] ?? 'e-r01-ws', 'aprovada');
      } else if (tipo === 'fraude') {
        setStats(p => ({ total: p.total + 1, aprovadas: p.aprovadas, fraudes: p.fraudes + 1 }));
        const inst = String(payload.instancia ?? '1');
        markActive(inst);
        spawnParticle(INSTANCE_EDGE[inst] ?? 'e-r01-ws', 'fraude');
      } else if (tipo === 'entrada') {
        const adq = (payload.adquirente ?? '').toLowerCase();
        const eid = ACQUIRER_EDGE[adq];
        if (eid) spawnParticle(eid, 'aprovada');
      }
    };

    es.onerror = () => {};
    return () => es.close();
  }, [markActive]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>

      {/* ── header ── */}
      <header style={{
        height: 48,
        flexShrink: 0,
        background: '#000',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <span style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 12,
          letterSpacing: '0.15em',
          color: '#fff',
        }}>
          ACQUIRER SENTINEL
        </span>

        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {['1', '2'].map(inst => (
            <div key={inst} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00FF88',
                animation: activeInst.has(inst) ? 'pulse-dot 1s ease-in-out infinite' : 'none',
              }} />
              <span style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 11,
                color: '#888',
              }}>
                RUST · 0{inst}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* ── canvas ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={NODES}
          edges={EDGES}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          panOnScroll={false}
          panOnDrag={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#000' }}
        />
      </div>

      {/* ── footer ── */}
      <footer style={{
        height: 40,
        flexShrink: 0,
        background: '#000',
        borderTop: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}>
        {[
          { key: 'total',     label: 'TOTAL',     value: stats.total },
          { key: 'aprovadas', label: 'APROVADAS', value: stats.aprovadas },
          { key: 'fraudes',   label: 'FRAUDES',   value: stats.fraudes },
        ].map(({ key, label, value }, i) => (
          <React.Fragment key={key}>
            {i > 0 && (
              <span style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 11,
                color: '#333',
                margin: '0 20px',
              }}>·</span>
            )}
            <span style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 11,
              letterSpacing: '0.1em',
              color: '#444',
            }}>
              {label}{' '}
              <span style={{ color: '#fff', fontWeight: 600 }}>{value}</span>
            </span>
          </React.Fragment>
        ))}
      </footer>

    </div>
  );
}
