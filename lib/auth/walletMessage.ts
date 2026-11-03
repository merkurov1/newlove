export type WalletLoginMessage = {
  domain: string;
  address: string;
  issuedAt: number;
  expiresAt: number | null;
  nonce: string;
  uri: string;
  chainId: string;
};

export function normalizeWalletLoginAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null;
}

export function parseWalletLoginMessage(message: string): WalletLoginMessage | null {
  const lines = message.split(/\r?\n/);
  const domainMatch = lines[0]?.match(/^(\S+) wants you to sign in with your Ethereum account:$/);
  const addressMatch = lines[1]?.trim().match(/^(0x[0-9a-fA-F]{40})$/);
  const issuedMatch = message.match(/^Issued At:\s*(.+)$/im);
  const expirationMatch = message.match(/^Expiration Time:\s*(.+)$/im);
  const nonceMatch = message.match(/^Nonce:\s*([A-Za-z0-9_-]{16,80})$/im);
  const uriMatch = message.match(/^URI:\s*(\S+)$/im);
  const chainMatch = message.match(/^Chain ID:\s*(\d+)$/im);

  if (!domainMatch || !addressMatch || !issuedMatch || !nonceMatch || !uriMatch || !chainMatch) {
    return null;
  }

  const issuedAt = Date.parse(issuedMatch[1].trim());
  const expiresAt = expirationMatch ? Date.parse(expirationMatch[1].trim()) : null;

  if (!Number.isFinite(issuedAt)) return null;
  if (expirationMatch && !Number.isFinite(expiresAt)) return null;

  try {
    const uri = new URL(uriMatch[1]);
    if (uri.protocol !== 'http:' && uri.protocol !== 'https:') return null;
    if (uri.host.toLowerCase() !== domainMatch[1].toLowerCase()) return null;
  } catch {
    return null;
  }

  return {
    domain: domainMatch[1],
    address: addressMatch[1].toLowerCase(),
    issuedAt,
    expiresAt,
    nonce: nonceMatch[1],
    uri: uriMatch[1],
    chainId: chainMatch[1],
  };
}

export function validateWalletLoginMessage(input: {
  message: string;
  address: string;
  host: string;
  origin: string;
  chainId?: string;
  now?: number;
}): WalletLoginMessage | null {
  const now = input.now ?? Date.now();
  const parsed = parseWalletLoginMessage(input.message);

  if (!parsed) return null;
  if (parsed.domain.toLowerCase() !== input.host.toLowerCase()) return null;
  if (parsed.address !== input.address.toLowerCase()) return null;
  if (parsed.uri !== input.origin) return null;
  if (parsed.chainId !== (input.chainId ?? '1')) return null;
  if (Math.abs(now - parsed.issuedAt) > 10 * 60 * 1000) return null;
  if (parsed.expiresAt !== null && parsed.expiresAt <= now) return null;

  return parsed;
}
