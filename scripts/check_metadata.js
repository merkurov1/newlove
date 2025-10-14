const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, files);
    } else {
      if (full.endsWith('.js') || full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.jsx')) files.push(full);
    }
  }
  return files;
}

const root = path.resolve(__dirname, '..');
const files = walk(path.join(root, 'app'));
let problems = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // detect export const metadata = ... and generateMetadata function
  if (/export\s+const\s+metadata\s*=/.test(src) || /export\s+async\s+function\s+generateMetadata\s*\(/.test(src)) {
    if (!/sanitizeMetadata\s*\(/.test(src)) {
      console.warn('WARN: possible unwrapped metadata in', path.relative(root, f));
      problems++;
    }
  }
}

if (problems === 0) {
  console.log('check_metadata: OK (no obvious unwrapped metadata exports found)');
  process.exit(0);
} else {
  console.error('check_metadata: found', problems, 'potential issues');
  process.exit(2);
}
