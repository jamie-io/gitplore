// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Layer boundaries (IMPLEMENTATION_PLAN.md §1).
 *
 * Aliased imports (`@world/…`) and relative ones (`../../world/…`) both have to be caught, so every
 * layer contributes two patterns: the alias and a path glob matching the folder anywhere in the
 * specifier.
 */
const layerPatterns = (layer) => [
  `@${layer}/*`,
  `@${layer}/**`,
  `**/${layer}/*`,
  `**/${layer}/**`,
  `${layer}/*`,
  `${layer}/**`,
];

const forbid = (message, layers, extra = []) => ({
  '@typescript-eslint/no-restricted-imports': [
    'error',
    { patterns: [{ group: [...layers.flatMap(layerPatterns), ...extra], message }] },
  ],
});

const THREE = ['three', 'three/*', 'three/**'];

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },

  // engine: Three.js only. Knows nothing about projects or Angular UI.
  {
    files: ['src/app/engine/**/*.ts'],
    rules: forbid('engine must not import from world, content or ui — it is the bottom layer.', [
      'world',
      'content',
      'ui',
    ]),
  },

  // world: scene content built on engine; may use engine and content models, never ui.
  {
    files: ['src/app/world/**/*.ts'],
    rules: forbid('world must not import from ui — scene code stays free of Angular components.', [
      'ui',
    ]),
  },

  // content: data model and adapters, no Three.
  {
    files: ['src/app/content/**/*.ts'],
    rules: forbid(
      'content is data only — no Three.js, no engine, no world, no ui.',
      ['engine', 'world', 'ui'],
      THREE,
    ),
  },

  // ui: components and signal stores; may use content, never Three directly.
  {
    files: ['src/app/ui/**/*.ts'],
    rules: forbid(
      'ui must not import Three.js or world scene code — go through engine services.',
      ['world'],
      THREE,
    ),
  },

  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
