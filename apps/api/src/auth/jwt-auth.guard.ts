import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Rejects requests without a valid HS256-signed JWT in the Authorization header. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
