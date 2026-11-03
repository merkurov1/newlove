import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy duplicate of the Art Engine terminal. It used the old single-click
 * parse → AI essay → save pipeline, which Stage 1 deliberately removed from
 * ingestion. Keep the URL working by sending administrators to the supported
 * terminal.
 */
export default function LegacyAiSelectionPage() {
  redirect('/art-engine');
}
