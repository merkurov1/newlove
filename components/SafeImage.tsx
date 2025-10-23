import Image from 'next/image';
import React from 'react';

type Props = React.ComponentProps<typeof Image> & { className?: string };

export default function SafeImage({ alt = '', unoptimized = true, ...rest }: Props) {
  // Default to unoptimized to avoid needing next.config domains during dev/migrations.
  // Consumers can override by passing `unoptimized={false}` and configuring domains.
  return <Image alt={alt} unoptimized={unoptimized} {...(rest as any)} />;
}
