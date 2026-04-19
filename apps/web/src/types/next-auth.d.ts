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
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string;
    email: string;
    role: Role;
    tenantId: string;
    tenantSlug: string;
  }
}
