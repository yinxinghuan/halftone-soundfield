import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(error.message))
await page.goto('http://127.0.0.1:5182/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => import('/@fs/Users/yin/code/games/halftone-soundfield/_qa/optimistic-wall-harness.tsx'))
await page.locator('#optimistic-wall-qa .sw__card').waitFor()
const result = await page.evaluate(() => ({
  cards: document.querySelectorAll('#optimistic-wall-qa .sw__card').length,
  loadingVisible: [...document.querySelectorAll('#optimistic-wall-qa .sw__empty')].some(node => node.textContent?.includes('正在打开')),
  firstAuthor: document.querySelector('#optimistic-wall-qa .sw__card .sw__author')?.textContent,
}))
console.log(JSON.stringify({ ...result, errors }, null, 2))
if (result.cards !== 1 || result.loadingVisible || errors.length) process.exitCode = 1
await browser.close()
