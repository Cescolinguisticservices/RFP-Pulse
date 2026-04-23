import type { Role } from '@rfp-pulse/db';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      tenantId: string;
      tenantSlug: string;
      passwordMustChange: boolean;
    };
    accessToken: string;
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    role: Role;
    tenantId: string;
    tenantSlug: string;
    passwordMustChange: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string;
    email: string;
    name?: string | null;
    role: Role;
    tenantId: string;
    tenantSlug: string;
    passwordMustChange: boolean;
  }
}
