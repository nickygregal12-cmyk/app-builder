/**
 * What is this product, before App Builder changes anything about it?
 *
 * This is the first half of the brownfield entry mode in
 * `docs/PLATFORM_PARITY_PROGRAMME.md` §5: understand an existing repository, and
 * do not touch it. Nothing here mutates, installs, executes a project script,
 * runs a migration, reads a secret or reaches a network. The read-only boundary
 * lives in `brownfield-evidence.mjs` and is enforced rather than promised.
 *
 * It is deliberately NOT a second Project Manifest. A manifest says what a
 * product should be; this says what one already is, with the evidence, so a
 * later diagnosis has something to disagree with. The two never merge: the day
 * a profile starts carrying intent is the day an adopted repository acquires a
 * greenfield opinion nobody stated.
 *
 * Everything it reports is one of four things — demonstrated, inferred,
 * unproven, not-applicable — and the difference is load-bearing. A profile that
 * said "this app uses RBAC" because `roles.ts` exists would be worse than no
 * profile, because the next agent would act on it.
 *
 * ## What it deliberately does not do
 *
 * - It does not classify. `keep`/`refactor`/`redesign`/`replace`/`remove`/`add`
 *   is a diagnosis, and diagnosing from a first read is how "replace" comes to
 *   mean "the factory prefers a different framework".
 * - It does not read a deployed URL. A repository explains implementation; a
 *   running site explains experience. Neither substitutes for the other, and
 *   this half is the repository half.
 * - It does not assimilate a design system. Token files and component
 *   directories are located and counted; what they mean is §5.2 and needs
 *   usage evidence this pass does not gather.
 */

import path from 'node:path';

import {
  at,
  demonstrated,
  fromCommand,
  hashProfile,
  inferred,
  notApplicable,
  readJsonFile,
  readOnlyGit,
  readTextFile,
  unproven,
  walkRepository,
} from './brownfield-evidence.mjs';

// --- Repository identity --------------------------------------------------------

function profileRepository(root, files) {
  const isRepo = readOnlyGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (isRepo.status !== 0) {
    return {
      isGitRepository: demonstrated(false, [fromCommand('git rev-parse --is-inside-work-tree', 'exited non-zero')]),
      commit: unproven('Not a git work tree, so there is no revision to freeze a baseline against.'),
      branch: unproven('Not a git work tree.'),
      remote: unproven('Not a git work tree.'),
      clean: unproven('Not a git work tree.'),
      fileCount: demonstrated(files.length, [fromCommand('directory walk', `${files.length} files outside ignored directories`)]),
    };
  }

  const commit = readOnlyGit(root, ['rev-parse', 'HEAD']);
  const branch = readOnlyGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = readOnlyGit(root, ['config', '--get', 'remote.origin.url']);
  const status = readOnlyGit(root, ['status', '--porcelain']);

  return {
    isGitRepository: demonstrated(true, [fromCommand('git rev-parse --is-inside-work-tree', 'true')]),
    commit: commit.status === 0 && commit.stdout
      ? demonstrated(commit.stdout, [fromCommand('git rev-parse HEAD', commit.stdout)])
      : unproven('HEAD does not resolve. A repository with no commits cannot be baselined.'),
    branch: branch.status === 0 && branch.stdout
      ? demonstrated(branch.stdout, [fromCommand('git rev-parse --abbrev-ref HEAD', branch.stdout)])
      : unproven('No branch name resolves; the checkout may be detached.'),
    remote: remote.status === 0 && remote.stdout
      ? demonstrated(remote.stdout, [fromCommand('git config --get remote.origin.url', remote.stdout)])
      : unproven('No origin remote is configured, so this repository has no identity beyond its path.'),
    // Cleanliness matters because a profile of a dirty tree is a profile of
    // something no revision names, and a baseline built on it cannot be
    // returned to.
    clean: status.status === 0
      ? demonstrated(status.stdout === '', [fromCommand('git status --porcelain', status.stdout === '' ? 'no changes' : `${status.stdout.split('\n').length} changed path(s)`)])
      : unproven('git status did not report, so the working tree state is unknown.'),
    fileCount: demonstrated(files.length, [fromCommand('directory walk', `${files.length} files outside ignored directories`)]),
  };
}

// --- Workspace and package manager ----------------------------------------------

const LOCKFILES = Object.freeze([
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
]);

