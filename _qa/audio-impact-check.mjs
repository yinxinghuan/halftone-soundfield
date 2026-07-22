import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(error.message))
await page.goto('http://127.0.0.1:5182/', { waitUntil: 'domcontentloaded' })

const audio = await page.evaluate(async () => {
  const { AudioEngine } = await import('/src/AudioEngine.ts')
  const engine = new AudioEngine()
  await engine.unlock()
  engine.setDemoBuffer()
  const accepted = engine.hit(3, 0.72, { bounce: 66, pitch: 58, space: 46 })
  let maxLevel = 0
  for (let frame = 0; frame < 24; frame += 1) {
    await new Promise(resolve => setTimeout(resolve, 16))
    maxLevel = Math.max(maxLevel, engine.sample().level)
  }
  await engine.close()
  return { accepted, maxLevel }
})

await page.getByRole('button', { name: /示例|demo/i }).click()
await page.waitForTimeout(800)
await page.evaluate(() => {
  const map = document.querySelector('.bb__voiceMap>div')
  window.__impactResult = map ? null : { observed: false, activeIndex: -1 }
  if (!map) return
  const observer = new MutationObserver(() => {
    const dots = [...map.querySelectorAll('i')]
    const activeIndex = dots.findIndex(dot => dot.classList.contains('is-hit'))
    if (activeIndex >= 0) { observer.disconnect(); window.__impactResult = { observed: true, activeIndex } }
  })
  observer.observe(map, { subtree: true, childList: true, attributes: true })
  setTimeout(() => { observer.disconnect(); window.__impactResult ??= { observed: false, activeIndex: -1 } }, 2600)
})
await page.locator('.bb__stage canvas').click({ position: { x: 195, y: 250 } })
await page.waitForFunction(() => window.__impactResult !== null, undefined, { timeout: 3200 })
const visual = await page.evaluate(() => window.__impactResult)

console.log(JSON.stringify({ audio, visual, errors }, null, 2))
await browser.close()
