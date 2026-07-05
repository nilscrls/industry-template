import type { PlopTypes } from "@turbo/gen";

/**
 * `pnpm gen feature` — scaffolds a vertical slice for a new entity:
 * contract → db schema → nest module (with TDD spec skeletons) → web page,
 * and registers it in the contract router, schema index and app module.
 */
export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("feature", {
    description: "Vertical slice: contract + db table + nest module + web page",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Entity name (singular, kebab-case — e.g. `invoice`):",
        validate: (value: string) =>
          /^[a-z][a-z0-9-]*$/.test(value) ||
          "lowercase kebab-case, starting with a letter",
      },
      {
        type: "input",
        name: "plural",
        message: "Plural (used for routes and files):",
        default: (answers: { name: string }) => `${answers.name}s`,
        validate: (value: string) =>
          /^[a-z][a-z0-9-]*$/.test(value) ||
          "lowercase kebab-case, starting with a letter",
      },
    ],
    actions: [
      // ── contracts ────────────────────────────────────────────────────
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/contracts/src/{{ plural }}.ts",
        templateFile: "templates/contract.hbs",
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/contracts/src/contract.ts",
        pattern: /(import { projectsContract } from ".\/projects.js";)/,
        template:
          'import { {{ camelCase plural }}Contract } from "./{{ plural }}.js";\n$1',
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/contracts/src/contract.ts",
        pattern: /(export const contract = populateContractRouterPaths\(\{)/,
        template:
          "$1\n  {{ camelCase plural }}: {{ camelCase plural }}Contract,",
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/contracts/src/index.ts",
        pattern: /$/,
        template:
          'export { {{ camelCase plural }}Contract, {{ camelCase name }}Schema, type {{ pascalCase name }} } from "./{{ plural }}.js";\n',
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/contracts/src/permissions.ts",
        pattern: /(export const subjects = \[)/,
        template: '$1"{{ pascalCase name }}", ',
      },
      // ── db ───────────────────────────────────────────────────────────
      {
        type: "add",
        path: "{{ turbo.paths.root }}/packages/db/src/schema/{{ plural }}.ts",
        templateFile: "templates/schema.hbs",
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/db/src/schema/index.ts",
        pattern: /$/,
        template: 'export * from "./{{ plural }}.js";\n',
      },
      // ── api ──────────────────────────────────────────────────────────
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/api/src/{{ plural }}/{{ plural }}.service.ts",
        templateFile: "templates/service.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/api/src/{{ plural }}/{{ plural }}.controller.ts",
        templateFile: "templates/controller.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/api/src/{{ plural }}/{{ plural }}.module.ts",
        templateFile: "templates/module.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/api/test/{{ plural }}.int.test.ts",
        templateFile: "templates/int-test.hbs",
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/apps/api/src/app.module.ts",
        pattern:
          /(import { ProjectsModule } from ".\/projects\/projects.module";)/,
        template:
          'import { {{ pascalCase plural }}Module } from "./{{ plural }}/{{ plural }}.module";\n$1',
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/apps/api/src/app.module.ts",
        pattern: /( {4}ProjectsModule,)/,
        template: "$1\n    {{ pascalCase plural }}Module,",
      },
      // ── web ──────────────────────────────────────────────────────────
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/web/src/app/(app)/{{ plural }}/page.tsx",
        templateFile: "templates/page.hbs",
      },
      function reminders() {
        return [
          "Next steps:",
          "  1. pnpm db:generate && pnpm db:migrate   # create the migration",
          "  2. Grant permissions for the new subject (see docs/authorization.md)",
          "  3. Add i18n keys under `{{ camelCase plural }}` in packages/i18n/messages/*.json",
          "  4. Add a nav item in apps/web/src/components/app-shell.tsx",
          "  5. Make the generated int tests pass (TDD: they start as todos)",
        ].join("\n");
      },
    ],
  });
}
