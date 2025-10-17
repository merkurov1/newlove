"use client";

import * as Sentry from "@sentry/nextjs";
import React, { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Произошла ошибка</h1>
            <p style={{ color: '#666' }}>Мы уже получили уведомление — спасибо за терпение.</p>
          </div>
        </div>
      </body>
    </html>
  );
}