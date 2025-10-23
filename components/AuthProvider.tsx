// components/AuthProvider.tsx

"use client";

import { ReactNode } from 'react';
import { AuthProviderInner } from './AuthContext';

interface Props { children: ReactNode }

export default function AuthProvider({ children }: Props) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}