function profileWorkspace(root, files, rootPackage) {
  const present = LOCKFILES.filter(([file]) => files.includes(file));
  const packageManager = present.length === 1
    // The lockfile is the repository stating which manager it uses. A
    // `packageManager` field says the same thing and is easier to get wrong,
    // so the lockfile wins and both are recorded.
    ? demonstrated(present[0][1], [at(present[0][0], 'lockfile')])
    : present.length > 1
      ? unproven(`Several lockfiles are present (${present.map(([file]) => file).join(', ')}), so which manager owns this repository is contested rather than unknown.`, present.map(([file]) => at(file, 'lockfile')))
      : rootPackage?.packageManager
        ? inferred(String(rootPackage.packageManager).split('@')[0], [at('package.json', `packageManager: ${rootPackage.packageManager}`)], 'The manifest declares a package manager and no lockfile is committed, so the declaration is the only statement and nothing has proved it was used.')
        : unproven('No lockfile and no declared package manager.');

  // Workspace members, from whichever of the two conventions the repo uses.
  const declared = Array.isArray(rootPackage?.workspaces)
    ? rootPackage.workspaces
    : Array.isArray(rootPackage?.workspaces?.packages) ? rootPackage.workspaces.packages : null;
  const pnpmWorkspace = readTextFile(root, 'pnpm-workspace.yaml');

  const packageFiles = files.filter((file) => file.endsWith('package.json') && file !== 'package.json');
  const packages = packageFiles.map((file) => {
    const manifest = readJsonFile(root, file) ?? {};
    return {
      directory: path.posix.dirname(file),
      name: typeof manifest.name === 'string' ? manifest.name : null,
      private: manifest.private === true,
      scripts: Object.keys(manifest.scripts ?? {}).sort(),
    };
  });

  return {
    packageManager,
    monorepo: declared || pnpmWorkspace
      ? demonstrated(true, [declared ? at('package.json', `workspaces: ${JSON.stringify(declared)}`) : at('pnpm-workspace.yaml', 'workspace definition')])
      : packages.length
        ? inferred(true, packages.slice(0, 5).map((entry) => at(`${entry.directory}/package.json`, entry.name ?? 'unnamed')), 'Several package manifests exist and no workspace definition declares them, so they may be a monorepo or may be unrelated vendored projects.')
        : demonstrated(false, [at('package.json', 'no workspace definition and no nested package manifests')]),
    workspaceGlobs: declared
      ? demonstrated(declared, [at('package.json', 'workspaces')])
      : pnpmWorkspace
        ? demonstrated(pnpmWorkspace.split('\n').filter((line) => line.trim().startsWith('-')).map((line) => line.replace(/^\s*-\s*['"]?|['"]?\s*$/g, '')), [at('pnpm-workspace.yaml', 'packages')])
        : notApplicable('No workspace definition.'),
    packages: demonstrated(packages, packages.length ? packages.slice(0, 8).map((entry) => at(`${entry.directory}/package.json`, entry.name ?? 'unnamed')) : [at('package.json', 'no nested package manifests found')]),
  };
}

// --- Stack ----------------------------------------------------------------------

/**
 * Framework detection, from dependencies rather than from directory names.
 *
 * Order matters: a Next.js repository also depends on React, and reporting
 * "React" for it would be true and useless. The first match wins and the
 * evidence names the dependency that decided it.
 */
const FRAMEWORKS = Object.freeze([
  { id: 'next', label: 'Next.js', packages: ['next'] },
  { id: 'nuxt', label: 'Nuxt', packages: ['nuxt'] },
  { id: 'astro', label: 'Astro', packages: ['astro'] },
  { id: 'remix', label: 'Remix', packages: ['@remix-run/react', '@remix-run/node'] },
  { id: 'sveltekit', label: 'SvelteKit', packages: ['@sveltejs/kit'] },
  { id: 'angular', label: 'Angular', packages: ['@angular/core'] },
  { id: 'vite-react', label: 'React on Vite', packages: ['vite'], also: ['react'] },
  { id: 'vite-vue', label: 'Vue on Vite', packages: ['vite'], also: ['vue'] },
  { id: 'react', label: 'React', packages: ['react'] },
  { id: 'vue', label: 'Vue', packages: ['vue'] },
  { id: 'express', label: 'Express', packages: ['express'] },
]);

const SCRIPT_ROLES = Object.freeze([
  ['build', ['build']],
  ['test', ['test', 'test:unit']],
  ['lint', ['lint']],
  ['typecheck', ['typecheck', 'type-check', 'tsc']],
  ['dev', ['dev', 'start:dev', 'serve']],
]);

function allDependencies(manifest) {
  return { ...manifest?.dependencies, ...manifest?.devDependencies };
}

function profileStack(root, files, rootPackage, packageManifests) {
  // A monorepo's framework often lives in a workspace member, not at the root,
  // so dependencies are pooled and the evidence names where each came from.
  const pooled = new Map();
  for (const [file, manifest] of packageManifests) {
    for (const [name, range] of Object.entries(allDependencies(manifest))) {
      if (!pooled.has(name)) pooled.set(name, { range, from: file });
    }
  }

  const matched = FRAMEWORKS.find((entry) => entry.packages.some((name) => pooled.has(name)) && (!entry.also || entry.also.some((name) => pooled.has(name))));
  const framework = matched
    ? demonstrated(matched.label, [
      ...matched.packages.filter((name) => pooled.has(name)).map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)),
      ...(matched.also ?? []).filter((name) => pooled.has(name)).map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)),
    ])
    : unproven('No dependency the profiler recognises identifies a framework. That is a limit of this list, not a statement that the project has none.');

  const typescript = files.includes('tsconfig.json') || files.some((file) => file.endsWith('/tsconfig.json'));
  const language = typescript
    ? demonstrated('TypeScript', [at(files.includes('tsconfig.json') ? 'tsconfig.json' : files.find((file) => file.endsWith('/tsconfig.json')), 'compiler configuration')])
    : pooled.has('typescript')
      ? inferred('TypeScript', [at(pooled.get('typescript').from, `typescript ${pooled.get('typescript').range}`)], 'TypeScript is a dependency and no tsconfig was found, so it may be used for tooling rather than for the product.')
      : inferred('JavaScript', [], 'No TypeScript configuration or dependency was found.');

  const scripts = rootPackage?.scripts ?? {};
  const commands = {};
  for (const [role, names] of SCRIPT_ROLES) {
    const found = names.find((name) => typeof scripts[name] === 'string');
    commands[role] = found
      ? demonstrated({ script: found, command: scripts[found] }, [at('package.json', `scripts.${found}`)])
      : unproven(`No root script answers "${role}". A workspace member may define one; the repository root does not.`);
  }

  // The dependencies that shape the product, not the 400 that support them.
  // Anything else is noise a reader has to filter, and a profile nobody reads
  // is not evidence.
  const major = [...pooled]
    .filter(([name]) => !name.startsWith('@types/') && !/eslint|prettier|oxlint|husky|lint-staged/.test(name))
    .filter(([name]) => FRAMEWORKS.some((entry) => entry.packages.includes(name) || entry.also?.includes(name))
      || /^(@supabase|@prisma|prisma|drizzle|@tanstack|@trpc|zod|@playwright|playwright|vitest|jest|@testing-library|tailwindcss|@stripe|stripe|@auth|next-auth|@clerk|firebase|@sentry|react-router|@radix-ui|@mui|@chakra-ui)/.test(name))
    .map(([name, entry]) => ({ name, range: entry.range, declaredIn: entry.from }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    framework,
    language,
    commands,
    // An empty list is a real answer — a repository can genuinely depend on
    // nothing this recognises — but it is still a claim, so it still names what
    // was read to reach it.
    majorPackages: demonstrated(
      major,
      major.length
        ? major.slice(0, 10).map((entry) => at(entry.declaredIn, `${entry.name} ${entry.range}`))
        : packageManifests.map(([file]) => at(file, 'declares no dependency the profiler recognises as product-shaping')),
    ),
    dependencyCount: demonstrated(pooled.size, [fromCommand('pooled package manifests', `${packageManifests.length} manifest(s)`)]),
  };
}

// --- Architecture ----------------------------------------------------------------

const ROUTE_DIRECTORIES = Object.freeze([
  { pattern: /(^|\/)app\/[^/]*\/?page\.(tsx|jsx|ts|js)$/, convention: 'next-app-router' },
  { pattern: /(^|\/)pages\/(?!api\/).+\.(tsx|jsx|ts|js)$/, convention: 'next-pages-router' },
  { pattern: /(^|\/)src\/pages\/.+\.(astro|md|mdx)$/, convention: 'astro-pages' },
  { pattern: /(^|\/)src\/routes\/.+\.(svelte|ts|tsx)$/, convention: 'sveltekit-routes' },
  { pattern: /(^|\/)src\/(pages|routes|views|screens)\/.+\.(tsx|jsx|vue)$/, convention: 'directory-convention' },
]);

const SERVER_PATTERNS = Object.freeze([
  { pattern: /(^|\/)netlify\/functions\/.+\.(ts|js|mjs)$/, kind: 'netlify-function' },
  { pattern: /(^|\/)(api|pages\/api)\/.+\.(ts|js|mjs)$/, kind: 'api-route' },
  { pattern: /(^|\/)supabase\/functions\/[^/]+\/index\.(ts|js)$/, kind: 'supabase-edge-function' },
  { pattern: /(^|\/)functions\/[^/]+\.(ts|js|mjs)$/, kind: 'serverless-function' },
  { pattern: /\.server\.(ts|tsx|js)$/, kind: 'server-only-module' },
]);

function profileArchitecture(root, files, packageManifests) {
  const routes = [];
  for (const file of files) {
    const matched = ROUTE_DIRECTORIES.find((entry) => entry.pattern.test(file));
    if (matched) routes.push({ file, convention: matched.convention });
  }
  const server = [];
  for (const file of files) {
    const matched = SERVER_PATTERNS.find((entry) => entry.pattern.test(file));
    if (matched) server.push({ file, kind: matched.kind });
  }

  const applications = packageManifests
    .filter(([, manifest]) => Boolean(manifest?.scripts?.build || manifest?.scripts?.dev || manifest?.scripts?.start))
    .map(([file, manifest]) => ({ directory: path.posix.dirname(file), name: manifest.name ?? null }));

  const libraries = packageManifests
    .filter(([, manifest]) => !manifest?.scripts?.build && !manifest?.scripts?.dev && !manifest?.scripts?.start)
    .map(([file, manifest]) => ({ directory: path.posix.dirname(file), name: manifest.name ?? null }));

  // Route LOCATIONS, not routes. Turning a file path into a URL needs the
  // framework's own routing rules, and guessing them is how a profile starts
  // claiming a product has pages it does not serve.
  const conventions = [...new Set(routes.map((entry) => entry.convention))];

  return {
    applications: applications.length
      ? demonstrated(applications, applications.slice(0, 8).map((entry) => at(`${entry.directory}/package.json`, entry.name ?? 'unnamed')))
      : unproven('No package manifest declares a build, dev or start script, so no buildable application was identified.'),
    libraries: libraries.length
      ? demonstrated(libraries, libraries.slice(0, 8).map((entry) => at(`${entry.directory}/package.json`, entry.name ?? 'unnamed')))
      : notApplicable('No package manifests without build scripts were found.'),
    routeLocations: routes.length
      ? demonstrated({ count: routes.length, conventions, files: routes.slice(0, 40).map((entry) => entry.file) }, routes.slice(0, 8).map((entry) => at(entry.file, entry.convention)))
      : unproven('No file matched a routing convention the profiler recognises. The product may route at runtime, from configuration, or by a convention not in this list.'),
    serverBoundaries: server.length
      ? demonstrated({ count: server.length, kinds: [...new Set(server.map((entry) => entry.kind))], files: server.slice(0, 40).map((entry) => entry.file) }, server.slice(0, 8).map((entry) => at(entry.file, entry.kind)))
      : unproven('No serverless function, API route or server-only module was found by path convention.'),
  };
}

// --- Data and backend --------------------------------------------------------------

const BACKEND_SIGNALS = Object.freeze([
  { id: 'supabase', label: 'Supabase', packages: ['@supabase/supabase-js', '@supabase/ssr'], directories: ['supabase/'] },
  { id: 'prisma', label: 'Prisma', packages: ['@prisma/client', 'prisma'], directories: ['prisma/'] },
  { id: 'drizzle', label: 'Drizzle', packages: ['drizzle-orm'], directories: ['drizzle/'] },
  { id: 'firebase', label: 'Firebase', packages: ['firebase', 'firebase-admin'], directories: [] },
]);

function profileData(root, files, pooled) {
  const found = BACKEND_SIGNALS.filter((entry) => entry.packages.some((name) => pooled.has(name)) || entry.directories.some((dir) => files.some((file) => file.startsWith(dir))));

  const migrations = files.filter((file) => /(^|\/)(migrations|supabase\/migrations|prisma\/migrations|drizzle)\/.+\.(sql|ts|js)$/.test(file));
  const policies = files.filter((file) => file.endsWith('.sql')).filter((file) => {
    const text = readTextFile(root, file, { maxBytes: 256 * 1024 });
    return text ? /row level security|create policy/i.test(text) : false;
  });
  const envExamples = files.filter((file) => /(^|\/)\.env\.(example|sample|template)$/.test(file) || file === '.env.example');

  return {
    provider: found.length
      ? demonstrated(found.map((entry) => entry.label), found.flatMap((entry) => [
        ...entry.packages.filter((name) => pooled.has(name)).map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)),
        ...entry.directories.filter((dir) => files.some((file) => file.startsWith(dir))).map((dir) => at(dir, 'directory present')),
      ]))
      : unproven('No database or backend-as-a-service dependency the profiler recognises was found.'),
    migrations: migrations.length
      ? demonstrated({ count: migrations.length, files: migrations.slice(0, 20) }, migrations.slice(0, 5).map((file) => at(file, 'migration')))
      : unproven('No migration directory was found. Schema may be managed outside the repository, which is a fact worth knowing before changing it.'),
    securityPolicies: policies.length
      ? demonstrated({ count: policies.length, files: policies.slice(0, 20) }, policies.slice(0, 5).map((file) => at(file, 'declares row level security or a policy')))
      : unproven('No SQL file in the repository declares row level security or a policy. Whether the data is protected is therefore not established here, and must not be assumed either way.'),
    // Named because they are named, and nothing more. What a variable is FOR is
    // not knowable from its name, and no value is ever read.
    environmentReferences: envExamples.length
      ? demonstrated(envExamples.flatMap((file) => (readTextFile(root, file) ?? '')
        .split('\n')
        .map((line) => line.split('=')[0].trim())
        .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name))
        .map((name) => ({ name, declaredIn: file }))), envExamples.map((file) => at(file, 'declared environment')))
      : unproven('No .env example file declares what environment this product expects.'),
    auth: pooled.has('@supabase/supabase-js') || pooled.has('next-auth') || pooled.has('@clerk/nextjs') || pooled.has('@auth/core')
      ? inferred(
        'An authentication library is a dependency',
        ['@supabase/supabase-js', 'next-auth', '@clerk/nextjs', '@auth/core'].filter((name) => pooled.has(name)).map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)),
        'A dependency proves the library is available, never that sessions, roles or access rules work. What this product actually enforces needs executable evidence, and this pass runs nothing.',
      )
      : unproven('No authentication library the profiler recognises is a dependency.'),
  };
}

