// The Claude preview host rejects literal U+FFFD characters; escape them (all are inside JS strings).
import fs from 'node:fs';
const p = 'dist-preview/index.html';
const s = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, s.replaceAll('�', '\\uFFFD'));
