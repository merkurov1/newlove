'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import ArtEngineComposer from './ArtEngineComposer';
import ArtworkDossier from './ArtworkDossier';
import PublishPreview from './PublishPreview';
import VaultPanel from './VaultPanel';
import useComposerOffset from './useComposerOffset';
import type {
  ArtworkDetail,
  AttemptSummary,
  IngestionStatus,
  VaultFilter,
  VaultLot,
} from './types';

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

function statusTone(status?: string | null): string {
  if (status === 'ready') {
    return 'border-[#CFE0CC] bg-[#F2F7F1] text-[#4F6B4D]';
  }
  if (status === 'partial') {
    return 'border-[#E7CFA9] bg-[#FFF9EC] text-[#7A5A28]';
  }
  if (status === 'failed') {
    return 'border-[#E7C3BE] bg-[#FCF3F2] text-[#8B4038]';
  }
  return 'border-[#E4DCCF] bg-[#F8F5EF] text-[#6B6358]';
}

function dateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function failedAttemptFromResponse(url: string, data: any): AttemptSummary {
  return {
    id: String(data?.attempt_id || 'unknown'),
    url,
    status: 'failed',
    error_message: data?.error || data?.details || 'Extraction failed.',
    house: data?.parser?.house || null,
    parsed_title: null,
    execution_time_ms: null,
    created_at: new Date().toISOString(),
    parser: data?.parser?.name || null,
    parser_version: data?.parser?.version || null,
    lot_id: data?.lot_id || null,
    http_status: null,
    fetch_method: null,
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    errors: Array.isArray(data?.errors) ? data.errors : [],
    missing_fields: Array.isArray(data?.missing_fields) ? data.missing_fields : [],
    image_availability: null,
    image_original_url: null,
  };
}

