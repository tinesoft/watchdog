const q = files => files.map(f => JSON.stringify(f)).join(' ')

export default {
  '*.{ts,mjs,cjs,json,md,css,astro,yml}': files => [`prettier --write ${q(files)}`],
  '*.{ts,mjs,cjs,astro}': files => [`eslint --fix ${q(files)}`],
}
