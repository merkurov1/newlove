'use client';

import React from 'react';
import PierrotMarkdown, { safeMarkdownUrl } from '@/components/pierrot/PierrotMarkdown';
import { parsePierrotResponse } from '@/lib/pierrot/response/schema';
import type {
  PierrotComparisonBlock,
  PierrotContentBlock,
  PierrotInsightBlock,
  PierrotMetricBlock,
  PierrotProgressBlock,
  PierrotProjectStatusBlock,
  PierrotQuoteBlock,
  PierrotResponse,
  PierrotSourceBlock,
  PierrotTableBlock,
  PierrotWarningBlock,
} from '@/lib/pierrot/response/types';
import {
  formatBlockNumber,
  formatChange,
  formatMetricUnit,
  formatMetricValue,
} from './format';
import PierrotChart from './PierrotChart';
import PierrotCode from './PierrotCode';
import PierrotComparison from './PierrotComparison';
import PierrotDiagram from './PierrotDiagram';
import PierrotGallery from './PierrotGallery';
import PierrotTimeline from './PierrotTimeline';

function HeadingBlock({ block }: { block: Extract<PierrotContentBlock, { type: 'heading' }> }) {
  const className =
    block.level === 1
      ? 'font-serif text-[24px] leading-[1.18] tracking-[-0.012em] text-[#1F1C18] first:mt-0'
      : block.level === 2
        ? 'font-serif text-[19px] leading-snug text-[#211F1F]'
        : 'font-serif text-[16.5px] leading-snug text-[#2F2B26]';

  return (
    <header className="my-5 first:mt-0">
      {block.level === 1 ? (
        <h2 className={className}>{block.text}</h2>
      ) : block.level === 2 ? (
        <h3 className={className}>{block.text}</h3>
      ) : (
        <h4 className={className}>{block.text}</h4>
      )}
      {block.description && (
        <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
    </header>
  );
}

function MetricBlock({ block, language }: { block: PierrotMetricBlock; language: 'ru' | 'en' }) {
  return (
    <section className="my-6 min-w-0" aria-label={block.title || 'Metrics'}>
      {block.title && (
        <h3 className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#948A7D]">
          {block.title}
        </h3>
      )}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
        {block.metrics.map((metric, index) => {
          const change = formatChange(metric.changePercent);
          const calculated = metric.confidence === 'calculated';

          return (
            <div key={`${metric.label}-${index}`} className="min-w-0 border-t border-[#DED4C6] pt-3">
              <dt className="font-mono text-[8px] uppercase leading-relaxed tracking-[0.14em] text-[#948A7D]">
                {metric.label}
              </dt>
              <dd className="mt-1 min-w-0">
                <span className="font-serif text-[27px] leading-none tracking-[-0.02em] text-[#211F1F] sm:text-[31px]">
                  {formatMetricValue(metric.value, metric.unit, language)}
                </span>
                {metric.unit &&
                  metric.unit !== 'count' &&
                  metric.unit !== 'position' &&
                  metric.unit !== 'text' && (
                    <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#948A7D]">
                      {formatMetricUnit(metric.unit)}
                    </span>
                  )}
                {change && (
                  <span
                    className={`ml-2 font-mono text-[9px] ${
                      change.startsWith('-') ? 'text-[#8A1235]' : 'text-[#5F735A]'
                    }`}
                  >
                    {change}
                  </span>
                )}
              </dd>
              <div className="mt-1.5 space-y-0.5 font-mono text-[8px] leading-relaxed tracking-[0.03em] text-[#A49A8C]">
                {metric.source && <p>{metric.source}</p>}
                {calculated && <p>расчётно</p>}
                {metric.period && <p>{metric.period}</p>}
              </div>
              {metric.interpretation && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#7A7268]">
                  {metric.interpretation}
                </p>
              )}
              {metric.value === null && metric.unavailableReason && (
                <p className="mt-1 font-mono text-[8px] leading-relaxed text-[#8A1235]">
                  {metric.unavailableReason}
                </p>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function TableBlock({ block }: { block: PierrotTableBlock }) {
  return (
    <figure className="my-6 min-w-0">
      {block.title && (
        <figcaption className="mb-1 font-serif text-[17px] leading-snug text-[#211F1F]">
          {block.title}
        </figcaption>
      )}
      {block.description && (
        <p className="mb-2 max-w-2xl text-[12.5px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
      <div className="w-full overflow-x-auto">
        <table
          className={`w-full table-auto border-collapse text-left ${
            block.compact ? 'text-[12px]' : 'text-[13px] sm:text-[13.5px]'
          }`}
        >
          <thead>
            <tr className="bg-[#FBF8F2]">
              {block.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="border-b border-[#D9D0C3] px-2 py-2 font-mono text-[8px] font-medium uppercase tracking-[0.1em] text-[#7D7468]"
                  style={{ textAlign: column.align || 'left' }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={
                  block.highlightRow === rowIndex
                    ? 'bg-[#F7F0E5]'
                    : 'even:bg-[#FCFAF6]/50'
                }
              >
                {block.columns.map((column) => {
                  const value = row[column.key] ?? null;

                  return (
                    <td
                      key={column.key}
                      className="border-b border-[#EEE8DE] px-2 py-2 align-top text-[#4D463D]"
                      style={{ textAlign: column.align || 'left' }}
                    >
                      {column.format === 'number' && typeof value === 'number'
                        ? formatBlockNumber(value, 'en')
                        : value === null
                          ? '—'
                          : String(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && (
        <p className="mt-2 font-mono text-[8.5px] leading-relaxed text-[#948A7D]">
          {block.caption}
        </p>
      )}
    </figure>
  );
}

function QuoteBlock({ block }: { block: PierrotQuoteBlock }) {
  const href = block.url ? safeMarkdownUrl(block.url) : null;

  return (
    <figure className="my-6 border-l-2 border-[#A5764F]/70 py-1 pl-5">
      <blockquote className="font-serif text-[20px] italic leading-[1.55] text-[#3F3A33] sm:text-[22px]">
        {block.text}
      </blockquote>
      {(block.attribution || block.source) && (
        <figcaption className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#948A7D]">
          {block.attribution}
          {block.attribution && block.source ? ' · ' : ''}
          {href ? (
            <a
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="underline decoration-[#C9BBA8] underline-offset-2 hover:text-[#2F2B26]"
            >
              {block.source}
            </a>
          ) : (
            block.source
          )}
        </figcaption>
      )}
    </figure>
  );
}

function InsightBlock({ block }: { block: PierrotInsightBlock }) {
  return (
    <aside className="my-5 border-l border-[#C9BBA8] pl-4">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#A5764F]">
        {block.label || 'Note'}
      </p>
      <p className="mt-1 font-serif text-[14.5px] leading-[1.7] text-[#5B544A]">{block.text}</p>
    </aside>
  );
}

function ComparisonWrapper({ block }: { block: PierrotComparisonBlock }) {
  return <PierrotComparison block={block} />;
}

function SourceBlock({ block }: { block: PierrotSourceBlock }) {
  return (
    <details className="my-5 border-t border-[#E4DCCF] pt-2.5">
      <summary className="cursor-pointer select-none font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8A8175] transition-colors hover:text-[#5B544A]">
        {block.title || 'Sources'} · {block.sources.length}
      </summary>
      <ul className="mt-2.5 space-y-3">
        {block.sources.map((source, index) => {
          const href = source.url ? safeMarkdownUrl(source.url) : null;

          return (
            <li
              key={`${source.label}-${index}`}
              className="border-t border-[#E9E1D5] pt-2.5 first:border-0 first:pt-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-sans text-[11.5px] font-semibold leading-snug text-[#4D463D]">
                  {source.label}
                </span>
                {source.confidence && (
                  <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.08em] text-[#9C9284]">
                    {source.confidence}
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-mono text-[8px] uppercase leading-relaxed tracking-[0.08em] text-[#A49A8C]">
                {[source.source, source.date, source.method].filter(Boolean).join(' · ')}
              </p>
              {source.excerpt && (
                <p className="mt-1.5 font-serif text-[12px] leading-[1.65] text-[#625B50]">
                  {source.excerpt}
                </p>
              )}
              {href && (
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="mt-1 inline-flex font-mono text-[8px] uppercase tracking-[0.1em] text-[#8A6A4F] underline decoration-[#B08A5A]/50 underline-offset-2 hover:text-[#5B3F2A]"
                >
                  Open source ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {block.coverage && (
        <p className="mt-2 font-mono text-[8px] leading-relaxed text-[#948A7D]">{block.coverage}</p>
      )}
      {block.limitations && block.limitations.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {block.limitations.map((limitation) => (
            <li key={limitation} className="font-serif text-[11px] leading-relaxed text-[#7A7268]">
              {limitation}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function WarningBlock({ block }: { block: PierrotWarningBlock }) {
  const color =
    block.level === 'critical'
      ? 'border-[#8A1235]/45 text-[#6E102A]'
      : block.level === 'warning'
        ? 'border-[#A5764F]/50 text-[#6B4B33]'
        : 'border-[#C9BBA8] text-[#5B544A]';

  return (
    <aside className={`my-5 border-l-2 pl-4 ${color}`} role="note">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] opacity-70">
        {block.title ||
          (block.level === 'critical'
            ? 'Failure'
            : block.level === 'warning'
              ? 'Limitation'
              : 'Note')}
      </p>
      <p className="mt-1 font-serif text-[13.5px] leading-[1.7]">{block.text}</p>
    </aside>
  );
}

function ProgressBlock({ block }: { block: PierrotProgressBlock }) {
  return (
    <section className="my-6 min-w-0" aria-label={block.title || 'Progress'}>
      {block.title && (
        <h3 className="mb-2 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#948A7D]">
          {block.title}
        </h3>
      )}
      <div className="space-y-3">
        {block.items.map((item, index) => {
          const ratio =
            item.target && item.target > 0
              ? Math.max(0, Math.min(1, item.value / item.target))
              : null;

          return (
            <div key={`${item.label}-${index}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-[13.5px] text-[#37332D]">{item.label}</span>
                <span className="font-mono text-[9px] text-[#7A7268]">
                  {formatMetricValue(item.value, item.unit, 'en')}
                  {item.target != null ? ` / ${formatMetricValue(item.target, item.unit, 'en')}` : ''}
                </span>
              </div>
              <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[#EDE6DB]">
                <div
                  className={`h-full ${
                    item.status === 'blocked'
                      ? 'bg-[#8A1235]'
                      : item.status === 'complete'
                        ? 'bg-[#5F735A]'
                        : 'bg-[#A5764F]'
                  }`}
                  style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }}
                />
              </div>
              {item.note && (
                <p className="mt-1 font-serif text-[11px] leading-relaxed text-[#7A7268]">
                  {item.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {block.period && (
        <p className="mt-2 font-mono text-[8px] text-[#948A7D]">{block.period}</p>
      )}
    </section>
  );
}

function ProjectStatusBlock({ block }: { block: PierrotProjectStatusBlock }) {
  const statusLabel = block.status.replace(/_/g, ' ');

  return (
    <section className="my-6 min-w-0" aria-label={`${block.projectName}: ${statusLabel}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E4DCCF] pb-2">
        <h3 className="font-serif text-[19px] leading-snug text-[#211F1F]">
          {block.projectName}
        </h3>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#A5764F]">
          {statusLabel}
        </span>
      </div>
      {block.statusReason && (
        <p className="mt-2 max-w-2xl font-serif text-[13px] leading-relaxed text-[#625B50]">
          {block.statusReason}
        </p>
      )}
      {(block.completed != null || block.remaining != null || block.decisions != null) && (
        <dl className="mt-4 grid grid-cols-3 gap-4">
          {[
            ['Completed', block.completed],
            ['Remaining', block.remaining],
            ['Decisions', block.decisions],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-t border-[#DED4C6] pt-2">
              <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#948A7D]">
                {label}
              </dt>
              <dd className="mt-0.5 font-serif text-[22px] leading-none text-[#211F1F]">
                {value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {block.workstreams && block.workstreams.length > 0 && (
        <ul className="mt-4 space-y-2">
          {block.workstreams.map((stream, index) => (
            <li
              key={`${stream.name}-${index}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#EEE8DE] pt-2"
            >
              <span className="font-serif text-[13.5px] text-[#37332D]">
                {stream.name}
                <span className="ml-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#A49A8C]">
                  {stream.entityType}
                </span>
              </span>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[#8A8175]">
                {[
                  stream.status,
                  stream.openTasks != null ? `${stream.openTasks} open` : null,
                  stream.completedTasks != null ? `${stream.completedTasks} done` : null,
                  stream.deliverables != null ? `${stream.deliverables} deliverables` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {stream.note && (
                <p className="w-full font-serif text-[11px] leading-relaxed text-[#7A7268]">
                  {stream.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {block.period && (
        <p className="mt-2 font-mono text-[8px] text-[#948A7D]">{block.period}</p>
      )}
    </section>
  );
}

function renderBlock(
  block: PierrotContentBlock,
  language: 'ru' | 'en',
  index: number
): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <PierrotMarkdown key={index} content={block.markdown} />;
    case 'heading':
      return <HeadingBlock key={index} block={block} />;
    case 'metric':
      return <MetricBlock key={index} block={block} language={language} />;
    case 'chart':
      return <PierrotChart key={index} block={block} />;
    case 'table':
      return <TableBlock key={index} block={block} />;
    case 'timeline':
      return <PierrotTimeline key={index} block={block} />;
    case 'diagram':
      return <PierrotDiagram key={index} block={block} />;
    case 'comparison':
      return <ComparisonWrapper key={index} block={block} />;
    case 'quote':
      return <QuoteBlock key={index} block={block} />;
    case 'gallery':
      return <PierrotGallery key={index} block={block} />;
    case 'code':
      return <PierrotCode key={index} block={block} />;
    case 'insight':
      return <InsightBlock key={index} block={block} />;
    case 'source':
      return <SourceBlock key={index} block={block} />;
    case 'warning':
      return <WarningBlock key={index} block={block} />;
    case 'progress':
      return <ProgressBlock key={index} block={block} />;
    case 'project_status':
      return <ProjectStatusBlock key={index} block={block} />;
    default:
      return null;
  }
}

export default React.memo(function PierrotResponseRenderer({
  response,
  fallbackMarkdown,
}: {
  response: PierrotResponse;
  fallbackMarkdown: string;
}) {
  const validated = parsePierrotResponse(response);

  if (!validated) {
    return <PierrotMarkdown content={fallbackMarkdown} />;
  }

  const language = validated.language || 'en';

  return (
    <div data-pierrot-response className="min-w-0">
      {validated.blocks.map((block, index) => renderBlock(block, language, index))}
    </div>
  );
});
