// Утилиты для работы с SIWE (Sign-In With Ethereum)
import { SiweMessage } from 'siwe';

export function createSiweMessage({
  address,
  chainId,
  domain,
  uri,
  statement,
  nonce,
}: {
  address: string;
  chainId: number;
  domain: string;
  uri: string;
  statement: string;
  nonce: string;
}) {
  return new SiweMessage({
    domain,
    address,
    statement,
    uri,
    version: '1',
    chainId,
    nonce,
  });
}

export function verifySiweMessage({ message, signature, nonce }: { message: string; signature: string; nonce: string }) {
  const siwe = new SiweMessage(message);
  return siwe.verify({ signature, nonce });
}
