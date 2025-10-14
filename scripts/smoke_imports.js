// scripts/smoke_imports.js
(async function(){
  const pages = [
    '../app/%5Bslug%5D/page.js',
    '../app/tags/%5Bslug%5D/page.js',
    '../app/you/%5Busername%5D/page.js',
    '../app/digest/%5Bslug%5D/page.js'
  ];

  for (const p of pages) {
    try {
      const mod = await import(p);
      if (mod && typeof mod.generateMetadata === 'function') {
        console.log(p, 'has generateMetadata function');
      } else {
        console.log(p, 'no generateMetadata found');
      }
    } catch (e) {
      console.error('import failed for', p, e && e.message ? e.message : e);
    }
  }
})();
