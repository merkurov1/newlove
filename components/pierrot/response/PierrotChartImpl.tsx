'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import type { PierrotChartBlock } from '@/lib/pierrot/response/types';

const DEFAULT_COLORS = ['#2F2B26', '#A5764F', '#7C8A73', '#8A1235', '#B08A5A'];
const AXIS = '#8A8175';
const GRID = '#E7DFD4';

function axisTick() {
  return { fill: AXIS, fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace' };
}

function tooltipStyle() {
  return {
    background: '#FBF8F2',
    border: '1px solid #D9D0C3',
    borderRadius: 3,
    fontSize: 11,
    color: '#2F2B26',
    boxShadow: 'none',
  } as const;
}

function chartData(block: PierrotChartBlock) {
  return block.data.map((point) => {
    const row: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(point)) {
      if (value === null) continue;
      row[key] = value;
    }
    return row;
  });
}

function seriesColor(block: PierrotChartBlock, index: number): string {
  return block.series[index]?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

/**
 * Measures its own box instead of relying on Recharts' ResponsiveContainer.
 * The chat message can mount inside a grid during hydration; measuring avoids
 * the zero-width initial layout that leaves mobile charts blank.
 */
export default function PierrotChartImpl({ block }: { block: PierrotChartBlock }) {
  const reduceMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) => {
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        return current.width === width && current.height === height
          ? current
          : { width, height };
      });
    };

    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const data = chartData(block);
  const width = size.width;
  const height = size.height;
  const common = {
    data,
    width,
    height,
    margin: { top: 8, right: 10, bottom: 0, left: -12 },
  };
  const xAxis = (
    <XAxis
      dataKey={block.xKey}
      tick={axisTick()}
      tickLine={false}
      axisLine={{ stroke: GRID }}
      interval="preserveStartEnd"
      minTickGap={18}
    />
  );
  const yAxis = (
    <YAxis
      tick={axisTick()}
      tickLine={false}
      axisLine={false}
      width={48}
      tickFormatter={(value: number) =>
        new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
      }
    />
  );
  const grid = <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 5" />;
  const tooltip = <Tooltip contentStyle={tooltipStyle()} cursor={{ stroke: '#C9BBA8' }} />;
  const references = (block.referenceLines || []).map((line) => (
    <ReferenceLine
      key={line.key}
      y={line.value}
      stroke="#B08A5A"
      strokeDasharray="4 4"
      label={{ value: line.label, fill: '#8A8175', fontSize: 9 }}
    />
  ));

  return (
    <div ref={containerRef} className="h-full w-full min-w-0" aria-hidden={width <= 1}>
      {width > 1 && height > 1 && block.chart === 'pie' && (
        <PieChart width={width} height={height} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <Pie
            data={data}
            dataKey={block.series[0].key}
            nameKey={block.xKey}
            innerRadius="48%"
            outerRadius="76%"
            isAnimationActive={!reduceMotion}
            stroke="#FBF8F2"
          >
            {data.map((_, index) => (
              <Cell key={index} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
            ))}
          </Pie>
          {tooltip}
        </PieChart>
      )}

      {width > 1 && height > 1 && block.chart === 'scatter' && (
        <ScatterChart width={width} height={height} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {block.series.map((series, index) => (
            <Scatter
              key={series.key}
              name={series.label}
              data={data}
              dataKey={series.key}
              fill={seriesColor(block, index)}
              isAnimationActive={!reduceMotion}
            />
          ))}
          {references}
        </ScatterChart>
      )}

      {width > 1 && height > 1 && (block.chart === 'bar' || block.chart === 'stacked_bar') && (
        <BarChart {...common} barCategoryGap="24%">
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {references}
          {block.series.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={seriesColor(block, index)}
              stackId={block.chart === 'stacked_bar' ? 'stack' : undefined}
              radius={block.chart === 'stacked_bar' ? 0 : [1, 1, 0, 0]}
              maxBarSize={54}
              isAnimationActive={!reduceMotion}
            />
          ))}
        </BarChart>
      )}

      {width > 1 && height > 1 && block.chart === 'area' && (
        <AreaChart {...common}>
          <defs>
            {block.series.map((series, index) => (
              <linearGradient key={series.key} id={`pierrot-area-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor(block, index)} stopOpacity={0.18} />
                <stop offset="100%" stopColor={seriesColor(block, index)} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {references}
          {block.series.map((series, index) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={seriesColor(block, index)}
              fill={`url(#pierrot-area-${index})`}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={!reduceMotion}
            />
          ))}
        </AreaChart>
      )}

      {width > 1 && height > 1 && block.chart !== 'pie' && block.chart !== 'scatter' && block.chart !== 'bar' && block.chart !== 'stacked_bar' && block.chart !== 'area' && (
        <LineChart {...common}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {references}
          {block.series.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={seriesColor(block, index)}
              strokeWidth={1.6}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={!reduceMotion}
            />
          ))}
        </LineChart>
      )}
    </div>
  );
}
