
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
						const accessToken = credentials?.accessToken;
						console.log('Privy authorize: accessToken =', accessToken);
						if (!accessToken) {
							console.error('Privy authorize: No access token provided');
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
						console.error('Privy authorize: Token verification failed, no userId');
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
															// name и image временно убраны для устранения ошибок типов
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
												// name: user.name,
												// image: user.image,
												role: user.role as any,
												username: user.username,
												bio: user.bio,
												website: user.website,
												walletAddress: user.walletAddress,
											};
				} catch (error) {
					console.error('Privy authorize error:', error);
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

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