// --- Testing and CI ------------------------------------------------------------------

function profileTesting(root, files, pooled) {
  const kinds = [
    // Excluded by DIRECTORY, not by substring. A file called
    // `tests/scripts/e2eProjectGating.test.ts` is a unit test about end-to-end
    // gating and runs under the unit runner; `e2e/journey.spec.ts` is the other
    // thing. Matching the word anywhere in a path got that backwards, and got
    // it backwards inconsistently — the same directory's `bracketConflictE2E.test.ts`
    // survived only because the check happened to be case-sensitive.
    { id: 'unit', match: /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/, exclude: /(^|\/)(e2e|playwright|cypress)\//i },
    { id: 'e2e', match: /(^|\/)(e2e|playwright|cypress)\/.+\.(ts|tsx|js|mjs)$/i },
    { id: 'database', match: /(^|\/)(tests?|supabase\/tests?)\/.+\.(sql|pgtap)$/ },
  ];
  const counted = {};
  for (const kind of kinds) {
    const matched = files.filter((file) => kind.match.test(file) && !(kind.exclude?.test(file)));
    counted[kind.id] = matched.length
      ? demonstrated({ count: matched.length, files: matched.slice(0, 15) }, matched.slice(0, 5).map((file) => at(file, kind.id)))
      : unproven(`No file matches the ${kind.id} test convention.`);
  }

  const browser = pooled.has('@playwright/test') || pooled.has('playwright') || pooled.has('cypress');
  const accessibility = pooled.has('@axe-core/playwright') || pooled.has('axe-core') || pooled.has('jest-axe');
  const workflows = files.filter((file) => /^\.github\/workflows\/.+\.ya?ml$/.test(file));

  return {
    ...counted,
    browserTooling: browser
      ? demonstrated(['@playwright/test', 'playwright', 'cypress'].filter((name) => pooled.has(name)), ['@playwright/test', 'playwright', 'cypress'].filter((name) => pooled.has(name)).map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)))
      : unproven('No browser-driving dependency was found.'),
    accessibilityTooling: accessibility
      ? demonstrated(['@axe-core/playwright', 'axe-core', 'jest-axe'].filter((name) => pooled.has(name)), ['@axe-core/playwright', 'axe-core', 'jest-axe'].filter((name) => pooled.has(name)).map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)))
      : unproven('No accessibility-testing dependency was found. Whether the product is accessible is a separate question this does not answer.'),
    // A workflow existing is not a workflow passing, and this says only the
    // first. Nothing here reads a run, a badge or a status.
    continuousIntegration: workflows.length
      ? demonstrated({ count: workflows.length, files: workflows }, workflows.slice(0, 5).map((file) => at(file, 'workflow definition')))
      : unproven('No GitHub Actions workflow is committed. Another CI system may exist outside the repository.'),
  };
}

