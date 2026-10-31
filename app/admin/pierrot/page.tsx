import Link from 'next/link';
import { requireAdmin } from '@/lib/serverAuth';
import {
  loadConversationTranscript,
  loadPierrotDashboard,
  parseAnalyticsFilters,
  redactPersonalData,
  safeAnalyticsPeriodLabel,
  type ConversationSummary,
  type PierrotSnapshot,
  type Recommendation,
  type Insight,
} from '@/lib/analytics/pierrotIntelligence';
import DeleteConversationButton from './DeleteConversationButton';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="border-t border-[#D9D3CD] py-4">
      <p className="text-xs text-[#746D66]">{label}</p>
      <p className="mt-2 font-serif text-3xl text-[#211F1F]">
        {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
      </p>
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-[#89827B]">{detail}</p>}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#D9D3CD] pt-5">
      <h2 className="font-serif text-2xl text-[#211F1F]">{title}</h2>
      {description && (
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#746D66]">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Funnel({
  title,
  stages,
}: {
  title: string;
  stages: PierrotSnapshot['funnels']['postcard'];
}) {
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="border border-[#E5E1DC] bg-white/70 p-4">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">{title}</h3>
      <div className="mt-4 space-y-3">
        {stages.map((stage) => (
          <div key={stage.key}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span>{stage.label}</span>
              <span className="font-mono text-[11px]">{stage.value}</span>
            </div>
            <div className="mt-1 h-1.5 bg-[#EEE9E4]">
              <div
                className="h-full bg-[#990F3D]"
                style={{ width: `${Math.min(100, (stage.value / max) * 100)}%` }}
              />
            </div>
            {stage.note && (
              <p className="mt-1 text-[10px] leading-relaxed text-[#A29B94]">{stage.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversationRow({ item }: { item: ConversationSummary }) {
  return (
    <tr className="border-t border-[#EEE9E4] align-top">
      <td className="py-3 pr-3">
        <Link href={item.href} className="font-mono text-[11px] text-[#8B1E3F] hover:underline">
          {item.id.slice(-10)}
        </Link>
        <p className="mt-1 text-[10px] text-[#A29B94]">{formatDate(item.startedAt)}</p>
      </td>
      <td className="py-3 pr-3 text-xs">{item.language.toUpperCase()}</td>
      <td className="py-3 pr-3 text-xs">
        <span className="font-mono text-[10px] text-[#746D66]">{item.latestIntent || '—'}</span>
        <p className="mt-1 text-[10px] text-[#A29B94]">{item.startPage}</p>
      </td>
      <td className="py-3 pr-3 text-xs">{item.products.join(', ') || '—'}</td>
      <td className="py-3 pr-3 text-xs">
        {item.outcomes.join(', ')}
        {item.hasError && <span className="ml-1 text-[#8B1E3F]">error</span>}
      </td>
      <td className="py-3 text-xs">{item.lastMessageRole || '—'}</td>
    </tr>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="border border-[#E5E1DC] bg-white/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#746D66]">
          {insight.kind === 'observed' ? 'Observed' : 'Hypothesis'}
        </span>
        <span className="border border-[#E5E1DC] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#89827B]">
          confidence: {insight.confidence}
        </span>
      </div>
      <h3 className="mt-2 font-serif text-lg text-[#211F1F]">{insight.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#625D58]">{insight.detail}</p>
      <p className="mt-2 text-[10px] text-[#A29B94]">
        Period: {safeAnalyticsPeriodLabel(insight.period.from, insight.period.to)} · sample:{' '}
        {insight.sampleSize}
      </p>
      {insight.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {insight.evidence.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border border-[#E5E1DC] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#746D66] hover:border-[#990F3D] hover:text-[#8B1E3F]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

function RecommendationCard({ item }: { item: Recommendation }) {
  return (
    <article className="border border-[#E7C9D2] bg-[#F8EAF0]/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8B1E3F]">
          Proposal only · not applied
        </span>
        <span className="border border-[#E7C9D2] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#8B1E3F]">
          confidence: {item.confidence}
        </span>
      </div>
      <h3 className="mt-2 font-serif text-lg text-[#211F1F]">{item.problem}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#625D58]">
        <strong className="font-medium text-[#211F1F]">Recommended change:</strong>{' '}
        {item.recommendedChange}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#625D58]">
        <strong className="font-medium text-[#211F1F]">Success criterion:</strong>{' '}
        {item.successCriterion}
      </p>
      <p className="mt-2 text-[10px] text-[#A29B94]">
        Period: {safeAnalyticsPeriodLabel(item.period.from, item.period.to)} · sample:{' '}
        {item.sampleSize}
      </p>
      {item.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.evidence.map((evidence) => (
            <Link
              key={evidence.href}
              href={evidence.href}
              className="border border-[#E7C9D2] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#8B1E3F] hover:bg-white"
            >
              {evidence.label}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

function FilterForm({ filters }: { filters: ReturnType<typeof parseAnalyticsFilters> }) {
  return (
    <form
      method="get"
      className="grid gap-3 border border-[#E5E1DC] bg-white/80 p-4 md:grid-cols-3 lg:grid-cols-4"
    >
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        From
        <input
          name="from"
          type="date"
          defaultValue={filters.from.slice(0, 10)}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        />
      </label>
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        To
        <input
          name="to"
          type="date"
          defaultValue={filters.to.slice(0, 10)}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        />
      </label>
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        Language
        <select
          name="language"
          defaultValue={filters.language || ''}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        >
          <option value="">All</option>
          <option value="ru">RU</option>
          <option value="en">EN</option>
          <option value="und">und</option>
        </select>
      </label>
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        Intent
        <input
          name="intent"
          defaultValue={filters.intent || ''}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        />
      </label>
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        Product
        <input
          name="product"
          defaultValue={filters.product || ''}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        />
      </label>
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        Outcome
        <select
          name="outcome"
          defaultValue={filters.outcome || ''}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        >
          <option value="">All</option>
          <option value="purchase">Purchase</option>
          <option value="subscription">Subscription</option>
          <option value="lead">Lead</option>
          <option value="error">Error</option>
          <option value="none">None</option>
        </select>
      </label>
      <label className="text-[10px] uppercase tracking-wider text-[#746D66]">
        Search
        <input
          name="q"
          defaultValue={filters.q || ''}
          className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
        />
      </label>
      <label className="flex items-end gap-2 pb-1 text-[10px] uppercase tracking-wider text-[#746D66]">
        <input
          name="error"
          type="checkbox"
          value="1"
          defaultChecked={filters.error}
          className="h-4 w-4"
        />
        Errors only
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          className="bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}

export default async function PierrotIntelligencePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const params = searchParams || {};
  const filters = parseAnalyticsFilters(params);
  const conversationIdRaw = Array.isArray(params.conversation)
    ? params.conversation[0]
    : params.conversation;

  let snapshot: PierrotSnapshot | null = null;
  let loadError = '';
  let transcript: Awaited<ReturnType<typeof loadConversationTranscript>> = null;
  let transcriptError = '';

  try {
    snapshot = await loadPierrotDashboard(filters);
  } catch (error) {
    console.error('[admin/pierrot] analytics load failed:', error);
    loadError = 'Analytics data could not be loaded. No transcript data was sent to the browser.';
  }

  if (conversationIdRaw && /^[A-Za-z0-9_-]{8,64}$/.test(conversationIdRaw)) {
    try {
      transcript = await loadConversationTranscript(conversationIdRaw);
    } catch (error) {
      console.error('[admin/pierrot] transcript load failed:', error);
      transcriptError = 'This transcript could not be loaded.';
    }
  }

  return (
    <div className="space-y-10">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8B1E3F]">
          Private analytics
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">Pierrot Intelligence</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Aggregated from the existing conversation, event, subscription and lead tables. Full
          transcripts are loaded only when a conversation is explicitly opened. Confirmed outcomes
          come from trusted server events, not clicks.
        </p>
      </header>

      <FilterForm filters={filters} />

      {loadError && (
        <div className="border border-[#D9C2C8] bg-[#F8EAF0] p-4 text-sm text-[#8B1E3F]">
          {loadError}
        </div>
      )}

      {transcriptError && (
        <div className="border border-[#D9C2C8] bg-[#F8EAF0] p-4 text-sm text-[#8B1E3F]">
          {transcriptError}
        </div>
      )}

      {snapshot && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#746D66]">
            <span>
              Window: {safeAnalyticsPeriodLabel(snapshot.period.from, snapshot.period.to)} ·{' '}
              {snapshot.volume.conversations} conversations · {snapshot.volume.messages} messages ·{' '}
              {snapshot.volume.events} events
            </span>
            <span>
              {snapshot.volume.sampleSufficient
                ? 'Sample size: enough for directional comparison'
                : 'Small sample — treat insights as directional, not conclusive'}
            </span>
          </div>

          {transcript && (
            <Section
              title={`Transcript ${transcript.conversation.id.slice(-10)}`}
              description={`${transcript.conversation.language.toUpperCase()} · ${transcript.conversation.start_page} · started ${formatDate(
                transcript.conversation.started_at
              )} · retention policy applies`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <a
                  href={`/api/admin/pierrot/export?conversation=${encodeURIComponent(transcript.conversation.id)}`}
                  className="border border-[#D9D3CD] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#746D66] hover:border-[#990F3D]"
                >
                  Export JSON
                </a>
                <DeleteConversationButton conversationId={transcript.conversation.id} />
                <Link
                  href="/admin/pierrot"
                  className="font-mono text-[10px] uppercase tracking-wider text-[#8B1E3F]"
                >
                  Close transcript
                </Link>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                <div className="space-y-4">
                  {transcript.messages.length === 0 ? (
                    <p className="text-sm text-[#89827B]">
                      No messages remain for this conversation.
                    </p>
                  ) : (
                    transcript.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`border p-3 ${
                          message.role === 'user'
                            ? 'border-[#E5E1DC] bg-white/80'
                            : 'border-[#E7C9D2] bg-[#F8EAF0]/40'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-wider text-[#89827B]">
                          <span>{message.role}</span>
                          <span>
                            #{message.message_index} · {formatDate(message.created_at)}
                            {message.provider ? ` · ${message.provider}` : ''}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#37332D]">
                          {redactPersonalData(message.content)}
                        </p>
                      </article>
                    ))
                  )}
                </div>

                <aside className="space-y-3">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                    Events & outcomes
                  </h3>
                  {transcript.events.length === 0 && (
                    <p className="text-xs text-[#89827B]">No events recorded.</p>
                  )}
                  {transcript.events.map((event) => (
                    <div
                      key={`${event.event_key}:${event.created_at}`}
                      className="border border-[#E5E1DC] bg-white/70 p-2.5"
                    >
                      <p className="font-mono text-[10px] text-[#211F1F]">{event.event_name}</p>
                      <p className="mt-1 text-[10px] text-[#89827B]">
                        {formatDate(event.created_at)}
                      </p>
                      {event.payload && Object.keys(event.payload).length > 0 && (
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-[#746D66]">
                          {JSON.stringify(event.payload)}
                        </pre>
                      )}
                    </div>
                  ))}

                  {transcript.subscriptionEvents.length > 0 && (
                    <div className="border border-[#E5E1DC] bg-white/70 p-2.5">
                      <p className="font-mono text-[10px] text-[#211F1F]">subscription_events</p>
                      {transcript.subscriptionEvents.map((event) => (
                        <p key={event.event_key} className="mt-1 text-[10px] text-[#746D66]">
                          {event.event_name} · {formatDate(event.created_at)}
                        </p>
                      ))}
                    </div>
                  )}

                  {transcript.lead && (
                    <div className="border border-[#E5E1DC] bg-white/70 p-2.5 text-[11px] text-[#625D58]">
                      <p className="font-mono text-[10px] text-[#211F1F]">service lead</p>
                      <p className="mt-1">status: {transcript.lead.status}</p>
                      <p>need: {transcript.lead.need_type || '—'}</p>
                      <p>stage: {transcript.lead.stage || '—'}</p>
                      <p>timeline: {transcript.lead.timeline || '—'}</p>
                    </div>
                  )}
                </aside>
              </div>
            </Section>
          )}

          <Section
            title="Overview"
            description="Counts are calculated on the server from the selected observation window. A click is never treated as a purchase."
          >
            <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Conversations started"
                value={snapshot.overview.conversationsStarted}
              />
              <Metric
                label="Conversations with replies"
                value={snapshot.overview.conversationsWithReplies}
              />
              <Metric
                label="Confirmed subscriptions"
                value={snapshot.overview.confirmedSubscriptions}
                detail="subscription_confirmed events attributed to Pierrot"
              />
              <Metric
                label="Subscriber catalogue"
                value={snapshot.overview.subscribers.confirmed}
                detail={`${snapshot.overview.subscribers.total} total · ${snapshot.overview.subscribers.pending} pending · ${snapshot.overview.subscribers.unsubscribed} unsubscribed`}
              />
              <Metric
                label="Confirmed purchases"
                value={snapshot.overview.confirmedPurchases}
                detail="postcard orders PAID+ and attributed UNFRAMED Stripe confirmations"
              />
              <Metric
                label="Qualified service leads"
                value={snapshot.overview.qualifiedLeads}
                detail="status is no longer new"
              />
              <Metric
                label="Pierrot errors"
                value={snapshot.overview.errors}
                detail="assistant_failed events"
              />
              <Metric
                label="Unresolved conversations"
                value={snapshot.overview.unresolved}
                detail="unknown/uncertain or failed reply"
              />
              <Metric
                label="Offers clicked"
                value={snapshot.overview.offerTransitions.reduce(
                  (sum, item) => sum + item.value,
                  0
                )}
                detail="distinct conversations by offer"
              />
            </div>

            <div className="mt-6 grid gap-x-8 gap-y-3 border-t border-[#EEE9E4] pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Answers completed"
                value={snapshot.overview.answers.replied}
                detail="assistant_replied events"
              />
              <Metric
                label="Answers failed"
                value={snapshot.overview.answers.failed}
                detail="assistant_failed events"
              />
              <Metric
                label="Answer feedback"
                value={snapshot.overview.feedback.up}
                detail={`${snapshot.overview.feedback.down} down`}
              />
              <Metric
                label="Handover requests"
                value={snapshot.overview.handover.requested}
                detail={`${snapshot.overview.handover.accepted} accepted · ${snapshot.overview.handover.declined} declined · ${snapshot.overview.handover.expired} expired`}
              />
              <Metric
                label="Brain retrieval"
                value={snapshot.overview.retrieval.attempts}
                detail={`${snapshot.overview.retrieval.relevant} relevant · ${snapshot.overview.retrieval.noMatch} no match · ${snapshot.overview.retrieval.unavailable} unavailable`}
              />
              <Metric
                label="Context used"
                value={snapshot.overview.retrieval.contextUsed}
                detail={`${snapshot.overview.retrieval.documents} documents · ${snapshot.overview.retrieval.chunks} chunks`}
              />
              <Metric
                label="Media retrieval"
                value={snapshot.overview.retrieval.media}
                detail="Media Archive retrieval events"
              />
              <Metric
                label="Retrieval latency"
                value={
                  snapshot.overview.retrieval.averageLatencyMs === null
                    ? '—'
                    : snapshot.overview.retrieval.averageLatencyMs
                }
                detail="average ms; — means no measured events"
              />
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                  Intent distribution
                </h3>
                {snapshot.overview.intents.length === 0 ? (
                  <p className="mt-2 text-sm text-[#89827B]">
                    No classified intents in this window.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {snapshot.overview.intents.map((item) => (
                      <li
                        key={item.key}
                        className="flex justify-between gap-3 border-b border-[#EEE9E4] py-1.5"
                      >
                        <span>{item.key}</span>
                        <span className="font-mono text-xs">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                  Offer transitions
                </h3>
                {snapshot.overview.offerTransitions.length === 0 ? (
                  <p className="mt-2 text-sm text-[#89827B]">No CTA clicks in this window.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {snapshot.overview.offerTransitions.map((item) => (
                      <li
                        key={item.key}
                        className="flex justify-between gap-3 border-b border-[#EEE9E4] py-1.5"
                      >
                        <span>{item.key}</span>
                        <span className="font-mono text-xs">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          <Section
            title="Funnels"
            description="Each stage is a distinct conversation or trusted event. Retailer purchases for UNFRAMED are not observable and are excluded."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Funnel title="Heart & Angel postcard" stages={snapshot.funnels.postcard} />
              <Funnel title="Journal / Flow" stages={snapshot.funnels.journal} />
              <Funnel title="Art Engine / Advising" stages={snapshot.funnels.art_engine} />
              <Funnel title="UNFRAMED" stages={snapshot.funnels.unframed} />
            </div>
          </Section>

          <Section
            title="Conversations"
            description="Filtered list. Open a conversation to load its transcript; transcripts are never sent as part of the aggregate payload."
          >
            {snapshot.conversations.length === 0 ? (
              <div className="border border-[#E5E1DC] bg-white/70 p-6 text-sm text-[#746D66]">
                No conversations match this window and filter set.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                      <th className="pb-2 pr-3">Conversation</th>
                      <th className="pb-2 pr-3">Lang</th>
                      <th className="pb-2 pr-3">Intent / page</th>
                      <th className="pb-2 pr-3">Products</th>
                      <th className="pb-2 pr-3">Outcome</th>
                      <th className="pb-2">Last message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.conversations.map((item) => (
                      <ConversationRow key={item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Needs attention"
            description="Deterministic flags from failures, unresolved intents, negative feedback, missing replies and open handover requests. Small samples remain directional."
          >
            {snapshot.attention.length === 0 ? (
              <p className="text-sm text-[#89827B]">No conversations require attention in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                      <th className="pb-2 pr-3">Severity</th>
                      <th className="pb-2 pr-3">Conversation</th>
                      <th className="pb-2 pr-3">Reason</th>
                      <th className="pb-2">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.attention.slice(0, 20).map((item) => (
                      <tr key={item.id} className="border-t border-[#EEE9E4] align-top">
                        <td className="py-3 pr-3 font-mono text-[10px] uppercase tracking-wider text-[#8B1E3F]">
                          {item.severity}
                        </td>
                        <td className="py-3 pr-3">{item.title}</td>
                        <td className="py-3 pr-3 text-[#625D58]">{item.reason}</td>
                        <td className="py-3">
                          <Link href={item.href} className="text-[#8B1E3F] underline">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Insights"
            description="Observed facts are separated from hypotheses. Price objections are not treated as proof that price caused an exit."
          >
            {snapshot.insights.length === 0 ? (
              <p className="text-sm text-[#89827B]">
                No automatic insights for this window. The sample may be empty or too small.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {snapshot.insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Improvement proposals"
            description="Proposals only. No prompt, route, catalogue or commercial term has been changed automatically."
          >
            {snapshot.recommendations.length === 0 ? (
              <p className="text-sm text-[#89827B]">
                No recommendations yet. More data is needed for a defensible proposal.
              </p>
            ) : (
              <div className="space-y-4">
                {snapshot.recommendations.map((item) => (
                  <RecommendationCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Privacy & data controls"
            description="Server-side retention and explicit owner actions."
          >
            <ul className="space-y-2 text-sm leading-relaxed text-[#625D58]">
              <li>
                Conversations, messages and events are retained for 90 days by the existing
                retention policy.
              </li>
              <li>
                `purge_expired_pierrot_conversations()` runs from the scheduled
                `/api/cron/pierrot-retention` job.
              </li>
              <li>
                Exports and deletions require an authenticated ADMIN session; a hidden link is not
                treated as protection.
              </li>
              <li>
                Analytics payloads exclude email addresses, recipient addresses and personal message
                content.
              </li>
              <li>No external model receives transcripts from this dashboard.</li>
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
