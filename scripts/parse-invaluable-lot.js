#!/usr/bin/env node
/*
  Simple site-specific parser for Invaluable lot pages.
  Usage: node scripts/parse-invaluable-lot.js <url>
  Outputs a small JSON summary to stdout.
*/
import fetch from 'node-fetch'
import { JSDOM } from 'jsdom'

function textOrNull(el) {
  return el ? el.textContent.trim().replace(/\s+/g, ' ') : null
}

async function parse(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`)
  const html = await res.text()
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const title = textOrNull(doc.querySelector('meta[property="og:title"]')) || textOrNull(doc.querySelector('title'))
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null
  const artist = textOrNull(doc.querySelector('.lot-artist')) || textOrNull(doc.querySelector('.artist'))
  const lotNumber = textOrNull(doc.querySelector('.lot-number')) || textOrNull(doc.querySelector('[data-lot-number]'))
  const estimate = textOrNull(doc.querySelector('.lot-estimate')) || textOrNull(doc.querySelector('.estimate'))
  const medium = textOrNull(doc.querySelector('.lot-medium')) || textOrNull(doc.querySelector('.medium'))
  const dimensions = textOrNull(doc.querySelector('.lot-dimensions')) || textOrNull(doc.querySelector('.dimensions'))
  const provenance = textOrNull(doc.querySelector('.lot-provenance')) || null

  return { url, title, artist, lotNumber, estimate, medium, dimensions, provenance, image: ogImage }
}

(async function(){
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/parse-invaluable-lot.js <url>')
    process.exit(2)
  }
  try {
    const data = await parse(url)
    console.log(JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
})()
