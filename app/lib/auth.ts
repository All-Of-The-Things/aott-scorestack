import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import prisma from "./prisma";
import type { Plan, UserRole } from "../generated/prisma";

// Extend the built-in session types to include our custom fields.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      orgId: string | null;
      role: UserRole;
      plan: Plan;
    };
  }
  interface User {
    orgId?: string | null;
    role?: UserRole;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@scorestack.io",
    }),
  ],

  session: { strategy: "database" },

  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    // Attach custom user fields to the session so they're available
    // client-side via useSession() and server-side via auth().
    async session({ session, user }) {
      // Re-read from DB rather than trusting the adapter's snapshot. The signIn
      // callback that bootstraps the org runs after the adapter reads the user,
      // so the snapshot's orgId is null on first sign-in.
      let orgId: string | null = null;
      let role: UserRole = "member";
      let plan: Plan = "free";
      try {
        const dbUser = await prisma.user.findUnique({
          where:  { id: user.id },
          select: { orgId: true, role: true, org: { select: { plan: true } } },
        });

        // Fallback org bootstrap — covers cases where the signIn callback was
        // skipped (e.g. user.id undefined during email verification request).
        if (dbUser && !dbUser.orgId) {
          const org = await prisma.organization.create({
            data: { name: "My Workspace", plan: "free" as Plan },
          });
          await prisma.user.update({
            where:  { id: user.id },
            data:   { orgId: org.id, role: "admin" as UserRole },
          });
          orgId = org.id;
          role  = "admin";
        } else {
          orgId = dbUser?.orgId ?? null;
          role  = (dbUser?.role  ?? "member") as UserRole;
          plan  = (dbUser?.org?.plan ?? "free") as Plan;
        }
      } catch (err) {
        console.error("[auth] session callback DB read failed (non-fatal):", err);
      }
      return {
        ...session,
        user: { ...session.user, id: user.id, orgId, role, plan },
      };
    },

    // Best-effort org bootstrap for new users. Non-blocking — sign-in succeeds
    // even if this fails. Models are now scoped to userId, so org is not
    // required for core functionality (it will be used for billing/team later).
    async signIn({ user }) {
      if (!user.id) return true;

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { orgId: true },
        });

        let orgId: string | null = dbUser?.orgId ?? null;

        if (dbUser && !orgId) {
          const org = await prisma.organization.create({
            data: { name: "My Workspace", plan: "free" as Plan },
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { orgId: org.id, role: "admin" as UserRole },
          });
          orgId = org.id;
        }

        // Claim runs created during unauthenticated enrichment — they were stored
        // with notifyEmail but no orgId/userId; link them now so they appear in the list.
        if (orgId && user.email) {
          await prisma.run.updateMany({
            where: { notifyEmail: user.email, orgId: null },
            data: { orgId, userId: user.id },
          });
        }
      } catch (err) {
        console.error("[auth] org bootstrap failed (non-fatal):", err);
      }

      return true;
    },
  },
});
