/**
 * DI tokens live outside the module file: services import tokens, the module
 * imports services — a token in the module file creates a circular import
 * that evaluates to `undefined` inside @Inject().
 */
export const REDIS = "REDIS_CLIENT";
