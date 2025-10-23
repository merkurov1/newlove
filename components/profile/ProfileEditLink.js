'use client';

import React from 'react';

export default function ProfileEditLink({ className }) {
  const href = '/profile';
  const onClick = (e) => {
    // Try to allow normal navigation; if prevented by other handlers, force it
    try {
      // Small timeout to give any SPA handlers a chance; otherwise fallback
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname !== href) {
          window.location.href = href;
        }
      }, 50);
    } catch (err) {
      // Ensure navigation anyway
      try { window.location.href = href; } catch (e) {}
    }
  };

  return (
    <a href={href} onClick={onClick} className={className}>
      Редактировать профиль
    </a>
  );
}
