# Media Archive source bundle: «Ярмарка интеллекта»

Record: `775e8169-a02e-4b64-b3f8-e3722a48c28f`

## Provenance

- Original: <https://www.expertiza.org/MAYDAYCO/CDPRO/Pilot.pdf>
- Publication: газета «CDпро.ru», №27, 2001
- Signed for print: 10.12.2001
- PDF pages: 16
- Article: «Ярмарка интеллекта», byline «Антон (Палыч) МЕРКУРОВ»
- Article page: PDF page 3 = printed page 3

The PDF page 2 is the editor-in-chief's New Year editorial «Праздник обновления»,
not part of «Ярмарка интеллекта». The owner task describes the article as being
on the 2–3 spread; the signed article and its headline are physically on page 3.

## Files

- `Pilot.pdf` — unchanged original download, 1,716,581 bytes,
  SHA-256 `b86b1dc5e4ef6f48c3563d0293e77873a0bcf9500803f3cddd8a12c41c041acf`;
- `yarmarka-intellekta.txt` — proofread UTF-8 article text, 32 paragraphs plus
  the byline, 13,381 bytes, SHA-256
  `59141b0aa36b37938dc677013371f239402f39da2c6f21a09b455d89e46460a3`;
- `manifest.json` — machine-readable provenance and the planned record patch.

Normalized article content hash (SHA-256 of the trimmed text):
`fc485f44fd9fa9814dc72527aad4b1a83bc40f6678833134575e01efa906adbe`.

## OCR review

The PDF contains an OCR text layer. The cleaned text was proofread against that
layer; the non-space character sequence is identical, so nothing was added or
removed from the article body. The cleanup fixes presentation only:

- joined mid-word line breaks and removed `U+0019`, `U+0008`, `U+0010`
  line-break artefacts;
- restored compound hyphens: `компакт-диски`, `CD-ROM`, `10-процентный`,
  `что-то`, `какие-то`;
- removed OCR commas that stood for end-of-line hyphens and restored spaces
  around dashes;
- normalized quotation marks to `« »`;
- fixed split words such as `28ноября`, `издательст ва`, `Толки ена` and
  `СD` → `CD`;
- preserved the original 2001 spelling and the stylized fair name
  `«non/fictio№3»`.

## Archive and Brain update

The original PDF and cleaned text are archived in the private `brain-sources`
bucket under content-addressed paths:

- PDF: `brain-sources/b8/b86b1dc5…c041acf.pdf`
- text: `brain-sources/59/59141b0a…6460a3.txt`

The existing row is updated by id; the script never inserts a record:

- `source_format = 'text'`
- `source_path = 'brain-sources/59/59141b0a…6460a3.txt'`
- `source_sha256 = '59141b0a…6460a3'`
- `content_hash = 'fc485f44…906adbe'`
- `extraction_diagnostics` records the PDF path/hash/page count, article page,
  issue metadata, paragraph count and OCR review;
- `indexing_status = 'pending'`;
- the original PDF path stays in `extraction_diagnostics.originalPdf.sourcePath`
  and `ai_metadata.original_pdf_source_path`.

Brain then ingests the cleaned text with source format `text`, so retrieval uses
the proofread paragraphs, not the raw OCR line breaks.

## Runbook

Dry run:

```bash
npx tsx scripts/knowledge/import-media-archive-source.ts \
  --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f \
  --pdf data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/Pilot.pdf \
  --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt
```

Offline plan (no database required):

```bash
npx tsx scripts/knowledge/import-media-archive-source.ts --offline --json \
  --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f \
  --pdf data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/Pilot.pdf \
  --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt
```

Apply, ingest and verify:

```bash
npx tsx scripts/knowledge/import-media-archive-source.ts --apply \
  --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f \
  --pdf data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/Pilot.pdf \
  --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt
```

The apply step requires `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY` for storage/database access, plus the embedding
provider configuration used by Brain. It enqueues a media coverage job, runs one
inline job, then checks the job, coverage document, content hash and retrieval.
Repeated runs update the same record and knowledge document.
