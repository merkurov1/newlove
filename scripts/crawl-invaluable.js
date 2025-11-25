#!/usr/bin/env node
/*
  Crawl listing pages (Invaluable) and extract auction-lot links.
  Writes artifacts/discovered_<timestamp>.json and optionally inserts into Supabase
  Env:
    INVALUABLE_LISTINGS - comma-separated listing URLs (optional)
    SUPABASE_URL - optional (for REST insert)
    SUPABASE_SERVICE_ROLE_KEY - optional (for REST insert)
*/
import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_LISTINGS = [
  // Add default listing pages here if you want. Empty by default.
]

function normalizeUrl(u) {
  try {
    return new URL(u).href.split('?')[0]
  } catch (e) {
    return null
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed fetch ${url}: ${res.status}`)
  return await res.text()
}

async function crawl() {
  const raw = (process.env.INVALUABLE_LISTINGS || '').trim()
  const listings = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_LISTINGS
  if (listings.length === 0) {
    console.log('No listing pages configured. Set INVALUABLE_LISTINGS env or add defaults.')
    process.exit(0)
  }

  const found = new Set()
  for (const u of listings) {
    try {
      console.log('Fetching', u)
      const html = await fetchText(u)
      // quick regexp for auction-lot links
      const re = /href=["']([^"']*\/auction-lot[^"']*)["']/gi
      let m
      while ((m = re.exec(html))) {
        const resolved = new URL(m[1], u).href.split('?')[0]
        found.add(resolved)
      }
      // also search anchor tags
      const aRe = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
      while ((m = aRe.exec(html))) {
        const h = m[1]
        if (h.includes('/auction-lot/')) {
          const resolved = new URL(h, u).href.split('?')[0]
          found.add(resolved)
        }
      }
    } catch (e) {
      console.warn('Listing fetch failed', u, e.message)
    }
  }

  const arr = Array.from(found)
  const ts = Date.now()
  const outDir = path.join(process.cwd(), 'artifacts')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `discovered_${ts}.json`)
  await fs.writeFile(outPath, JSON.stringify({ discovered_at: new Date().toISOString(), listings, urls: arr }, null, 2))
  console.log('Wrote', outPath, 'count=', arr.length)

  // optional Supabase insertion via REST API
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (SUPABASE_URL && SUPABASE_KEY && arr.length) {
    try {
      console.log('Inserting discovered links into Supabase...')
      const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/discovered_links`
      const body = arr.map(u => ({ url: u, source: 'invaluable-crawl', discovered_at: new Date().toISOString() }))
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body)
      })
      if (!r.ok) {
        const text = await r.text()
        console.warn('Supabase insert failed', r.status, text)
      } else {
        console.log('Inserted to Supabase, status', r.status)
      }
    } catch (e) {
      console.warn('Supabase insert error', e.message)
    }
  }
}

crawl().catch(e => { console.error(e); process.exit(1) })
