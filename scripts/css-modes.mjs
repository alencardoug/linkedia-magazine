// PostCSS plugin (astro.config.mjs, V2-06b, D-085): writes each reading mode's look once and applies it on both
// paths. `@mode light { … }` and `@mode dark { … }` expand to
//   :root[data-mode='<mode>'] <selector>                                  (the reader's explicit pick), and
//   @media (prefers-color-scheme: <mode>) { :root:not([data-mode]) <selector> }   (no pick: the system's mode),
// so the system look needs no JS and both paths have the same specificity. Black has no `@mode` block: it is the
// base stylesheet (`minimal-dark`), shown only when picked. Inside a block a selector starting with `:root` gets the
// prefix on that `:root`; any other selector is prefixed as a descendant. Nested @media/@supports are kept;
// @keyframes must live outside the block (their names are global).

const SYSTEM = { light: 'light', dark: 'dark' };

export function prefixSelector(selector, prefix) {
  return selector.startsWith(':root') ? prefix + selector.slice(':root'.length) : `${prefix} ${selector}`;
}

function prefixed(block, prefix) {
  const copy = block.clone();
  copy.walkRules((rule) => {
    rule.selectors = rule.selectors.map((s) => prefixSelector(s.trim(), prefix));
  });
  return copy.nodes;
}

export function cssModes() {
  return {
    postcssPlugin: 'linkedia-css-modes',
    AtRule: {
      mode(atRule, { AtRule }) {
        const mode = atRule.params.trim();
        if (!SYSTEM[mode]) throw atRule.error(`@mode desconhecido: "${mode}" (aceitos: light, dark)`);
        atRule.walkAtRules('keyframes', (k) => {
          throw k.error('@keyframes fora de @mode (nomes são globais)');
        });
        const explicit = prefixed(atRule, `:root[data-mode='${mode}']`);
        const system = new AtRule({ name: 'media', params: `(prefers-color-scheme: ${SYSTEM[mode]})` });
        system.append(prefixed(atRule, ':root:not([data-mode])'));
        atRule.replaceWith(...explicit, system);
      },
    },
  };
}
cssModes.postcss = true;