// --- Deployment -------------------------------------------------------------------

const DEPLOY_SIGNALS = Object.freeze([
  { id: 'netlify', label: 'Netlify', files: ['netlify.toml'] },
  { id: 'vercel', label: 'Vercel', files: ['vercel.json'] },
  { id: 'cloudflare', label: 'Cloudflare', files: ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json'] },
  { id: 'docker', label: 'Container image', files: ['Dockerfile'] },
  { id: 'fly', label: 'Fly.io', files: ['fly.toml'] },
]);

function profileDeployment(root, files) {
  const found = DEPLOY_SIGNALS.filter((entry) => entry.files.some((file) => files.includes(file)));
  return {
    platform: found.length
      ? demonstrated(found.map((entry) => entry.label), found.flatMap((entry) => entry.files.filter((file) => files.includes(file)).map((file) => at(file, 'deployment configuration'))))
      : unproven('No deployment configuration file the profiler recognises is committed. Deployment may be configured in a hosting dashboard, which is outside the repository and outside what this can see.'),
    configuration: found.length
      ? demonstrated(found.flatMap((entry) => entry.files.filter((file) => files.includes(file))), found.flatMap((entry) => entry.files.filter((file) => files.includes(file)).map((file) => at(file, 'read but not interpreted'))))
      : notApplicable('No deployment configuration to record.'),
  };
}

// --- Design system, shallow ---------------------------------------------------------

/**
 * Located, counted, and nothing more.
 *
 * §5.2 assimilation asks which components are product standards versus one-off
 * local code, and that needs usage and ownership evidence this pass does not
 * gather. Naming a directory "the design system" because it is called
 * `components` would be exactly the inference the evidence rules forbid.
 */
function profileDesignSystem(root, files, pooled) {
  const tokenFiles = files.filter((file) => /(tokens|theme|design-tokens)\.(css|ts|js|json|scss)$/.test(file) || /(^|\/)(tokens|theme)\/[^/]+\.(css|ts|json)$/.test(file));
  const componentDirs = [...new Set(files
    .filter((file) => /(^|\/)(components|ui|primitives|design-system)\/[^/]+\.(tsx|jsx|vue|svelte|astro)$/.test(file))
    .map((file) => path.posix.dirname(file)))];
  const uiPackages = ['@radix-ui/react-dialog', '@mui/material', '@chakra-ui/react', 'tailwindcss', 'styled-components', '@emotion/react'].filter((name) => pooled.has(name));

  return {
    tokenFiles: tokenFiles.length
      ? demonstrated(tokenFiles.slice(0, 20), tokenFiles.slice(0, 5).map((file) => at(file, 'named as tokens or a theme')))
      : unproven('No file is named as a token or theme source. Design values may be inline, in a framework config, or in a package.'),
    componentDirectories: componentDirs.length
      ? demonstrated({ count: componentDirs.length, directories: componentDirs.slice(0, 20) }, componentDirs.slice(0, 5).map((dir) => at(dir, 'holds component files')))
      : unproven('No directory matches a component convention.'),
    uiPackages: uiPackages.length
      ? demonstrated(uiPackages, uiPackages.map((name) => at(pooled.get(name).from, `${name} ${pooled.get(name).range}`)))
      : unproven('No shared UI or styling package the profiler recognises is a dependency.'),
    assimilation: notApplicable(
      'Not attempted. Which components are product standards rather than one-off local code needs usage, props, variant and ownership evidence, which is docs/PLATFORM_PARITY_PROGRAMME.md §5.2 and not this pass. A directory named "components" is not a design system.',
    ),
  };
}

// --- The profile ---------------------------------------------------------------------

/**
 * Read an existing repository and describe it, changing nothing.
 *
 * @param {string} repositoryPath  the repository to profile
 * @param {object} [options]
 * @param {string} [options.profiledAt]  ISO timestamp, supplied so a run is reproducible
 */
export function profileRepositoryTree(repositoryPath, { profiledAt = new Date().toISOString(), walkLimits = {} } = {}) {
  const root = path.resolve(repositoryPath);
  const walk = walkRepository(root, walkLimits);
  const { files } = walk;

  const rootPackage = readJsonFile(root, 'package.json');
  const packageManifests = [['package.json', rootPackage], ...files
    .filter((file) => file.endsWith('package.json') && file !== 'package.json')
    .map((file) => [file, readJsonFile(root, file)])]
    .filter(([, manifest]) => manifest);

  const pooled = new Map();
  for (const [file, manifest] of packageManifests) {
    for (const [name, range] of Object.entries({ ...manifest?.dependencies, ...manifest?.devDependencies })) {
      if (!pooled.has(name)) pooled.set(name, { range, from: file });
    }
  }

  const profile = {
    schemaVersion: 1,
    authority: 'brownfield-profiler',
    profiledAt,
    // Named, because a profile of a path nobody can resolve later is not a
    // baseline. The revision under `repository.commit` is what actually freezes it.
    subject: { path: root, name: path.basename(root) },
    // What was and was not looked at. A profile that quietly examined part of a
    // repository would read as a profile of all of it.
    coverage: {
      filesExamined: files.length,
      truncated: walk.truncated,
      deepestDirectory: walk.deepest,
      limits: { maxFiles: walk.maxFiles, maxDepth: walk.maxDepth },
      note: walk.truncated
        ? `The walk stopped at ${walk.maxFiles} files. Everything below is a profile of part of this repository and must not be read as a profile of all of it.`
        : 'Every file outside ignored build and dependency directories was examined.',
    },
    repository: profileRepository(root, files),
    workspace: profileWorkspace(root, files, rootPackage),
    stack: profileStack(root, files, rootPackage, packageManifests),
    architecture: profileArchitecture(root, files, packageManifests),
    data: profileData(root, files, pooled),
    testing: profileTesting(root, files, pooled),
    deployment: profileDeployment(root, files),
    designSystem: profileDesignSystem(root, files, pooled),
    // Stated so nobody has to infer the boundary from what is absent.
    notAttempted: [
      { question: 'What does the deployed product actually do?', reason: 'A repository explains implementation; only a running product explains experience. No URL was read and none may be inferred from source.' },
      { question: 'Do the tests pass? Does it build?', reason: 'Nothing was installed and no project script was executed. A test file existing is not a test passing.' },
      { question: 'Is the data protected?', reason: 'Policy files are located, never executed. Whether a policy is correct needs a live database and is a separate acceptance.' },
      { question: 'keep / refactor / redesign / replace / remove / add?', reason: 'Classification is diagnosis and needs more than a first read. Diagnosing here is how "replace" comes to mean "the factory prefers a different framework".' },
    ],
  };

  return { ...profile, profileHash: hashProfile(profile) };
}

/**
 * Every field the profile could not establish, flattened.
 *
 * The honest half of a profile, and the half a reader skips unless it is
 * assembled for them. A profile is judged on this list, not on its length.
 */
export function unprovenFields(profile) {
  const found = [];
  const visit = (value, trail) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.status === 'string') {
      if (value.status === 'unproven' || value.status === 'inferred') {
        found.push({ field: trail.join('.'), status: value.status, detail: value.reason ?? value.basis ?? null });
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, [...trail, key]);
  };
  for (const section of ['repository', 'workspace', 'stack', 'architecture', 'data', 'testing', 'deployment', 'designSystem']) {
    visit(profile[section], [section]);
  }
  return found;
}
