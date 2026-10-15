import { chromium } from 'playwright';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const LIVE_BASE = 'https://lims.bot';
const LOCAL_BASE = 'http://localhost:3000';
const OUT_DIR = path.resolve('demos/out');
const DELIVERY_DIR = '/tmp/product-demos/lims-box';
const mode = process.argv[2] ?? 'all';

const pause = (ms = 2500) => new Promise((resolve) => setTimeout(resolve, ms));

async function slowScroll(page, { steps = 5, pixels = 650 } = {}) {
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, pixels);
    await pause(700);
  }
  await pause(1800);
}

async function visit(page, url, options = {}) {
  console.log(url);
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response?.ok()) throw new Error(`Navigation failed (${response?.status() ?? 'no response'}): ${url}`);
  await pause(options.wait ?? 2500);
  if (options.scroll) await slowScroll(page, options.scroll === true ? {} : options.scroll);
}

async function typeLabel(page, label, value) {
  const field = page.getByLabel(label, { exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill('');
  await field.pressSequentially(value, { delay: 75 });
  await pause(500);
}

async function fillProspectForm(page, track) {
  const environmental = track === 'environmental';
  await typeLabel(page, 'Your name', environmental ? 'Jordan Rivera' : 'Alex Morgan');
  await typeLabel(page, 'Email', environmental ? 'jordan.rivera@example.test' : 'alex.morgan@example.test');
  await typeLabel(page, 'Lab name', environmental ? 'Cedar Valley Water Lab (Synthetic)' : 'Northline Clinical Lab (Synthetic)');
  await page.getByRole('button', { name: environmental ? '11–50' : '51–200' }).click();
  await pause(700);
  for (const accreditation of environmental ? ['NELAP', 'ISO 17025', 'EPA'] : ['CLIA', 'CAP', 'COLA']) {
    await page.getByText(accreditation, { exact: true }).click();
    await pause(450);
  }
  if (environmental) {
    await page.getByLabel('Field vs bench split').fill('65');
    await pause(700);
  }
  await typeLabel(
    page,
    'Biggest documentation pain right now (optional)',
    environmental
      ? 'Synthetic scenario: connect field chain-of-custody records to nitrate and coliform reporting.'
      : 'Synthetic scenario: organize specimen receipt, QC review, result sign-off, and CLIA evidence.',
  );
  await typeLabel(page, 'How did you hear about LIMS BOX? (optional)', 'Synthetic product walkthrough');
  await pause(2500);
  // Deliberately do not submit: this live form creates a prospect record and the recording brief forbids that write.
}

async function askAssistant(page, question) {
  const input = page.getByLabel('Ask about a synthetic sample or test');
  const log = page.getByRole('log');
  const previousAnswers = await log.getByText('Demo assistant answered:', { exact: false }).count();
  await input.click();
  await input.pressSequentially(question, { delay: 75 });
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.waitForFunction(
    ({ selector, count }) => document.querySelector(selector)?.querySelectorAll('p').length > count * 2,
    { selector: '[role="log"]', count: previousAnswers },
    { timeout: 20_000 },
  ).catch(() => {});
  await pause(3000);
}

async function record(name, options, workflow) {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1080 } },
    ...options,
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await workflow(page);
  } finally {
    await context.close();
    await browser.close();
  }

  const generatedPath = await video.path();
  const finalPath = path.join(OUT_DIR, name);
  await rm(finalPath, { force: true });
  await rename(generatedPath, finalPath);
  await mkdir(DELIVERY_DIR, { recursive: true });
  await copyFile(finalPath, path.join(DELIVERY_DIR, name));
  console.log(`Saved ${finalPath}`);
}

async function recordLive() {
  await record('lims-box-live.webm', {}, async (page) => {
    await visit(page, `${LIVE_BASE}/environmental`, { scroll: true });
    await visit(page, `${LIVE_BASE}/environmental/intake`);
    await fillProspectForm(page, 'environmental');

    // The checked-in intake is a lead form, not an accession form. The synthetic walkthrough supplies
    // the environmental sample, collection, analysis, audit, QC, and report screens without live writes.
    await visit(page, `${LIVE_BASE}/demo/walkthrough`, { wait: 3000 });
    for (const step of ['Sample Intake', 'Audit Trail', 'QC Dashboard', 'Reporting']) {
      await page.getByRole('button', { name: new RegExp(step) }).click();
      await pause(4500);
    }

    await visit(page, `${LIVE_BASE}/clinical`, { scroll: { steps: 6, pixels: 620 } });
    await visit(page, `${LIVE_BASE}/clinical/intake`);
    await fillProspectForm(page, 'clinical');

    // The clinical synthetic workflow contains the real read-only accession, result, QC, and report views.
    for (const route of [
      '/demo/labs/clinical',
      '/demo/labs/clinical/accessions',
      '/demo/labs/clinical/samples',
      '/demo/labs/clinical/result-review',
      '/demo/labs/clinical/qc',
      '/demo/labs/clinical/reports',
    ]) {
      await visit(page, `${LIVE_BASE}${route}`, { scroll: { steps: 4, pixels: 650 } });
    }

    await visit(page, `${LIVE_BASE}/clia-tracker`, { scroll: { steps: 5, pixels: 650 } });
    await visit(page, `${LIVE_BASE}/demo/walkthrough`, { scroll: { steps: 3, pixels: 600 } });
    await visit(page, `${LIVE_BASE}/demo/assistant`);
    for (const question of [
      'What is the status of SYN-26041-0001?',
      'What results are available for SYN-26041-0001?',
      'What is the TAT for SYN-26041-0001?',
    ]) await askAssistant(page, question);

    for (const route of ['/personnel-pack', '/survey-ready-export', '/compliance', '/pricing']) {
      await visit(page, `${LIVE_BASE}${route}`, { scroll: { steps: 6, pixels: 650 } });
    }
  });
}

async function recordLocal() {
  await record(
    'lims-box-senaite-demo-local.webm',
    { httpCredentials: { username: 'demo', password: 'demo' } },
    async (page) => {
      for (const route of [
        '/senaite-demo',
        '/senaite-demo/samples/SA-2026-0847',
        '/senaite-demo/qc',
        '/senaite-demo/equipment',
        '/senaite-demo/training',
      ]) await visit(page, `${LOCAL_BASE}${route}`, { scroll: { steps: 5, pixels: 650 } });
    },
  );
}

if (!['all', 'live', 'local'].includes(mode)) {
  throw new Error('Usage: node demos/record.mjs [all|live|local]');
}
if (mode === 'all' || mode === 'live') await recordLive();
if (mode === 'all' || mode === 'local') await recordLocal();
