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
    session({ session, user }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          orgId: (user as { orgId?: string | null }).orgId ?? null,
          role: ((user as { role?: string }).role ?? "member") as UserRole,
        },
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

        if (dbUser && !dbUser.orgId) {
          const org = await prisma.organization.create({
            data: { name: "My Workspace", plan: "free" as Plan },
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { orgId: org.id, role: "admin" as UserRole },
          });
        }
      } catch (err) {
        console.error("[auth] org bootstrap failed (non-fatal):", err);
      }

      return true;
    },
  },
});
