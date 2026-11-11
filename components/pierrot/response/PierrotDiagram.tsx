'use client';

import React, { useId } from 'react';
import type {
  PierrotDiagramBlock,
  PierrotDiagramNode,
} from '@/lib/pierrot/response/types';

type Position = { x: number; y: number; w: number; h: number };

function lines(value: string, max = 19, limit = 3): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) result.push(current);
    current = word;
    if (result.length === limit - 1) break;
  }

  if (current && result.length < limit) result.push(current);
  return result.length > 0 ? result : [value.slice(0, max)];
}

function layout(
  nodes: PierrotDiagramNode[],
  diagram: PierrotDiagramBlock['diagram']
): { width: number; height: number; positions: Map<string, Position> } {
  const positions = new Map<string, Position>();

  if (diagram === 'relationship' && nodes.length <= 10) {
    const width = 760;
    const height = 430;
    const radiusX = 280;
    const radiusY = 158;
    const w = 176;
    const h = 58;

    nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) - Math.PI / 2;
      positions.set(node.id, {
        x: width / 2 + Math.cos(angle) * radiusX - w / 2,
        y: height / 2 + Math.sin(angle) * radiusY - h / 2,
        w,
        h,
      });
    });

    return { width, height, positions };
  }

  const columns = Math.min(3, Math.max(1, nodes.length));
  const rows = Math.ceil(nodes.length / columns);
  const w = 196;
  const h = 62;
  const gapX = 34;
  const gapY = 48;
  const width = columns * w + (columns - 1) * gapX + 40;
  const height = rows * h + (rows - 1) * gapY + 40;

  nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(node.id, {
      x: 20 + column * (w + gapX),
      y: 20 + row * (h + gapY),
      w,
      h,
    });
  });

  return { width, height, positions };
}

function edgeColor(kind: PierrotDiagramBlock['edges'][number]['kind']): string {
  if (kind === 'inference') return '#8A1235';
  if (kind === 'reference') return '#9A9184';
  return '#A5764F';
}

export default function PierrotDiagram({ block }: { block: PierrotDiagramBlock }) {
  const markerId = `pierrot-arrow-${useId().replace(/[:]/g, '')}`;
  const inferenceMarkerId = `${markerId}-inference`;
  const { width, height, positions } = layout(block.nodes, block.diagram);

  return (
    <figure className="my-6 min-w-0">
      {block.title && (
        <figcaption className="mb-1 font-serif text-[17px] leading-snug text-[#211F1F]">
          {block.title}
        </figcaption>
      )}
      {block.description && (
        <p className="mb-3 max-w-2xl text-[12.5px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
      <div className="w-full overflow-x-auto">
        <svg
          role="img"
          aria-label={block.caption || block.title || 'Pierrot diagram'}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[520px]"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{block.title || 'Pierrot diagram'}</title>
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#A5764F" />
            </marker>
            <marker
              id={inferenceMarkerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8A1235" />
            </marker>
          </defs>

          {block.edges.map((edge, index) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;

            const x1 = from.x + from.w / 2;
            const y1 = from.y + from.h / 2;
            const x2 = to.x + to.w / 2;
            const y2 = to.y + to.h / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const color = edgeColor(edge.kind);
            const inference = edge.kind === 'inference';

            return (
              <g key={`${edge.from}-${edge.to}-${index}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={inference ? 1 : 1.2}
                  strokeDasharray={inference ? '4 4' : undefined}
                  markerEnd={`url(#${inference ? inferenceMarkerId : markerId})`}
                  opacity={0.78}
                />
                {edge.label && (
                  <text
                    x={mx}
                    y={my - 5}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    fill={inference ? '#8A1235' : '#7A7268'}
                    paintOrder="stroke"
                    stroke="#FBF8F2"
                    strokeWidth={4}
                  >
                    {edge.label.length > 28 ? `${edge.label.slice(0, 27)}…` : edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {block.nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            const labelLines = lines(node.label);
            const isDocument = node.group === 'document';

            return (
              <g key={node.id}>
                <rect
                  x={position.x}
                  y={position.y}
                  width={position.w}
                  height={position.h}
                  rx={2}
                  fill={isDocument ? '#F3EDE3' : '#FBF8F2'}
                  stroke={isDocument ? '#C9BBA8' : '#D9D0C3'}
                  strokeWidth={1}
                />
                <text
                  x={position.x + position.w / 2}
                  y={position.y + position.h / 2 - (labelLines.length - 1) * 6}
                  textAnchor="middle"
                  fill="#2F2B26"
                  fontFamily="Georgia, 'Times New Roman', serif"
                  fontSize={11.5}
                >
                  {labelLines.map((line, index) => (
                    <tspan
                      key={index}
                      x={position.x + position.w / 2}
                      dy={index === 0 ? 0 : 12}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
                {node.detail && (
                  <text
                    x={position.x + position.w / 2}
                    y={position.y + position.h - 9}
                    textAnchor="middle"
                    fill="#8A8175"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    fontSize={8}
                  >
                    {node.detail.slice(0, 34)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {block.caption && (
        <p className="mt-2 max-w-2xl font-mono text-[8.5px] leading-relaxed tracking-[0.04em] text-[#948A7D]">
          {block.caption}
        </p>
      )}
    </figure>
  );
}