export default function ArtEngineWorkspace({ authFetch }: { authFetch: AuthFetch }) {
  const [tab, setTab] = useState<'workspace' | 'vault'>('workspace');
  const [url, setUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<IngestionStatus | 'idle'>('idle');
  const [detail, setDetail] = useState<ArtworkDetail | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    tone: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [vaultLots, setVaultLots] = useState<VaultLot[]>([]);
  const [vaultAttempts, setVaultAttempts] = useState<AttemptSummary[]>([]);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultError, setVaultError] = useState('');
  const [vaultFilter, setVaultFilter] = useState<VaultFilter>('all');

  const topRef = useRef<HTMLDivElement | null>(null);
  const queryHandledRef = useRef(false);
  const bottomOffset = useComposerOffset();

  const scrollToTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const loadVault = useCallback(async () => {
    setVaultLoading(true);
    setVaultError('');

    try {
      const [lotsResponse, attemptsResponse] = await Promise.all([
        authFetch('/api/admin/art-engine/lots?limit=40'),
        authFetch('/api/admin/art-engine/attempts?limit=40'),
      ]);

      const lotsData = await lotsResponse.json().catch(() => ({}));
      const attemptsData = await attemptsResponse.json().catch(() => ({}));

      if (!lotsResponse.ok || !attemptsResponse.ok) {
        setVaultLots([]);
        setVaultAttempts([]);
        setVaultError(
          lotsResponse.status === 401 || attemptsResponse.status === 401
            ? 'Admin access is required to open the Vault.'
            : lotsData?.error || attemptsData?.error || 'Unable to load the Vault.'
        );
      } else {
        setVaultLots(Array.isArray(lotsData?.lots) ? lotsData.lots : []);
        setVaultAttempts(Array.isArray(attemptsData?.attempts) ? attemptsData.attempts : []);
      }
    } catch {
      setVaultLots([]);
      setVaultAttempts([]);
      setVaultError('Unable to load the Vault.');
    } finally {
      setVaultLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  const loadLot = useCallback(
    async (lotId: string) => {
      setNotice(null);

      try {
        const response = await authFetch(`/api/admin/art-engine/lots/${lotId}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setNotice(data?.error || 'Unable to open this Vault record.');
          return;
        }

        setDetail(data as ArtworkDetail);
        setSelectedAttempt(null);
        setTab('workspace');
        scrollToTop();
      } catch {
        setNotice('Unable to open this Vault record.');
      }
    },
    [authFetch, scrollToTop]
  );

  useEffect(() => {
    if (queryHandledRef.current) return;
    queryHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);

    if (params.get('view') === 'vault') {
      setTab('vault');
    }

    const lotId = params.get('lot');
    if (lotId) {
      void loadLot(lotId);
    }
  }, [loadLot]);

  const runWikipedia = async (lotId: string, silent = false, force = false) => {
    setAction('wikipedia');

    try {
      const response = await authFetch(`/api/admin/art-engine/lots/${lotId}/wikipedia`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (!silent) {
          setActionNotice({
            tone: 'error',
            message: data?.error || data?.warnings?.[0] || 'Wikipedia lookup failed.',
          });
        }
        return;
      }

      await loadLot(lotId);

      if (!silent) {
        setActionNotice({
          tone: data.status === 'found' ? 'success' : 'info',
          message:
            data.status === 'found'
              ? `Wikipedia context attached: ${data.wikipedia?.title}.`
              : data.warnings?.[0] || 'No confident Wikipedia match was found.',
        });
      }
    } catch {
      if (!silent) {
        setActionNotice({
          tone: 'error',
          message: 'Wikipedia lookup failed.',
        });
      }
    } finally {
      setAction(null);
    }
  };

  const generateEssay = async (regenerate: boolean, lotId: string) => {
    setAction(regenerate ? 'regenerate' : 'essay');

    try {
      const response = await authFetch(`/api/admin/art-engine/lots/${lotId}/essay`, {
        method: 'POST',
        body: JSON.stringify({ regenerate }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setActionNotice({
          tone: 'error',
          message: data?.details || data?.error || 'Essay generation failed.',
        });
        return;
      }

      await loadLot(lotId);
      setActionNotice({
        tone: 'success',
        message: regenerate
          ? `Essay version ${data.version} generated and saved.`
          : `Essay version ${data.version} generated and saved.`,
      });
    } catch {
      setActionNotice({
        tone: 'error',
        message: 'Essay generation failed.',
      });
    } finally {
      setAction(null);
    }
  };

  const confirmPublish = async () => {
    if (!detail) return;

    const lotId = detail.lot.id;
    const isUpdate =
      detail.publication?.status === 'published' || detail.publication?.status === 'update_pending';

    setAction('publish');
    setPublishError(null);

    try {
      const response = await authFetch(`/api/admin/art-engine/lots/${lotId}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          imageRightsConfirmed: true,
          mode: isUpdate ? 'update' : 'create',
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error || 'Publication failed.';
        setPublishError(message);
        setActionNotice({
          tone: 'error',
          message,
        });
        return;
      }

      setPublishOpen(false);
      await loadLot(lotId);
      await loadVault();
      setActionNotice({
        tone: 'success',
        message: data.unchanged
          ? 'This version is already published in Selection.'
          : data.updated
            ? 'Selection article updated.'
            : 'Published to Selection.',
      });
    } catch {
      setPublishError('Publication failed.');
      setActionNotice({
        tone: 'error',
        message: 'Publication failed.',
      });
    } finally {
      setAction(null);
    }
  };

  const handleSubmit = async () => {
    const trimmed = url.trim();

    if (!trimmed || processing || action) return;

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setNotice('Enter a valid HTTP or HTTPS auction URL.');
      return;
    }

    setProcessing(true);
    setStatus('extracting');
    setDetail(null);
    setSelectedAttempt(null);
    setNotice(null);
    setStorageNotice(null);
    setActionNotice(null);
    setTab('workspace');

    try {
      const response = await authFetch('/api/admin/parse-url', {
        method: 'POST',
        body: JSON.stringify({ url: parsed.toString() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus('failed');
        setSelectedAttempt(failedAttemptFromResponse(parsed.toString(), data));
        await loadVault();
        return;
      }

      setStatus((data.status as IngestionStatus) || 'ready');

      if (data.vault_persisted === false) {
        setStorageNotice(
          'Extraction succeeded, but Vault JSON storage is not available yet. Apply migrations/2026-11-03_art_engine_vault.sql to persist attempt state and research history.'
        );
      }

      if (data.lot_id) {
        const detailResponse = await authFetch(`/api/admin/art-engine/lots/${data.lot_id}`);
        const detailData = await detailResponse.json().catch(() => ({}));

        if (detailResponse.ok) {
          const loaded = detailData as ArtworkDetail;
          setDetail(loaded);
          setSelectedAttempt(null);

          if (loaded.lot?.artist && loaded.wikipedia?.status !== 'found') {
            void runWikipedia(loaded.lot.id, true);
          }
        } else {
          setNotice(
            detailData?.error || 'The lot was saved, but the Vault detail could not be loaded.'
          );
        }
      } else {
        setNotice('The lot was processed, but no Vault record was returned.');
      }

      setUrl('');
      await loadVault();
      scrollToTop();
    } catch (error) {
      setStatus('failed');
      setSelectedAttempt({
        ...failedAttemptFromResponse(parsed.toString(), {
          error: error instanceof Error ? error.message : 'Extraction failed.',
        }),
      });
    } finally {
      setProcessing(false);
    }
  };

  const openVaultLot = async (lotId: string) => {
    await loadLot(lotId);
  };

  const openVaultAttempt = async (attempt: AttemptSummary) => {
    if (attempt.lot_id) {
      await loadLot(attempt.lot_id);
      return;
    }

    setDetail(null);
    setSelectedAttempt(attempt);
    setTab('workspace');
    scrollToTop();
  };

  const workspaceCount = useMemo(() => {
    if (detail) return 1;
    if (selectedAttempt) return 1;
    return 0;
  }, [detail, selectedAttempt]);

  return (
    <div className="relative pb-[calc(10.5rem+env(safe-area-inset-bottom))]">
      <div ref={topRef} className="mx-auto max-w-7xl scroll-mt-28 px-4 sm:px-6">
        <header className="flex flex-col gap-4 pb-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-light tracking-tight text-[#211F1F] sm:text-4xl">
              Art Engine
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('workspace')}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                tab === 'workspace'
                  ? 'border-[#2B2723] bg-[#2B2723] text-[#FAF8F5]'
                  : 'border-[#E4DCCF] bg-white text-[#625B50] hover:border-[#CFC3B1] hover:text-[#211F1F]'
              }`}
            >
              Workspace
              {workspaceCount > 0 ? ` · ${workspaceCount}` : ''}
            </button>
            <button
              type="button"
              onClick={() => setTab('vault')}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                tab === 'vault'
                  ? 'border-[#2B2723] bg-[#2B2723] text-[#FAF8F5]'
                  : 'border-[#E4DCCF] bg-white text-[#625B50] hover:border-[#CFC3B1] hover:text-[#211F1F]'
              }`}
            >
              Vault · {vaultLots.length}
            </button>
          </div>
        </header>

        {notice && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#E7C3BE] bg-[#FCF3F2] px-4 py-3 text-[#8B4038]">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p className="font-mono text-[10px] leading-relaxed">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] underline underline-offset-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {storageNotice && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#E7CFA9] bg-[#FFF9EC] px-4 py-3 text-[#7A5A28]">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p className="font-mono text-[10px] leading-relaxed">{storageNotice}</p>
            <button
              type="button"
              onClick={() => setStorageNotice(null)}
              className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] underline underline-offset-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {actionNotice && (
          <div
            className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
              actionNotice.tone === 'error'
                ? 'border-[#E7C3BE] bg-[#FCF3F2] text-[#8B4038]'
                : actionNotice.tone === 'success'
                  ? 'border-[#CFE0CC] bg-[#F2F7F1] text-[#4F6B4D]'
                  : 'border-[#E4DCCF] bg-[#F8F5EF] text-[#625B50]'
            }`}
          >
            <p className="font-mono text-[10px] leading-relaxed">{actionNotice.message}</p>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] underline underline-offset-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {tab === 'vault' ? (
          <VaultPanel
            lots={vaultLots}
            attempts={vaultAttempts}
            loading={vaultLoading}
            error={vaultError}
            filter={vaultFilter}
            onFilterChange={setVaultFilter}
            onOpenLot={openVaultLot}
            onOpenAttempt={openVaultAttempt}
            onRefresh={loadVault}
          />
        ) : detail ? (
          <ArtworkDossier
            detail={detail}
            action={action}
            onFindWikipedia={() => void runWikipedia(detail.lot.id, false, true)}
            onGenerateEssay={() => void generateEssay(false, detail.lot.id)}
            onRegenerateEssay={() => void generateEssay(true, detail.lot.id)}
            onPublish={() => {
              setPublishError(null);
              setPublishOpen(true);
            }}
          />
        ) : selectedAttempt ? (
          <FailedAttemptDetail
            attempt={selectedAttempt}
            onBack={() => {
              setSelectedAttempt(null);
              setTab('vault');
            }}
          />
        ) : processing ? (
          <ProcessingState status={status} url={url} />
        ) : (
          <EmptyWorkspace
            status={status}
            lots={vaultLots}
            onOpenLot={openVaultLot}
            onOpenVault={() => setTab('vault')}
          />
        )}
      </div>

      <ArtEngineComposer
        value={url}
        onChange={(value) => {
          setUrl(value);
          if (!processing) setStatus('idle');
        }}
        onSubmit={handleSubmit}
        status={status}
        processing={processing || action !== null}
        bottomOffset={bottomOffset}
      />

      {publishOpen && detail && (
        <PublishPreview
          detail={detail}
          publishing={action === 'publish'}
          error={publishError}
          onClose={() => {
            if (action !== 'publish') setPublishOpen(false);
          }}
          onConfirm={() => void confirmPublish()}
        />
      )}
    </div>
  );
}

function EmptyWorkspace({
  status,
  lots,
  onOpenLot,
  onOpenVault,
}: {
  status: IngestionStatus | 'idle';
  lots: VaultLot[];
  onOpenLot: (id: string) => void;
  onOpenVault: () => void;
}) {
  return (
    <div className="py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#E4DCCF] bg-white px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#6B6358]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8CA18A]" />
          {status === 'idle' ? 'Waiting for an auction URL' : status}
        </span>

        <h2 className="mt-5 font-serif text-[2rem] font-light leading-tight text-[#211F1F] sm:text-[2.8rem]">
          Paste a lot URL.
          <br />
          The record appears here.
        </h2>

        <p className="mx-auto mt-4 max-w-lg font-serif text-base italic leading-relaxed text-[#6B6358] sm:text-lg">
          Christie’s, Sotheby’s, Phillips and Bonhams. The original auction image, catalogue data,
          extraction status and warnings stay in one place.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]">
          <span>Ready</span>
          <span className="h-1 w-1 rounded-full bg-[#C9BDAE]" />
          <span>Partial</span>
          <span className="h-1 w-1 rounded-full bg-[#C9BDAE]" />
          <span>Failed</span>
          <span className="h-1 w-1 rounded-full bg-[#C9BDAE]" />
          <span>Every attempt is kept</span>
        </div>
      </div>

      {lots.length > 0 && (
        <div className="mx-auto mt-14 hidden max-w-4xl sm:block">
          <div className="flex items-end justify-between gap-3 border-b border-[#E4DCCF] pb-3">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
              Recent Vault records
            </h3>
            <button
              type="button"
              onClick={onOpenVault}
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#625B50] underline decoration-[#B9AB98] underline-offset-4 hover:text-black"
            >
              Open Vault
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {lots.slice(0, 3).map((lot) => (
              <button
                key={lot.id}
                type="button"
                onClick={() => onOpenLot(lot.id)}
                className="rounded-xl border border-[#E4DCCF] bg-white px-4 py-3 text-left transition hover:border-[#CFC3B1] hover:shadow-sm"
              >
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${statusTone(lot.ingestion_status)}`}
                >
                  {lot.ingestion_status || 'legacy'}
                </span>
                <p className="mt-2 truncate font-serif text-base text-[#211F1F]">
                  {lot.artist || 'Artist not extracted'}
                </p>
                <p className="mt-0.5 truncate font-serif text-xs italic text-[#6B6358]">
                  {lot.title || 'Title not extracted'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProcessingState({ status, url }: { status: IngestionStatus | 'idle'; url: string }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center py-16 text-center">
      <Loader2 size={22} className="animate-spin text-[#8A8175]" />
      <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#9A9083]">
        {status === 'queued' ? 'Queued' : 'Extracting auction lot'}
      </p>
      <h2 className="mt-3 font-serif text-2xl font-light text-[#211F1F]">
        Reading the original catalogue page
      </h2>
      <p className="mt-3 max-w-md break-all font-mono text-[10px] leading-relaxed text-[#8A8175]">
        {url}
      </p>
      <p className="mt-5 max-w-sm font-serif text-sm italic leading-relaxed text-[#6B6358]">
        The parser is preserving the auction house’s own data. Missing fields stay missing.
      </p>
    </div>
  );
}

function FailedAttemptDetail({ attempt, onBack }: { attempt: AttemptSummary; onBack: () => void }) {
  return (
    <article className="mx-auto max-w-2xl py-10 sm:py-14">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#625B50] hover:text-black"
      >
        <ArrowLeft size={13} />
        Back to Vault
      </button>

      <div className="mt-6 border-b border-[#E4DCCF] pb-5">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] ${statusTone(attempt.status)}`}
        >
          {attempt.status}
        </span>
        <h1 className="mt-4 font-serif text-3xl font-light text-[#211F1F]">
          Attempt {attempt.id.slice(0, 8)}
        </h1>
        <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-[#8A8175]">
          {attempt.url}
        </p>
      </div>

      <dl className="mt-5 divide-y divide-[#ECE6DC]">
        <div className="grid grid-cols-[7rem_1fr] gap-4 py-2.5">
          <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
            Domain
          </dt>
          <dd className="font-mono text-[10px] text-[#4A443D]">{domainOf(attempt.url)}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-4 py-2.5">
          <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">When</dt>
          <dd className="font-mono text-[10px] text-[#4A443D]">{dateTime(attempt.created_at)}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-4 py-2.5">
          <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
            Parser
          </dt>
          <dd className="font-mono text-[10px] text-[#4A443D]">
            {attempt.parser || '—'}
            {attempt.parser_version ? ` v${attempt.parser_version}` : ''}
          </dd>
        </div>
        {attempt.http_status && (
          <div className="grid grid-cols-[7rem_1fr] gap-4 py-2.5">
            <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
              HTTP
            </dt>
            <dd className="font-mono text-[10px] text-[#4A443D]">{attempt.http_status}</dd>
          </div>
        )}
      </dl>

      {attempt.error_message && (
        <div className="mt-6 rounded-2xl border border-[#E7C3BE] bg-[#FCF3F2] px-4 py-3">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#8B4038]">Error</p>
          <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[#8B4038]">
            {attempt.error_message}
          </p>
        </div>
      )}

      {attempt.warnings.length > 0 && (
        <div className="mt-5 space-y-1.5">
          {attempt.warnings.map((warning, index) => (
            <p
              key={`${warning}-${index}`}
              className="font-mono text-[9px] leading-relaxed text-[#8A5A2B]"
            >
              ! {warning}
            </p>
          ))}
        </div>
      )}

      {attempt.missing_fields.length > 0 && (
        <p className="mt-4 font-mono text-[9px] text-[#8A8175]">
          Missing: {attempt.missing_fields.join(', ')}
        </p>
      )}
    </article>
  );
}
