import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { Role, prisma } from '@rfp-pulse/db';

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24; // 24h

function requireSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required');
  }
  return secret;
}

/**
 * Shared NextAuth configuration.
 *
 * Uses a Credentials provider against the seeded users (bcrypt-hashed
 * passwords). Tokens are signed with HS256 so the NestJS API can verify them
 * with the same NEXTAUTH_SECRET via passport-jwt.
 */
export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        tenantSlug: { label: 'Tenant', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password || !credentials.tenantSlug) {
          return null;
        }

        const tenant = await prisma.tenant.findUnique({
          where: { slug: credentials.tenantSlug },
        });
        if (!tenant) return null;

        const user = await prisma.user.findUnique({
          where: {
            tenantId_email: { tenantId: tenant.id, email: credentials.email },
          },
        });
        if (!user || !user.passwordHash) return null;

        const ok = await compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: tenant.slug,
          passwordMustChange: user.passwordMustChange,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: JWT_EXPIRES_IN_SECONDS,
  },
  jwt: {
    maxAge: JWT_EXPIRES_IN_SECONDS,
    async encode({ token, secret }) {
      const payload = {
        sub: token?.sub,
        email: token?.email,
        name: token?.name ?? null,
        role: token?.role,
        tenantId: token?.tenantId,
        tenantSlug: token?.tenantSlug,
        passwordMustChange: token?.passwordMustChange ?? false,
      };
      return jwt.sign(payload, secret as string, {
        algorithm: JWT_ALGORITHM,
        expiresIn: JWT_EXPIRES_IN_SECONDS,
      });
    },
    async decode({ token, secret }) {
      if (!token) return null;
      try {
        const decoded = jwt.verify(token, secret as string, {
          algorithms: [JWT_ALGORITHM],
        });
        return decoded as Record<string, unknown> as never;
      } catch {
        return null;
      }
    },
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name ?? null;
        token.role = user.role as Role;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.passwordMustChange = user.passwordMustChange ?? false;
      }
      // Re-hydrate name / passwordMustChange / role from DB on session update
      // so the force-change-password redirect clears after the user changes
      // their temp password (or an admin edits their role / name).
      if (trigger === 'update' && token.sub) {
        const fresh = await prisma.user.findUnique({ where: { id: token.sub } });
        if (fresh) {
          token.name = fresh.name;
          token.role = fresh.role;
          token.passwordMustChange = fresh.passwordMustChange;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.email = token.email;
        session.user.name = token.name ?? null;
        session.user.role = token.role;
        session.user.tenantId = token.tenantId;
        session.user.tenantSlug = token.tenantSlug;
        session.user.passwordMustChange = token.passwordMustChange ?? false;
      }
      // Re-sign the raw JWT so the client can send it as a Bearer token.
      session.accessToken = jwt.sign(
        {
          sub: token.sub,
          email: token.email,
          role: token.role,
          tenantId: token.tenantId,
          tenantSlug: token.tenantSlug,
        },
        requireSecret(),
        { algorithm: JWT_ALGORITHM, expiresIn: JWT_EXPIRES_IN_SECONDS },
      );
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
