import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthenticatedUser } from './jwt.strategy';

/** Convenience decorator: resolves the authenticated user attached by JwtStrategy. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return req.user;
  },
);
