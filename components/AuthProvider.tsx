
'use client';

import React from 'react';
import { AuthProvider as BaseAuthProvider } from './AuthContext';

export default function AuthProvider({
  children,
}: React.PropsWithChildren) {
  return <BaseAuthProvider>{children}</BaseAuthProvider>;
}
