import swc from "unplugin-swc";

/**
 * Nest relies on legacy decorators + emitDecoratorMetadata, which esbuild
 * (vitest's default transform) cannot emit. unplugin-swc does NOT read
 * tsconfig.json, so the decorator options must be explicit — without them
 * @Inject() metadata is silently dropped and DI fails at runtime.
 */
export const swcPlugin = swc.vite({
  module: { type: "es6" },
  jsc: {
    target: "es2022",
    parser: { syntax: "typescript", decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});
