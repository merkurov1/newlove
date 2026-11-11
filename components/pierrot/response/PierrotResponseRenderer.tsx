'use client';

import React from 'react';
import PierrotMarkdown, { safeMarkdownUrl } from '@/components/pierrot/PierrotMarkdown';
import { parsePierrotResponse } from '@/lib/pierrot/response/schema';
import type {
  PierrotComparisonBlock,
  PierrotContentBlock,
  PierrotInsightBlock,
  PierrotMetricBlock,
  PierrotQuoteBlock,
  PierrotResponse,
  PierrotTableBlock,
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
    default:
      return null;
  }
}

export default function PierrotResponseRenderer({
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
}
