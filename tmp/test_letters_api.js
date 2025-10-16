(async () => {
  try {
    const mod = await import('../app/api/letters/route.ts');
    const req = new Request('http://localhost/api/letters');
    const res = await mod.GET(req);
    const txt = await res.text();
    console.log('API response status:', res.status);
    console.log(txt.slice(0, 500));
  } catch (e) {
    console.error('Error invoking letters API module:', e);
  }
})();
