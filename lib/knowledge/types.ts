/**
 * Phase B contracts for the isolated UNFRAMED parser/chunker prototype.
 *
 * These types are deliberately free of database, Supabase, API-route and
 * Pierrot concepts. They describe only deterministic local parsing output.
 */

export type UnframedSectionType =
  | 'introduction'
  | 'prologue'
  | 'chapter'
  | 'epilogue';

export type UnframedPart = {
  index: number;
  heading: string;
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
};

export type UnframedParagraph = {
  text: string;
  charStart: number;
  charEnd: number;
};

export type UnframedSection = {
  index: number;
  type: UnframedSectionType;
  heading: string;
  part: string | null;
  sectionPath: string[];
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
  paragraphCount: number;
};

export type UnframedParsedSection = UnframedSection & {
  /** Start of the body after the heading line, in normalized source coordinates. */
  bodyStart: number;
  /** End of the body, before the next heading or EOF. */
  bodyEnd: number;
  paragraphs: UnframedParagraph[];
};

export type UnframedParsedDocument = {
  sourcePath: string;
  normalized: string;
  sourceSha256: string;
  bodyStart: number;
  bodyEnd: number;
  parts: UnframedPart[];
  sections: UnframedParsedSection[];
};

export type UnframedChunk = {
  id: string;
  index: number;
  sectionIndex: number;
  sectionPath: string[];
  heading: string;
  /** Original passage text. Never written to the dry-run summary or manifest. */
  text: string;
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
  charCount: number;
  contentHash: string;
};

export type UnframedManifestChunk = Omit<UnframedChunk, 'text'>;

export type UnframedManifest = {
  schemaVersion: 1;
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  documentId: string;
  sourceCharCount: number;
  sourceWordCount: number;
  bodyCharCount: number;
  bodyWordCount: number;
  partCount: number;
  chapterCount: number;
  sectionCount: number;
  chunkCount: number;
  sections: UnframedSection[];
  chunks: UnframedManifestChunk[];
  manifestHash: string;
};

export type ManifestChecks = {
  tocExcluded: boolean;
  sectionBoundaries: boolean;
  offsetsValid: boolean;
  uniqueChunkIds: boolean;
  sectionPathsValid: boolean;
  maxChunkCharsRespected: boolean;
};

export type UnframedBuild = {
  manifest: UnframedManifest;
  document: UnframedParsedDocument;
  chunks: UnframedChunk[];
  checks: ManifestChecks;
};

export class SourceHashMismatchError extends Error {
  readonly code = 'source_hash_mismatch';

  constructor(expected: string, actual: string) {
    super(`source_hash_mismatch expected=${expected} actual=${actual}`);
    this.name = 'SourceHashMismatchError';
  }
}

export class ManuscriptStructureError extends Error {
  readonly code = 'manuscript_structure';

  constructor(reason: string) {
    super(`manuscript_structure reason=${reason}`);
    this.name = 'ManuscriptStructureError';
  }
}
