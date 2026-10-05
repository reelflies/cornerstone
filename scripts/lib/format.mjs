// Number formats shared by the release and check scripts, so the zip, main.js and chunk sizes
// read the same in the terminal, the push summary and RELEASES.md.
//
//   import { formatBytes } from './lib/format.mjs';

// A byte count in full, in en-CA digit grouping: 307,607 B.
export const formatBytes = count => `${count.toLocaleString('en-CA')} B`;
