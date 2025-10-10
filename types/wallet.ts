// Типы для Web3-авторизации и SIWE

export type AuthType = 'google' | 'wallet';

export interface WalletUser {
  id: string;
  email: string | null;
  wallet_address: string;
  auth_type: AuthType;
  nonce: string | null;
  nonce_expires_at: string | null; // ISO string
}

export interface SiweNonceResponse {
  nonce: string;
  expires_at: string; // ISO string
}

export interface SiweVerifyRequest {
  message: string;
  signature: string;
  chain: 'ethereum' | 'polygon' | 'bitcoin' | 'solana';
}

export interface SiweVerifyResponse {
  user: WalletUser;
  access_token: string;
  refresh_token?: string;
}

export interface WalletSession {
  user: WalletUser;
  expires_at: string;
}
