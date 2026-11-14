// ============================================================================
// DSMS Authentication — NextAuth v5 (authjs) — DEVELOPER_GUIDE.md §5.1
// Credentials provider · scrypt hashing · JWT in HTTPOnly cookies.
// ============================================================================
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { computeSnapshot } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
      designation?: string | null;
      permissions: string[];
      memberId?: string | null; // MemberProfile id for MEMBER role
      actAs?: string | null;    // impersonation target id
      actAsBy?: string | null;  // impersonating super admin id
    } & DefaultSession['user'];
  }
}

const credentialsSchema = z.object({
  identifier: z.string().min(3), // email or phone
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 }, // 30d sliding
  secret: process.env.SESSION_SECRET,
  pages: { signIn: '/login' },
  trustHost: true,
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { identifier, password } = parsed.data;
        const ident = identifier.trim().toLowerCase();
        const user = await db.user.findFirst({
          where: { OR: [{ email: ident }, { phone: identifier }] },
          include: { memberProfile: { select: { id: true, status: true } } },
        });
        if (!user) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        // member self-service kill-switch
        if (user.role === 'MEMBER') {
          const features = await getSettings('features');
          if (features?.memberSelfService === false) return null;
          if (user.status !== 'ACTIVE') return null;
        } else if (user.status !== 'ACTIVE') return null;

        const valid = verifyPassword(password, user.passwordHash);
        if (!valid) {
          const failedAttempts = user.failedAttempts + 1;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedAttempts,
              lockedUntil: failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
            },
          });
          return null;
        }
        await db.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        const snapshot = await computeSnapshot(user.role, user.designation, user.permissions);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: snapshot.role,
          designation: snapshot.designation,
          permissions: snapshot.permissions,
          memberId: user.memberProfile?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as any).role;
        token.designation = (user as any).designation;
        token.permissions = (user as any).permissions;
        token.memberId = (user as any).memberId;
      }
      if (trigger === 'update') {
        // permission refresh / impersonation set via update()
        token.role = (token as any).newRole ?? token.role;
        token.designation = (token as any).newDesignation ?? token.designation;
        token.permissions = (token as any).newPermissions ?? token.permissions;
        token.memberId = (token as any).newMemberId ?? token.memberId;
        token.actAs = (token as any).newActAs ?? token.actAs;
        token.actAsBy = (token as any).newActAsBy ?? token.actAsBy;
        if ((token as any).clearActAs) { token.actAs = null; token.actAsBy = null; }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.sub ?? token.id ?? '');
      session.user.role = token.role as any;
      session.user.designation = token.designation as any;
      session.user.permissions = (token.permissions as string[]) ?? [];
      session.user.memberId = (token.memberId as string) ?? null;
      session.user.actAs = (token.actAs as string) ?? null;
      session.user.actAsBy = (token.actAsBy as string) ?? null;
      return session;
    },
  },
});
