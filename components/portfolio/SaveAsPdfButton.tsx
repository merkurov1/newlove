'use client';

import { useCallback } from 'react';

/**
 * The page deliberately exposes one quiet action: the browser's native print
 * dialog. There is no custom PDF renderer and no second content set.
 */
export default function SaveAsPdfButton() {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <button
      type="button"
      onClick={handlePrint}
      data-print-hide
      className="portfolio-save-pdf"
      aria-label="Save this portfolio as a PDF"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 13h10v7H7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Save as PDF</span>
    </button>
  );
}
