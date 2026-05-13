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
      orgName: string | null;
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
      let orgId:   string | null = null;
      let orgName: string | null = null;
      let role: UserRole = "member";
      let plan: Plan = "free";
      try {
        const dbUser = await prisma.user.findUnique({
          where:  { id: user.id },
          select: { orgId: true, role: true, org: { select: { plan: true, name: true } } },
        });
        orgId   = dbUser?.orgId          ?? null;
        role    = (dbUser?.role          ?? "member") as UserRole;
        plan    = (dbUser?.org?.plan     ?? "free")   as Plan;
        orgName = dbUser?.org?.name      ?? null;
      } catch (err) {
        console.error("[auth] session callback DB read failed (non-fatal):", err);
      }
      return {
        ...session,
        user: { ...session.user, id: user.id, orgId, orgName, role, plan },
      };
    },

    // Best-effort org bootstrap + invite acceptance for new/returning users.
    // Non-blocking — sign-in succeeds even if this fails.
    async signIn({ user }) {
      if (!user.id) return true;

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { orgId: true },
        });

        let orgId: string | null = dbUser?.orgId ?? null;

        // Step 1: Accept a pending org invite (checked before bootstrap so invited
        // users join the inviting org rather than getting a new empty org).
        if (user.email) {
          const invite = await prisma.orgInvite.findFirst({
            where: { email: user.email.toLowerCase(), expires: { gte: new Date() } },
          });
          if (invite) {
            // Allow switching org if user is solo in their current org (or has none).
            // Prevents luring someone out of a shared team, but fixes new users who
            // got a solo org bootstrapped before/during a previous invite attempt.
            let canSwitch = !orgId;
            if (orgId && orgId !== invite.orgId) {
              const soloCount = await prisma.user.count({ where: { orgId } });
              canSwitch = soloCount <= 1;
            }
            if (canSwitch) {
              const prevOrgId = orgId;
              await prisma.user.update({
                where: { id: user.id },
                data: { orgId: invite.orgId, role: invite.role },
              });
              orgId = invite.orgId;
              // Clean up the now-empty solo org so it doesn't linger.
              if (prevOrgId) {
                prisma.organization.deleteMany({ where: { id: prevOrgId } }).catch(() => {
                  // Non-fatal — org may have related records, leave it in place.
                });
              }
            }
            await prisma.orgInvite.delete({ where: { id: invite.id } });
          }
        }

        // Step 2: Normal org bootstrap (only if still no orgId after invite check).
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

        // Step 3: Claim runs (unchanged).
        if (orgId && user.email) {
          await prisma.run.updateMany({
            where: { notifyEmail: user.email, orgId: null },
            data: { orgId, userId: user.id },
          });
        }

        if (orgId && user.id) {
          await prisma.run.updateMany({
            where: { userId: user.id, orgId: null },
            data: { orgId },
          });
        }
      } catch (err) {
        console.error("[auth] org bootstrap failed (non-fatal):", err);
      }

      return true;
    },
  },
});
