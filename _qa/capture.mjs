import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import { mkdir } from 'node:fs/promises'

const out = new URL('./ui/', import.meta.url)
await mkdir(out, { recursive: true })
console.log('launch')
const browser = await chromium.launch({ headless: true })
console.log('launched')
const results = []

for (const viewport of [{ width: 390, height: 844, name: '390x844' }, { width: 320, height: 568, name: '320x568' }]) {
  console.log('viewport', viewport.name)
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('game_locale', 'zh'))
  console.log('goto', viewport.name)
  await page.goto('http://127.0.0.1:5182/', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(700)
  console.log('capture-entry', viewport.name)
  await page.screenshot({ path: new URL(`recheck-entry-${viewport.name}.png`, out).pathname })
  await page.getByRole('button', { name: /示例|demo/i }).click()
  console.log('clicked', viewport.name)
  await page.waitForTimeout(2200)
  await page.screenshot({ path: new URL(`recheck-studio-${viewport.name}.png`, out).pathname })
  const metrics = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: innerWidth,
    stage: document.querySelector('.bb__stage')?.getBoundingClientRect().toJSON(),
    instrument: document.querySelector('.bb__instrument')?.getBoundingClientRect().toJSON(),
    controls: [...document.querySelectorAll('button,input')].map(node => {
      const rect = node.getBoundingClientRect(); return { label: node.getAttribute('aria-label') || node.textContent?.trim(), width: rect.width, height: rect.height }
    }),
  }))
  results.push({ viewport: viewport.name, errors, metrics })
  await page.close()
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
