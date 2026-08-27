/**
 * Stage Q5 — can generated code bypass the compiled design system?
 *
 * `DesignSystemSpec` compiles to a token set, and the question that decides
 * whether that set is an authority or a suggestion is whether anything shipped
 * into a generated project sets a colour without asking it. Measured first,
 * before any rule was written: eighteen colour literals across the shipped
 * surface, fifteen of them a complete parallel palette in the auth recipe, and
 * one reference to a token the set does not declare.
 *
 * **Why not Stylelint.** The two rules below are about the *token contract*,
 * not about CSS style. `undeclared-token` needs to know which custom properties
 * the compiled spec and the template actually emit — a fact that lives in this
 * repository and that a generic linter would have to be told through
 * configuration restating it. Principle 6: a dependency has to solve a problem
 * the platform does not, and reading `tokens.css` is not that problem.
 *
 * **The one rule about where a colour may be written.** A colour literal is
 * allowed inside a custom-property declaration and nowhere else. That is what
 * a token *is*: `--color-accent: #315b72` is the brand being written down, and
 * `background: #315b72` is a rule deciding a colour for itself. It needs no
 * allowlist of blessed files, which matters because the file that declares a
 * project's accent is generated per project and would have to be guessed.
 *
 * **What it deliberately does not do.** Font sizes are not a rule. The scale is
 * seven steps and the template legitimately sets `.74rem` on an eyebrow and
 * `1.05rem` on a lead paragraph; a rule that flagged those would be wrong far
 * more often than right, and a rule that is wrong a third of the time teaches
 * the reader to skim. Spacing is not a rule for the same reason. Colour is,
 * because a colour is never a matter of degree: either it came from the brand
 * or it did not.
 *
 * Nor does it judge *which* token a declaration should hold. A stylesheet that
 * declares its own colour property has still written a design decision down
 * where a reviewer sees it in the diff; whether a project-local property may
 * exist at all is the bespoke-presentation lane's rule, and that lane already
 * refuses one the compiled DesignSystemSpec does not emit.
 */

export const DESIGN_SYSTEM_RULES = Object.freeze({
  'raw-colour': {
    severity: 'violation',
    title: 'A colour literal outside the token set',
    guidance:
      'The project brand compiles to custom properties. A literal here renders the same colour whatever brand the build resolved, so the surface silently leaves the design system. Use a token, or declare a new one in the token source where a brand can override it.',
  },
  'undeclared-token': {
    severity: 'violation',
    title: 'A reference to a custom property nothing declares',
    guidance:
      'A `var(--x)` whose property no token source declares resolves to its fallback on every build, so the fallback is the real value and the token is decoration. Declare the property or use one that exists.',
  },
});

/** `#abc`, `#aabbcc`, `#aabbccdd`. Always a literal; there is no other reading. */
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * The functional notations, which are only a literal when their arguments are.
 *
 * `rgb(15 23 42 / 12%)` is a colour typed into a rule. `rgb(var(--scrim) / 12%)`
 * is the token set with an opacity applied, which is the intended way to vary a
 * token and must not be reported — a rule that forbade it would push authors
 * back to the literal it exists to prevent.
 */
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/g;

/** The text between a function's opening parenthesis and its match. */
function functionArguments(source, openIndex) {
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    if (source[cursor] === '(') depth += 1;
    else if (source[cursor] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, cursor);
    }
  }
  return source.slice(openIndex + 1);
}

/**
 * Whether an offset sits inside a custom-property declaration.
 *
 * A declaration ends at the previous `;`, `{` or `}`, so the property name is
 * whatever precedes the first `:` after that point. Two custom properties can
 * be nested in one value — `--a: var(--b, #fff)` — and the outermost one is
 * still the declaration, which is what this reads.
 */
function insideCustomPropertyDeclaration(source, offset) {
  const start = Math.max(source.lastIndexOf(';', offset), source.lastIndexOf('{', offset), source.lastIndexOf('}', offset));
  const colon = source.indexOf(':', start + 1);
  if (colon === -1 || colon > offset) return false;
  return source.slice(start + 1, colon).trim().startsWith('--');
}

/** Every `var(--name)` reference, and every `--name:` declaration. */
const VAR_REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const VAR_DECLARATION = /(^|[;{\s])(--[a-zA-Z0-9_-]+)\s*:/g;

/**
 * Strip comments so a colour named in prose is not a finding.
 *
 * The same reasoning as the mutation harness's mask: a survivor that means
 * nothing teaches the reader to skim the list.
 */
export function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
}

/** Custom properties a source declares. */
export function declaredTokens(source) {
  const names = new Set();
  for (const match of withoutComments(source).matchAll(VAR_DECLARATION)) names.add(match[2]);
  return names;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function finding(check, file, line, detail) {
  return { check, ...DESIGN_SYSTEM_RULES[check], file, line, detail };
}

/**
 * Lint one stylesheet against a declared token set.
 *
 * `declared` is the union of every token source plus, when a real build is
 * being linted, whatever its own generated brand and design-system stylesheets
 * emit — so a project-specific token is not reported as undeclared.
 */
export function lintStylesheet({ file, source, declared }) {
  const findings = [];
  const stripped = withoutComments(source);

  for (const match of stripped.matchAll(HEX_LITERAL)) {
    if (insideCustomPropertyDeclaration(stripped, match.index)) continue;
    findings.push(finding('raw-colour', file, lineOf(source, match.index), match[0]));
  }
  for (const match of stripped.matchAll(COLOUR_FUNCTION)) {
    if (insideCustomPropertyDeclaration(stripped, match.index)) continue;
    const open = match.index + match[0].length - 1;
    const args = functionArguments(stripped, open);
    if (args.includes('var(')) continue;
    findings.push(finding('raw-colour', file, lineOf(source, match.index), `${match[0].trim()}${args})`));
  }

  for (const match of stripped.matchAll(VAR_REFERENCE)) {
    const name = match[1];
    if (declared.has(name)) continue;
    findings.push(finding('undeclared-token', file, lineOf(source, match.index), name));
  }

  return findings;
}

/**
 * Lint a whole set of stylesheets against the tokens the set itself declares.
 *
 * Every file contributes its declarations, because the set a build actually
 * resolves is the template's token source plus whatever its compiled brand
 * overrode — and which file that is differs per project.
 */
export function lintDesignSystem({ files }) {
  const declared = new Set();
  for (const entry of files) for (const name of declaredTokens(entry.source)) declared.add(name);

  const findings = [];
  for (const entry of files) findings.push(...lintStylesheet({ ...entry, declared }));
  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);

  return {
    schemaVersion: 1,
    authority: 'design-system-tokens',
    files: files.length,
    declaredTokens: [...declared].sort(),
    findings,
    clean: findings.length === 0,
  };
}
