'use client';

import Link from 'next/link';

export default function ProfileGuest() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <h1 className="text-2xl font-bold mb-4">Your profile</h1>
      <p className="text-gray-600 mb-6">Sign in to create and manage your public profile.</p>
      <div className="flex items-center justify-center gap-4">
        <Link href="/login?next=%2Fprofile" className="inline-flex items-center gap-2 px-5 py-3 bg-stone-900 text-white rounded-full hover:bg-stone-700 font-semibold">Sign in</Link>
      </div>
    </div>
  );
}
