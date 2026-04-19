import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Role } from '@rfp-pulse/db';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  tenantId: string;
  tenantSlug: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string;
  tenantSlug: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('NEXTAUTH_SECRET');
    if (!secret) {
      throw new Error('NEXTAUTH_SECRET env var is required for JWT auth');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  /** Passport calls this on successful JWT verification; return value becomes req.user. */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub || !payload.tenantId || !payload.role) {
      throw new UnauthorizedException('Malformed auth token');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
    };
  }
}
