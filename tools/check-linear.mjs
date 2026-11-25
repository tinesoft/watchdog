// Fails when the given git range (a..b) contains a merge commit: history on develop and main is linear.
import { execFileSync } from 'node:child_process'

const range = process.argv[2]
if (!range) {
  console.error('usage: node tools/check-linear.mjs <base>..<head>')
  process.exit(2)
}
const merges = execFileSync('git', ['rev-list', '--merges', range], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
if (merges.length) {
  console.error(`Merge commits are not allowed (history is linear):\n${merges.join('\n')}`)
  process.exit(1)
}
