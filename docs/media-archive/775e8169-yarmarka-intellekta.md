# Media Archive source bundle: «Ярмарка интеллекта»

Record: `775e8169-a02e-4b64-b3f8-e3722a48c28f`

## Provenance

- Original: <https://www.expertiza.org/MAYDAYCO/CDPRO/Pilot.pdf>
- Publication: газета «CDпро.ru», №27, 2001
- Signed for print: 10.12.2001
- PDF pages: 16
- Article: «Ярмарка интеллекта», byline «Антон (Палыч) МЕРКУРОВ»
- Article page: PDF page 3 = printed page 3
- Owner-described printed spread: pages 2–3

PDF page 1 is the cover, page 2 is the editor-in-chief's New Year editorial
«Праздник обновления», and the signed article «Ярмарка интеллекта» starts and
ends on page 3. The owner task describes the article as being on the 2–3
spread; `articlePages` therefore records the text page `[3]`, while
`articleSpreadPages` records the owner-described spread `[2, 3]`. No text from
the editorial is included in the article body.

## Files

- `Pilot.pdf` — unchanged original download, 1,716,581 bytes,
  SHA-256 `b86b1dc5e4ef6f48c3563d0293e77873a0bcf9500803f3cddd8a12c41c041acf`;
- `yarmarka-intellekta.txt` — proofread UTF-8 article text, 32 paragraphs plus
  the byline, 13,381 bytes, SHA-256
  `59141b0aa36b37938dc677013371f239402f39da2c6f21a09b455d89e46460a3`;
- `manifest.json` — machine-readable provenance and the planned record patch.

Normalized article content hash (SHA-256 of the trimmed text):
`fc485f44fd9fa9814dc72527aad4b1a83bc40f6678833134575e01efa906adbe`.

## Offline integrity check

The archived PDF is byte-identical to the live source. Checked on
2026-11-23: HTTP 200, `Content-Length: 1716581`, last modified
`Sat, 26 Dec 2020 13:37:38 GMT`, SHA-256
`b86b1dc5e4ef6f48c3563d0293e77873a0bcf9500803f3cddd8a12c41c041acf`.

Run the bundle check without database credentials:

```bash
pnpm media:verify-bundle --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f
```

It verifies the PDF hash/signature and 16-page count, the text and content
hashes, the 32 article paragraphs plus byline, the manifest paths, and that the
cleaned text contains exactly the same letters and digits as page 3 of the
archived PDF (after removing the PDF font's `U+0019` soft-hyphen artefact and
normalizing the lookalike Cyrillic `С` in `CD`).

## OCR review

The PDF contains an OCR text layer. The cleaned text was proofread against that
layer; the sequence of letters and digits is identical, so no words were added
or removed from the article body. The cleanup fixes presentation only:

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

The import archives the original PDF and cleaned text in the private
`brain-sources` bucket under content-addressed paths. The same files are also
kept in the repository bundle at `data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/`
so the unchanged original and the proofread text remain available even when the
runtime has no Supabase credentials.

- PDF: `brain-sources/b8/b86b1dc5…c041acf.pdf`
- text: `brain-sources/59/59141b0a…6460a3.txt`

The script updates the existing row by id; it never inserts a record:

- `source_format = 'text'`
- `source_path = 'brain-sources/59/59141b0a…6460a3.txt'`
- `source_sha256 = '59141b0a…6460a3'`
- `content_hash = 'fc485f44…906adbe'`
- `extraction_diagnostics` records the PDF path/hash/page count, article page
  `[3]`, owner-described spread `[2, 3]`, issue metadata, paragraph count and
  OCR review;
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
  --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt \
  --manifest data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/manifest.json
```

Offline plan (no database required):

```bash
npx tsx scripts/knowledge/import-media-archive-source.ts --offline --json \
  --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f \
  --pdf data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/Pilot.pdf \
  --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt \
  --manifest data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/manifest.json
```

Apply, ingest and verify:

```bash
npx tsx scripts/knowledge/import-media-archive-source.ts --apply \
  --record-id 775e8169-a02e-4b64-b3f8-e3722a48c28f \
  --pdf data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/Pilot.pdf \
  --text data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/yarmarka-intellekta.txt \
  --manifest data/media-archive/775e8169-a02e-4b64-b3f8-e3722a48c28f/manifest.json
```

The apply step requires `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY` for storage/database access, plus the embedding
provider configuration used by Brain. It enqueues a media coverage job, runs one
inline job, then checks the job, coverage document, content hash and retrieval.
Repeated runs update the same record and knowledge document.

The execution workspace used for this bundle had no Supabase service-role or
embedding credentials, so the offline checks above were run there and the apply
command remains the step to run in a credentialed environment.
