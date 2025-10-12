export const dynamic = 'force-dynamic';

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';

const authOptions = {
	adapter: PrismaAdapter(prisma),
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		}),
			CredentialsProvider({
				id: 'privy',
				name: 'Privy',
				credentials: {
					accessToken: { label: 'Privy Access Token', type: 'text' },
				},
				async authorize(credentials, req) {
					// 🔐 Fallback: accessToken из credentials, body, cookies, header
					let accessToken = credentials?.accessToken;
					if (!accessToken && req?.body?.authToken) accessToken = req.body.authToken;
					if (!accessToken && req?.headers?.cookie) {
						const match = req.headers.cookie.match(/privy-token=([^;]+)/);
						if (match) accessToken = match[1];
					}
					if (!accessToken && req?.headers?.authorization?.startsWith('Bearer ')) {
						accessToken = req.headers.authorization.slice(7);
					}
					console.log('🔐 Privy authorize: accessToken =', accessToken);
					if (!accessToken) {
						console.error('❌ Privy authorize: No access token provided');
						return null;
					}
					try {
						const { PrivyClient } = await import('@privy-io/server-auth');
						const privy = new PrivyClient(
							process.env.PRIVY_APP_ID!,
							process.env.PRIVY_APP_SECRET!
						);
						const claims = await privy.verifyAuthToken(accessToken);
						const userId = claims.userId;
						if (!userId) {
							console.error('❌ Privy authorize: Token verification failed, no userId');
							return null;
						}
						const privyUser = await privy.getUser(userId);
						const walletAddress = privyUser?.wallet?.address?.toLowerCase() || null;
						let email = privyUser?.email?.address?.toLowerCase() || null;
						if (!email && walletAddress) {
							email = `wallet_${walletAddress}@privy.local`;
						}
						let userData = {
							id: userId,
							email,
							walletAddress,
							// name и image можно добавить при необходимости
						};
						let user = await prisma.user.findUnique({ where: { id: userId } });
						if (!user && email) {
							user = await prisma.user.findUnique({ where: { email } });
							if (user) {
								user = await prisma.user.update({
									where: { id: user.id },
									data: { ...userData },
								});
							}
						}
						if (!user && walletAddress) {
							user = await prisma.user.findFirst({ where: { walletAddress } });
							if (user) {
								user = await prisma.user.update({
									where: { id: user.id },
									data: { ...userData },
								});
							}
						}
						if (!user) {
							user = await prisma.user.create({ data: userData });
						}
						return {
							id: user.id,
							email: user.email,
							role: user.role as any,
							username: user.username,
							bio: user.bio,
							website: user.website,
							walletAddress: user.walletAddress,
						};
					} catch (error) {
						console.error('❌ Privy authorize error:', error);
						return null;
					}
				},
			}),
	],
	callbacks: {
			async session({ session, user }: { session: any, user: any }) {
				if (user) {
					session.user = {
						...session.user,
						id: user.id,
						role: user.role as any,
						username: user.username,
						bio: user.bio,
						website: user.website,
						walletAddress: user.walletAddress,
					};
				}
				return session;
			},
	},
	pages: {
		signIn: '/auth/signin',
		error: '/auth/error',
	},
	secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth({
	...authOptions,
	cookies: {
		sessionToken: {
			name: `__Secure-next-auth.session-token`,
			options: {
				httpOnly: true,
				sameSite: 'lax', // Safari fix
				path: '/',
				secure: process.env.NODE_ENV === 'production',
			},
		},
	},
});
export { handler as GET, handler as POST };
