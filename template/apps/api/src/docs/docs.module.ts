import { Controller, Get, Module } from "@nestjs/common";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { contract } from "@repo/contracts";
import { Public } from "../auth/decorators";

@Controller()
export class DocsController {
  private readonly generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });
  private spec: object | undefined;

  /** OpenAPI 3.1 spec generated straight from the oRPC contract. */
  @Public()
  @Get("openapi.json")
  async openapi(): Promise<object> {
    this.spec ??= await this.generator.generate(contract, {
      info: { title: "Industry App API", version: "1.0.0" },
    });
    return this.spec;
  }
}

@Module({
  controllers: [DocsController],
})
export class DocsModule {}
