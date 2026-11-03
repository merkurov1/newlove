import { getServerSupabaseClient } from '@/lib/serverAuth';
import { assertServerOnly } from '@/lib/serverOnly';
import type { VaultState } from './types';

assertServerOnly('lib/art-engine/repository');

function db() {
  return getServerSupabaseClient({ useServiceRole: true });
}

function isMissingVaultColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const record = error as Record<string, unknown>;
  const code = String(record.code || '');
  const message = String(record.message || '');

  return (
    code === 'PGRST204' ||
    (/vault/i.test(message) &&
      /column|schema cache/i.test(message))
  );
}

export async function findLotBySourceUrl(
  sourceUrl: string,
): Promise<Record<string, any> | null> {
  const { data, error } = await db()
    .from('lots')
    .select('*')
    .eq('source_url', sourceUrl)
    .maybeSingle();

  if (error) {
    console.warn('[ArtEngine] findLotBySourceUrl failed:', error);
    return null;
  }

  return data || null;
}

export async function findLotById(
  id: string,
): Promise<Record<string, any> | null> {
  const { data, error } = await db()
    .from('lots')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.warn('[ArtEngine] findLotById failed:', error);
    return null;
  }

  return data || null;
}

export interface UpsertLotResult {
  lot: Record<string, any> | null;
  vaultPersisted: boolean;
  warnings: string[];
}

export async function upsertLot(
  row: Record<string, any>,
): Promise<UpsertLotResult> {
  const warnings: string[] = [];
  const { data, error } = await db()
    .from('lots')
    .upsert(row, { onConflict: 'source_url' })
    .select('id, status, source_url, artist, title, image_path, vault')
    .single();

  if (!error && data) {
    return { lot: data, vaultPersisted: true, warnings };
  }

  if (error && isMissingVaultColumn(error)) {
    const { vault: _vault, ...withoutVault } = row;
    const retry = await db()
      .from('lots')
      .upsert(withoutVault, { onConflict: 'source_url' })
      .select('id, status, source_url, artist, title, image_path')
      .single();

    if (!retry.error && retry.data) {
      warnings.push(
        'Vault storage is not available yet: apply migrations/2026-11-03_art_engine_vault.sql (the separate RLS migration does not add the vault column).',
      );

      return {
        lot: retry.data,
        vaultPersisted: false,
        warnings,
      };
    }

    console.warn('[ArtEngine] upsert (without vault) failed:', retry.error);
    return { lot: null, vaultPersisted: false, warnings };
  }

  console.warn('[ArtEngine] upsert failed:', error);
  return { lot: null, vaultPersisted: false, warnings };
}

export async function updateLotById(
  id: string,
  row: Record<string, any>,
): Promise<UpsertLotResult> {
  const warnings: string[] = [];
  const { data, error } = await db()
    .from('lots')
    .update(row)
    .eq('id', id)
    .select('id, status, source_url, artist, title, image_path, vault')
    .single();

  if (!error && data) {
    return { lot: data, vaultPersisted: true, warnings };
  }

  if (error && isMissingVaultColumn(error)) {
    const { vault: _vault, ...withoutVault } = row;
    const retry = await db()
      .from('lots')
      .update(withoutVault)
      .eq('id', id)
      .select('id, status, source_url, artist, title, image_path')
      .single();

    if (!retry.error && retry.data) {
      warnings.push(
        'Vault storage is not available yet: apply migrations/2026-11-03_art_engine_vault.sql (the separate RLS migration does not add the vault column).',
      );

      return {
        lot: retry.data,
        vaultPersisted: false,
        warnings,
      };
    }

    console.warn('[ArtEngine] update (without vault) failed:', retry.error);
    return { lot: null, vaultPersisted: false, warnings };
  }

  console.warn('[ArtEngine] update failed:', error);
  return { lot: null, vaultPersisted: false, warnings };
}

export interface VaultListRow {
  id: string;
  artist: string;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  estimate: string | null;
  image_path: string | null;
  source_url: string | null;
  auction_house: string | null;
  status: string | null;
  created_at: string | null;
  ingestion_status: string | null;
  wikipedia_status: string | null;
  editorial_status: string | null;
  essay_version: number | null;
  publication_status: string | null;
  publication_url: string | null;
  warnings: string[];
  missing_fields: string[];
}

function safeVault(value: unknown): VaultState | null {
  if (!value || typeof value !== 'object') return null;
  return value as VaultState;
}

export function sanitizeVaultRow(row: Record<string, any>): VaultListRow {
  const vault = safeVault(row.vault);
  const ingestion = vault?.ingestion;

  return {
    id: String(row.id),
    artist: row.artist || '',
    title: row.title || '',
    year: row.year || null,
    medium: row.medium || null,
    dimensions: row.dimensions || null,
    estimate: row.estimate || null,
    image_path: row.image_path || null,
    source_url: row.source_url || null,
    auction_house: row.auction_house || null,
    status: row.status || null,
    created_at: row.created_at || null,
    ingestion_status: ingestion?.status || null,
    wikipedia_status: vault?.wikipedia?.status || null,
    editorial_status: vault?.editorial?.status || null,
    essay_version: vault?.editorial?.current?.version || null,
    publication_status: vault?.publication?.status || null,
    publication_url: vault?.publication?.slug
      ? `/${vault.publication.slug}`
      : null,
    warnings: ingestion?.warnings || [],
    missing_fields: ingestion?.missing_fields || [],
  };
}

export async function listVaultLots(limit = 18): Promise<VaultListRow[]> {
  const numericLimit = Number(limit);
  const safeLimit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(Math.trunc(numericLimit), 100))
    : 18;

  const { data, error } = await db()
    .from('lots')
    .select(
      'id, artist, title, year, medium, dimensions, estimate, image_path, source_url, auction_house, status, created_at, vault',
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (!error && Array.isArray(data)) {
    return data.map(sanitizeVaultRow);
  }

  if (error) {
    const retry = await db()
      .from('lots')
      .select(
        'id, artist, title, year, medium, dimensions, estimate, image_path, source_url, auction_house, status, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (!retry.error && Array.isArray(retry.data)) {
      return retry.data.map(sanitizeVaultRow);
    }
  }

  console.warn('[ArtEngine] listVaultLots failed:', error);
  return [];
}
