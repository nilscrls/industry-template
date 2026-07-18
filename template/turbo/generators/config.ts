import { readFileSync } from "node:fs";
import path from "node:path";
import type { PlopTypes } from "@turbo/gen";

/** kebab-case → camelCase, matching plop's `camelCase` helper for our inputs. */
function toCamel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

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
          'export {\n  is{{ pascalCase name }}SortField,\n  list{{ pascalCase plural }}QuerySchema,\n  {{ camelCase plural }}Contract,\n  {{ camelCase name }}Schema,\n  {{ camelCase name }}SortFields,\n  type {{ pascalCase name }},\n  type {{ pascalCase name }}SortField,\n} from "./{{ plural }}.js";\n',
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/contracts/src/permissions.ts",
        pattern: /(export const resources = \[)/,
        template: '$1"{{ snakeCase name }}", ',
      },
      // ── authorization model ──────────────────────────────────────────
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/fga/model.fga",
        pattern:
          /(# fga-generator-marker: new resource types are appended below by `pnpm gen feature`)/,
        // Generated entities start user-scoped (owner-only). Add an `org`
        // link + org-derived capabilities when the entity becomes
        // tenant-shared (and give the table an organizationId + RLS policy).
        template: [
          "$1",
          "",
          "type {{ snakeCase name }}",
          "  relations",
          "    define owner: [user]",
          "    define can_read: owner",
          "    define can_update: owner",
          "    define can_delete: owner",
        ].join("\n"),
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
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/web/src/app/(app)/{{ plural }}/search-params.ts",
        templateFile: "templates/search-params.hbs",
      },
      {
        type: "add",
        path: "{{ turbo.paths.root }}/apps/web/src/app/(app)/{{ plural }}/search-params.test.ts",
        templateFile: "templates/search-params.test.hbs",
      },
      // ── i18n ─────────────────────────────────────────────────────────
      // Text-level insertion (NOT JSON re-serialization) so the catalogs
      // keep their exact formatting. Single `{` braces (ICU args like
      // {page}) are literal to handlebars — only `{{ }}` is interpolated.
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/i18n/messages/en.json",
        pattern: /( {2}"projects": \{)/,
        template: [
          '  "{{ camelCase plural }}": {',
          '    "title": "{{ titleCase plural }}",',
          '    "searchPlaceholder": "Search…",',
          '    "empty": "Nothing here yet.",',
          '    "previous": "Previous",',
          '    "next": "Next",',
          '    "pageInfo": "Page {page} of {totalPages}",',
          '    "fields": {',
          '      "name": "Name",',
          '      "createdAt": "Created"',
          "    }",
          "  },",
          "$1",
        ].join("\n"),
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/i18n/messages/fr.json",
        pattern: /( {2}"projects": \{)/,
        template: [
          '  "{{ camelCase plural }}": {',
          '    "title": "{{ titleCase plural }}",',
          '    "searchPlaceholder": "Rechercher…",',
          '    "empty": "Rien pour le moment.",',
          '    "previous": "Précédent",',
          '    "next": "Suivant",',
          '    "pageInfo": "Page {page} sur {totalPages}",',
          '    "fields": {',
          '      "name": "Nom",',
          '      "createdAt": "Créé le"',
          "    }",
          "  },",
          "$1",
        ].join("\n"),
      },
      // shell.nav label (anchor: shell.nav is the only nav whose first key
      // is "dashboard" with a string value — admin.nav starts with
      // "organizations").
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/i18n/messages/en.json",
        pattern: /("nav": \{\n {6}"dashboard": "[^"]+",)/,
        template: '$1\n      "{{ camelCase plural }}": "{{ titleCase plural }}",',
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/packages/i18n/messages/fr.json",
        pattern: /("nav": \{\n {6}"dashboard": "[^"]+",)/,
        template: '$1\n      "{{ camelCase plural }}": "{{ titleCase plural }}",',
      },
      // ── nav ──────────────────────────────────────────────────────────
      // Anchor exists verbatim in both UI variants of app-shell.tsx (the
      // scaffolded app has exactly one). Reuses FolderKanbanIcon — swap the
      // icon afterwards if you want a distinct one.
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/apps/web/src/components/app-shell.tsx",
        pattern:
          /(\{ href: "\/projects", key: "projects", icon: FolderKanbanIcon \},)/,
        template:
          '$1\n  { href: "/{{ plural }}", key: "{{ camelCase plural }}", icon: FolderKanbanIcon },',
      },
      // plop `modify` is a silent no-op when the pattern does not match —
      // verify the automated registrations really landed.
      function verifyRegistrations(answers) {
        const data = answers as {
          plural: string;
          turbo: { paths: { root: string } };
        };
        const root = data.turbo.paths.root;
        const camelPlural = toCamel(data.plural);
        const checks: [string, string][] = [
          [
            path.join(root, "packages/i18n/messages/en.json"),
            `"${camelPlural}": {`,
          ],
          [
            path.join(root, "packages/i18n/messages/fr.json"),
            `"${camelPlural}": {`,
          ],
          [
            path.join(root, "apps/web/src/components/app-shell.tsx"),
            `href: "/${data.plural}"`,
          ],
        ];
        const missed = checks
          .filter(
            ([file, needle]) => !readFileSync(file, "utf8").includes(needle)
          )
          .map(([file, needle]) => `${needle} missing from ${file}`);
        if (missed.length > 0) {
          throw new Error(
            `Anchor drift — automated registration failed:\n${missed.join("\n")}`
          );
        }
        return "i18n namespaces (en+fr) and nav item registered";
      },
      function reminders() {
        return [
          "Next steps:",
          "  1. pnpm lint:fix                          # normalize generated import order",
          "  2. pnpm db:generate && pnpm db:migrate    # create the migration",
          "  3. Review the generated type in packages/fga/model.fga, then pnpm fga:bootstrap",
          "  4. i18n keys (en+fr) and the nav item were inserted automatically —",
          "     review the copy and swap the nav icon in apps/web/src/components/app-shell.tsx",
          "  5. Make the generated int tests pass (TDD: they start as todos)",
        ].join("\n");
      },
    ],
  });
}
