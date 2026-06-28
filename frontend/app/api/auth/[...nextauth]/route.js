import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import {
  ensureOAuthUser,
  getUserByEmail,
  validateUserCredentials,
} from "../../../lib/db";

export const runtime = "nodejs";

const providers = [
  CredentialsProvider({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      otp: { label: "OTP", type: "text" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim();

      if (!email || !credentials?.password) {
        return null;
      }

      const user = await validateUserCredentials(email, credentials.password);

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        supervisorId: user.supervisorId || (user.role === "Supervisor" ? user.id : null),
        workerId: user.role === "Worker" ? user.id : null,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions = {
  providers,
  pages: {
    signIn: "/auth",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") {
        return true;
      }

      const dbUser = await ensureOAuthUser({
        email: user?.email,
        name: user?.name,
        role: "Worker",
      });

      return Boolean(dbUser);
    },
    async jwt({ token, user }) {
      if (user?.role) {
        token.userId = user.id;
        token.role = user.role;
        token.supervisorId = user.supervisorId;
        token.workerId = user.workerId;
      }

      if ((!token.userId || !token.role) && token.email) {
        const dbUser = await getUserByEmail(token.email);

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.supervisorId =
            dbUser.supervisorId || (dbUser.role === "Supervisor" ? dbUser.id : null);
          token.workerId = dbUser.role === "Worker" ? dbUser.id : null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId || null;
        session.user.role = token.role || "Admin";
        session.user.supervisorId = token.supervisorId || null;
        session.user.workerId = token.workerId || null;
      }

      return session;
    },
  },
};

const handler = NextAuth(authOptions);

async function authHandler(req, context) {
  const resolvedParams = await context.params;
  return handler(req, { ...context, params: resolvedParams });
}

export { authHandler as GET, authHandler as POST };
