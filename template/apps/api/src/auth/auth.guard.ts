import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Auth } from "@repo/auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { appError } from "../common/app-error";
import { requestContext } from "../common/request-context";
import { AbilityFactory } from "./ability.factory";
import { AUTH } from "./auth.module";
import { IS_PUBLIC_KEY } from "./decorators";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      throw appError("AUTH_UNAUTHORIZED", {});
    }

    const store = requestContext.getStore();
    if (store) {
      store.session = session;
      store.user = session.user;
      store.ability = await this.abilityFactory.abilityFor({
        id: session.user.id,
        role: session.user.role ?? "member",
      });
    }
    return true;
  }
}
