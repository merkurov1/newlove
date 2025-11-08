'use client';

import Link from 'next/link';
import React from 'react';

export default function ProfileEditLink({ className }) {
  return (
    <Link href="/profile" className={className}>
      Редактировать профиль
    </Link>
  );
}
