'use client';

import React from 'react';
import { AuthProvider as BaseAuthProvider } from './AuthContext';

export default function AuthProvider(props: React.PropsWithChildren<{}>) {
  return <BaseAuthProvider {...props} />;
}
