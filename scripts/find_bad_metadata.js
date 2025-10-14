#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    // ignore directories we can't read (e.g., weird names or permissions)
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    try {
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$|\.js$/.test(e.name)) inspectFile(p);
    } catch (err) {
      // ignore individual file read errors
    }
  }
}

function inspectFile(file) {
  if (!file.includes('/app/')) return;
  const src = fs.readFileSync(file, 'utf8');
  const results = [];

  // find export const metadata = {...}
  const metaRegex = /export\s+const\s+metadata\s*=\s*sanitizeMetadata\s*\(([^]*?)\)\s*;/g;
  let m;
  while ((m = metaRegex.exec(src))) {
    const block = m[1];
    if (isSuspicious(block)) results.push({ type: 'metadata', snippet: summarize(block) });
  }

  // find generateMetadata functions
  const genRegex = /export\s+async\s+function\s+generateMetadata\s*\([^)]*\)\s*\{([^]*?)\n\}/g;
  while ((m = genRegex.exec(src))) {
    const body = m[1];
    if (isSuspicious(body)) results.push({ type: 'generateMetadata', snippet: summarize(body) });
  }

  if (results.length > 0) {
    console.log('\n[WARN] Suspicious metadata in', file);
    for (const r of results) {
      console.log(' -', r.type, ':', r.snippet);
    }
  }
}

function isSuspicious(text) {
  // heuristics for JSX or component/function presence
  if (!text) return false;
  const indicators = ['<', 'React.', '() =>', 'function(', '$$typeof', 'createElement', 'return <', 'dangerouslySetInnerHTML'];
  return indicators.some(i => text.includes(i));
}

function summarize(s) {
  const one = s.replace(/\s+/g, ' ').trim().slice(0, 200);
  return one.length >= 200 ? one + '...' : one;
}

const root = path.resolve(__dirname, '..');
walk(root);
console.log('\nScan complete.');
