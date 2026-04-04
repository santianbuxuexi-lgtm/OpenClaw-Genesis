import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import {
  appendGenesisProactiveWorkEntrySync,
  appendGenesisRunCompletionOutcomeSync,
  readGenesisProactiveWorkSummarySync,
  refreshGenesisProactiveWorkSummarySnapshotSync,
} from "./proactive-work.js";
import { wasGenesisTrafficPublishedRecentlySync } from "./daily-traffic-log.js";
import {
  acquireGenesisPlatformAccountSync,
  readGenesisPlatformAccountRecordSync,
  releaseGenesisPlatformAccountSync,
} from "./login-state-pool.js";
import {
  resolveGenesisStateDir,
  type GenesisPlatformAccountRecord,
  type GenesisProactiveWorkEntry,
} from "./state.js";

type BrowserLaunchOptions = {
  channel?: "chrome" | "msedge";
  executablePath?: string;
};

type ExternalExecutionEvidence = {
  summary: string;
  capability?: string;
  status?: "executed" | "failed" | "pending";
  evidenceType?: "url" | "post_id" | "thread_id" | "task_id" | "screenshot" | "file" | "text";
  evidenceValue?: string;
  externalId?: string;
  contentPreview?: string;
  url?: string;
  title?: string;
  snippet?: string;
  screenshotPath?: string;
};

type ExternalExecutionRunner = (params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}) => Promise<ExternalExecutionEvidence>;

type VisibleContentEvidence = {
  url: string;
  title?: string;
  snippet?: string;
  screenshotPath?: string;
};

function resolveCapabilityForExternalWorkType(
  workType: GenesisProactiveWorkEntry["workType"],
): "publish" | "browse" | "comment" | null {
  if (workType === "external_publish") {
    return "publish";
  }
  if (workType === "external_signal" || workType === "external_automation") {
    return "browse";
  }
  if (workType === "external_audit" || workType === "external_coordination") {
    return "comment";
  }
  return null;
}

function shouldPreferReplacementAccount(
  entry: GenesisProactiveWorkEntry,
  account: GenesisPlatformAccountRecord,
): boolean {
  return entry.workType === "external_publish" && account.source === "browser_scan";
}

function maybeRebindExternalExecutionAccountSync(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): { entry: GenesisProactiveWorkEntry; account: GenesisPlatformAccountRecord } {
  if (!shouldPreferReplacementAccount(params.entry, params.account)) {
    return { entry: params.entry, account: params.account };
  }
  const capability = resolveCapabilityForExternalWorkType(params.entry.workType);
  if (!capability) {
    return { entry: params.entry, account: params.account };
  }
  const replacement = acquireGenesisPlatformAccountSync({
    capability,
    platform: params.account.platform,
    requestedBy: `${params.entry.founderOrigin ?? params.entry.agentId}:rebind`,
    currentTask: params.entry.task,
    env: params.env,
  });
  if (!replacement || replacement.recordId === params.account.recordId) {
    return { entry: params.entry, account: params.account };
  }
  const reboundAt = Date.now();
  const reboundEntry: GenesisProactiveWorkEntry = {
    ...params.entry,
    accountRecordId: replacement.recordId,
    accountLabel: replacement.accountLabel,
    ts: reboundAt,
    updatedAt: reboundAt,
  };
  appendGenesisProactiveWorkEntrySync(reboundEntry, params.env);
  return { entry: reboundEntry, account: replacement };
}

function resolveExternalExecutionPriority(entry: GenesisProactiveWorkEntry): number {
  let score = 0;
  if (entry.founderOrigin === "creator" && entry.workType === "external_publish") {
    score += 10;
  } else if (entry.workType === "external_publish") {
    score += 8;
  } else if (entry.workType === "external_signal") {
    score += 5;
  } else {
    score += 2;
  }
  if (entry.driverKind === "history") {
    score += 4;
  }
  if (entry.driverHistoryKind === "search") {
    score += 2;
  }
  if (entry.driverKeywords?.length) {
    score += Math.min(entry.driverKeywords.length, 4);
  }
  if ((entry.task ?? "").includes("~88-char")) {
    score += 3;
  }
  if ((entry.task ?? "").match(/https?:\/\//i)) {
    score += 2;
  }
  return score;
}

const TOUTIAO_FIRST_PUBLISH_LABEL = "头条首发";
const TOUTIAO_DECLARATION_LABELS = [
  "个人观点，仅供参考",
  "取材网络",
  "引用站内",
  "引用AI",
  "虚构演绎，故事经改",
  "投资观点，仅供参考",
  "健康医疗分享，仅供参考",
] as const;

const PLATFORM_HOME_URLS: Record<string, string> = {
  weibo: "https://weibo.com/",
  douyin: "https://www.douyin.com/",
  tiktok: "https://www.tiktok.com/",
  toutiao: "https://www.toutiao.com/",
  x: "https://x.com/home",
  github: "https://github.com/",
  telegram: "https://web.telegram.org/a/",
  bugcrowd: "https://bugcrowd.com/",
  hackerone: "https://hackerone.com/",
};

function resolveHeadless(env: NodeJS.ProcessEnv): boolean {
  const raw = env.OPENCLAW_GENESIS_EXTERNAL_EXEC_HEADLESS?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

function resolveBrowserLaunchOptions(): BrowserLaunchOptions {
  const systemPaths: Record<"chrome" | "msedge", string[]> = {
    chrome: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    msedge: [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
  };
  for (const channel of ["chrome", "msedge"] as const) {
    for (const executablePath of systemPaths[channel]) {
      if (fs.existsSync(executablePath)) {
        return { executablePath };
      }
    }
  }
  return { channel: "chrome" };
}

async function withAccountContext<T>(
  account: GenesisPlatformAccountRecord,
  env: NodeJS.ProcessEnv,
  fn: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  const launchOptions = resolveBrowserLaunchOptions();
  const headless = resolveHeadless(env);
  if (account.authMode === "profile_dir" && account.profileDirPath) {
    const context = await chromium.launchPersistentContext(account.profileDirPath, {
      headless,
      channel: launchOptions.channel,
      executablePath: launchOptions.executablePath,
      ...(account.profileDirectoryName ? { args: [`--profile-directory=${account.profileDirectoryName}`] } : {}),
    });
    try {
      return await fn(context);
    } finally {
      await context.close();
    }
  }

  const browser = await chromium.launch({
    headless,
    channel: launchOptions.channel,
    executablePath: launchOptions.executablePath,
  });
  const context = await browser.newContext({
    ...(account.storageStatePath ? { storageState: account.storageStatePath } : {}),
  });
  try {
    return await fn(context);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function ensurePage(context: BrowserContext, url: string): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

function resolvePlatformHomeUrl(account: GenesisPlatformAccountRecord): string {
  return PLATFORM_HOME_URLS[account.platform] ?? account.loginUrl;
}

function isAuthRedirect(params: { platform: string; url: string }): boolean {
  const url = params.url.toLowerCase();
  switch (params.platform) {
    case "weibo":
      return /login|newlogin/.test(url);
    case "toutiao":
      return /login|passport|auth|mp\.toutiao\.com\/auth/.test(url);
    case "douyin":
    case "tiktok":
      return /login|passport|sign[_-]?in|signup/.test(url);
    case "github":
      return /github\.com\/login/.test(url);
    case "x":
      return /x\.com\/i\/flow\/login|twitter\.com\/i\/flow\/login/.test(url);
    case "telegram":
      return /login|web\.telegram\.org\/k\/|web\.telegram\.org\/z\//.test(url);
    case "bugcrowd":
    case "hackerone":
      return /sign[_-]?in|login/.test(url);
    default:
      return /login|signin|sign-in|sign_in/.test(url);
  }
}

function resolveEvidenceDir(env: NodeJS.ProcessEnv): string {
  const dir = path.join(resolveGenesisStateDir(env), "external-evidence");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function captureEvidenceScreenshot(params: {
  page: Page;
  entry: GenesisProactiveWorkEntry;
  env: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  try {
    const filePath = path.join(
      resolveEvidenceDir(params.env),
      `${encodeURIComponent(params.entry.workId)}-${Date.now()}.png`,
    );
    await params.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return undefined;
  }
}

async function captureBodySnippet(page: Page): Promise<string | undefined> {
  try {
    const text = (await page.locator("body").innerText({ timeout: 5000 })).replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 240) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeVisibleText(text: string | undefined): string {
  return (text ?? "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function contentLooksVisible(snippet: string | undefined, content: string): boolean {
  const normalizedSnippet = normalizeVisibleText(snippet);
  const normalizedContent = normalizeVisibleText(content);
  if (!normalizedSnippet || !normalizedContent) {
    return false;
  }
  const contentPrefix = normalizedContent.slice(0, Math.min(32, normalizedContent.length));
  if (contentPrefix.length >= 8 && normalizedSnippet.includes(contentPrefix)) {
    return true;
  }
  const keywords = normalizedContent
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 6);
  return keywords.length > 0 && keywords.every((token) => normalizedSnippet.includes(token));
}

async function verifyFrontVisibleContent(params: {
  context: BrowserContext;
  platform: string;
  url: string;
  content: string;
  entry: GenesisProactiveWorkEntry;
  env: NodeJS.ProcessEnv;
  attempts?: number;
  waitMs?: number;
}): Promise<VisibleContentEvidence | null> {
  const attempts = Math.max(1, params.attempts ?? 3);
  const waitMs = Math.max(500, params.waitMs ?? 2500);
  const page = await params.context.newPage();
  try {
    for (let index = 0; index < attempts; index += 1) {
      await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(waitMs);
      const currentUrl = page.url();
      if (isAuthRedirect({ platform: params.platform, url: currentUrl })) {
        return null;
      }
      const title = await page.title().catch(() => params.platform);
      const snippet = await captureBodySnippet(page);
      if (contentLooksVisible(snippet, params.content)) {
        const screenshotPath = await captureEvidenceScreenshot({
          page,
          entry: params.entry,
          env: params.env,
        });
        return {
          url: currentUrl,
          title,
          snippet,
          screenshotPath,
        };
      }
      if (index < attempts - 1) {
        await page.waitForTimeout(waitMs);
      }
    }
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function captureHotspotImageAsset(params: {
  context: BrowserContext;
  entry: GenesisProactiveWorkEntry;
  env: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const hotspotUrl = params.entry.hotspotUrl?.trim();
  if (!hotspotUrl) {
    return null;
  }
  const page = await params.context.newPage();
  try {
    await page.goto(hotspotUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2500);
    const filePath = path.join(
      resolveEvidenceDir(params.env),
      `${encodeURIComponent(params.entry.workId)}-hotspot-${Date.now()}.png`,
    );
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function ensureSocialImageUpload(params: {
  page: Page;
  context: BrowserContext;
  entry: GenesisProactiveWorkEntry;
  env: NodeJS.ProcessEnv;
  platform: "weibo" | "toutiao";
}): Promise<string> {
  const imagePath = await captureHotspotImageAsset({
    context: params.context,
    entry: params.entry,
    env: params.env,
  });
  if (!imagePath) {
    throw new Error(`${params.platform} publish requires hotspot image evidence`);
  }
  await tryClickActionByText(params.page, /图片|配图|上传|相册|添加图片|插入图片|上传图片/i).catch(() => false);
  const fileInput = params.page.locator("input[type='file']").first();
  if ((await fileInput.count()) === 0) {
    throw new Error(`${params.platform} publish image input unavailable`);
  }
  await fileInput.setInputFiles(imagePath, { timeout: 10000 });
  await params.page.waitForTimeout(2500);
  const uploaded = await params.page.evaluate(() => {
    const input = document.querySelector("input[type='file']") as HTMLInputElement | null;
    const previewCount = document.querySelectorAll("img, .upload-img, .preview-image, .thumbnail").length;
    return Boolean((input?.files?.length ?? 0) > 0 || previewCount > 0);
  });
  if (!uploaded) {
    throw new Error(`${params.platform} publish image upload could not be confirmed`);
  }
  return imagePath;
}

function extractHotspotTitle(entry: GenesisProactiveWorkEntry): string | undefined {
  const task = entry.task.trim();
  const hotspotTaskPrefixMatch = task.match(
    /^Use\s+.+?\s+to\s+publish\s+a\s+concise\s+outward-facing\s+update\s+about\s+(.+)$/i,
  );
  const hotspotObjective = hotspotTaskPrefixMatch?.[1]?.trim();
  const hotspotBody = hotspotObjective?.split(/\s+\|\s+/)[0]?.trim();
  return entry.hotspotTitle?.trim() || hotspotBody?.replace(/\s+https?:\/\/\S+$/i, "").trim() || undefined;
}

function extractPublishPerspective(entry: GenesisProactiveWorkEntry): string | undefined {
  const task = entry.task.trim();
  const match = task.match(/\babout\s+(.+)$/i)?.[1]?.trim();
  if (!match) {
    return undefined;
  }
  const withoutHotspot = match
    .replace(/^https?:\/\/\S+\s*\|\s*/i, "")
    .replace(/^.+?\s+\|\s+shape\s+this\s+hotspot\s+into\s+.+?\s+about\s+/i, "")
    .replace(/^.+?\s+\|\s+support\s+/i, "")
    .trim();
  const normalized = withoutHotspot
    .replace(/\b(?:execution|evidence|concrete|openclaw|workflow|capability|recovery|reusable|before|automation|build|chains?|such|when|history|intent|topic)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  const asciiRatio = (normalized.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(normalized.length, 1);
  if (asciiRatio > 0.45) {
    return undefined;
  }
  return normalized || undefined;
}

function summarizePublishContent(content: string, limit = 140): string {
  return content.replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeCommentaryKeyword(keyword: string): string | null {
  const raw = keyword.trim();
  if (!raw) {
    return null;
  }
  const lowered = raw.toLowerCase();
  const translationMap: Record<string, string> = {
    israel: "以色列",
    iran: "伊朗",
    states: "美国",
    us: "美国",
    america: "美国",
    weibo: "微博",
    toutiao: "头条",
    tiktok: "TikTok",
    ai: "AI",
  };
  if (translationMap[lowered]) {
    return translationMap[lowered];
  }
  if (/^(execution|evidence|concrete|openclaw|workflow|capability|recovery|reusable|before|automation|build|chains?|such|when|history|intent|topic|content|follow-up|production|situation|proactive|profile|publishing|are)$/i.test(raw)) {
    return null;
  }
  if (/^[A-Za-z][A-Za-z0-9_-]{0,20}$/.test(raw)) {
    return null;
  }
  return raw;
}

function resolveCommentaryAngle(entry: GenesisProactiveWorkEntry): string {
  const normalizedKeywords = Array.from(
    new Set((entry.driverKeywords ?? []).map(normalizeCommentaryKeyword).filter(Boolean) as string[]),
  ).slice(0, 4);
  if (normalizedKeywords.length > 0) {
    return normalizedKeywords.join("、");
  }
  const hotspot = extractHotspotTitle(entry) ?? "";
  if (/(以色列|伊朗|美国|局势|冲突|停火|中东)/.test(hotspot)) {
    return "风险、预期与市场情绪";
  }
  if (/(AI|人工智能|模型|转型|智能体|芯片)/i.test(hotspot)) {
    return "估值、叙事与产业节奏";
  }
  if (/(经济|股权|投资|融资|油价|市场|汇率|通胀)/.test(hotspot)) {
    return "价格、信心与资源流向";
  }
  return "注意力、情绪与资源";
}

function buildCommentaryParagraphs(entry: GenesisProactiveWorkEntry): string[] {
  const hotspotTitle = extractHotspotTitle(entry) ?? "这条热点";
  const perspective = extractPublishPerspective(entry);
  const angle = resolveCommentaryAngle(entry);
  const lead =
    entry.platform === "weibo"
      ? "值得写的，不是热闹本身，而是热闹背后悄悄改变的判断。"
      : "真正值得评论的，不是新闻表层，而是事件背后被重新排序的力量。";
  const perspectiveLine = perspective
    ? `把它放回${perspective}这个脉络里看，重点就不该停在转述，而该落到影响、代价和后续走向。`
    : "把它放回用户长期关注的问题脉络里看，重点就不该停在转述，而该落到影响、代价和后续走向。";
  return [
    `${hotspotTitle}，${lead}`,
    `表面看，这是热度上升；往深里看，它牵动的是${angle}的重新分布。越是热点，越不能只复述新闻，而要追问谁会因此改节奏、担代价、重布局。`,
    perspectiveLine,
    "我更愿意把它看成一盏侧灯：照见舆论的起伏，也照见现实的结构。真正有价值的评论，不是抢一句结论，而是在喧哗里保留分寸、留下思考。",
  ];
}
export function buildPublishContent(entry: GenesisProactiveWorkEntry): string {
  const hotspotText = extractHotspotTitle(entry);
  const task = entry.task.trim();
  const commentaryMode =
    Boolean(hotspotText) ||
    /weibo|toutiao|微博|微头条|commentary/i.test(task);
  if (commentaryMode) {
    return buildCommentaryParagraphs(entry)
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  }
  const base =
    hotspotText ||
    entry.resultPreview?.trim() ||
    entry.effectEvidence?.trim() ||
    task ||
    "Genesis founder update";
  return base.slice(0, 220);
}

function buildPublishTitle(entry: GenesisProactiveWorkEntry): string {
  const base =
    entry.resultPreview?.trim() ||
    entry.effectEvidence?.trim() ||
    entry.task.trim() ||
    "Genesis founder update";
  const cleaned = base
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s\-_:,.;!?，。！？]/gu, "")
    .trim();
  const title = cleaned.slice(0, 28);
  return title.length >= 2 ? title : "Genesis 更新";
}

function shouldUseToutiaoMicroPublish(content: string, entry: GenesisProactiveWorkEntry): boolean {
  if ((entry.task ?? "").includes("微头条")) {
    return true;
  }
  if ((entry.task ?? "").includes("micro-headline") || /(<=500-char|~88-char)/i.test(entry.task ?? "")) {
    return true;
  }
  return content.trim().length <= 500;
}

export function resolveToutiaoDeclarationPreferencesForContent(content: string): string[] {
  const labels: string[] = [];
  if (/(ai|gpt|模型|智能体|生成)/i.test(content)) {
    labels.push("引用AI");
  }
  if (/(投资|股市|经济|美联储|黄金|石油|行情|汇率)/i.test(content)) {
    labels.push("投资观点，仅供参考");
  }
  if (/(健康|医疗|疾病|药物|养生|手术|医生)/i.test(content)) {
    labels.push("健康医疗分享，仅供参考");
  }
  if (/(消息|报道|公开资料|来源|媒体|以色列|伊朗|美国|局势|冲突)/i.test(content)) {
    labels.push("取材网络");
  }
  if (/(故事|虚构|设定|演绎|小说)/i.test(content)) {
    labels.push("虚构演绎，故事经改");
  }
  if (!labels.length && /(认为|判断|看法|观点|预计|或许|可能)/i.test(content)) {
    labels.push("个人观点，仅供参考");
  }
  if (!labels.length) {
    labels.push("个人观点，仅供参考");
  }
  for (const label of TOUTIAO_DECLARATION_LABELS) {
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readCheckedCheckboxTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("input[type='checkbox']")).flatMap((node) => {
      const input = node as HTMLInputElement;
      if (!input.checked) {
        return [];
      }
      const label =
        input.closest("label") ||
        input.parentElement ||
        input.parentElement?.parentElement ||
        input.nextElementSibling;
      const text = (label?.textContent || "").replace(/\s+/g, " ").trim();
      return text ? [text] : [];
    }),
  );
}

async function clickCheckboxLabelByText(page: Page, labelText: string): Promise<boolean> {
  const locator = page.locator("label").filter({ hasText: new RegExp(escapeRegex(labelText)) }).first();
  if ((await locator.count()) > 0) {
    try {
      await locator.click({ timeout: 3000, force: true });
      await page.waitForTimeout(400);
      return true;
    } catch {}
  }
  const textLocator = page.getByText(labelText, { exact: false }).first();
  if ((await textLocator.count()) > 0) {
    try {
      await textLocator.click({ timeout: 3000, force: true });
      await page.waitForTimeout(400);
      return true;
    } catch {}
  }
  return page.evaluate((labelText) => {
    const elements = Array.from(document.querySelectorAll("label,div,span,button"));
    const target = elements.find((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes(labelText) && text.length <= 120;
    });
    if (!target) {
      return false;
    }
    const clickable =
      target.closest("label") ||
      target.closest(".byte-checkbox") ||
      target.closest(".item-checkbox") ||
      target.closest("[role='checkbox']") ||
      target;
    if (!clickable) {
      return false;
    }
    (clickable as HTMLElement).click();
    return true;
  }, labelText);
}

async function ensureToutiaoMicroSelections(params: {
  page: Page;
  content: string;
}): Promise<string[]> {
  const selected: string[] = [];
  const initiallyChecked = await readCheckedCheckboxTexts(params.page);
  if (!initiallyChecked.some((text) => text.includes(TOUTIAO_FIRST_PUBLISH_LABEL))) {
    const clickedFirstPublish = await clickCheckboxLabelByText(params.page, TOUTIAO_FIRST_PUBLISH_LABEL);
    if (clickedFirstPublish) {
      selected.push(TOUTIAO_FIRST_PUBLISH_LABEL);
    }
  }
  const declarationPreferences = resolveToutiaoDeclarationPreferencesForContent(params.content);
  const checkedAfterFirst = await readCheckedCheckboxTexts(params.page);
  const haveDeclaration = declarationPreferences.some((label) =>
    checkedAfterFirst.some((checked) => checked.includes(label)),
  );
  if (!haveDeclaration) {
    for (const label of declarationPreferences) {
      const clicked = await clickCheckboxLabelByText(params.page, label);
      if (clicked) {
        selected.push(label);
        break;
      }
    }
  }
  return selected;
}

async function attemptToutiaoMicroPublish(params: {
  page: Page;
  publishButton: ReturnType<Page["locator"]>;
  timeoutMs?: number;
}): Promise<import("playwright-core").Response | null> {
  const publishResponsePromise = params.page
    .waitForResponse(
      (response) =>
        response.url().includes("/mp/agw/article/wtt") &&
        response.request().method().toUpperCase() === "POST",
      { timeout: params.timeoutMs ?? 10000 },
    )
    .catch(() => null);
  await params.publishButton.click({ timeout: 5000, force: true });
  return publishResponsePromise;
}

async function dismissToutiaoBlockingOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const selector of [
      ".byte-drawer-mask",
      ".byte-modal-mask",
      ".tui2-modal-mask",
      ".byte-overlay-mask",
    ]) {
      for (const node of document.querySelectorAll(selector)) {
        const element = node as HTMLElement;
        element.style.pointerEvents = "none";
        element.style.display = "none";
        element.style.visibility = "hidden";
      }
    }
    for (const selector of [
      ".publish-assistant-old-drawer .icon-wrap",
      ".publish-assistant-old .icon-fold",
      ".byte-drawer-wrapper .icon-wrap",
    ]) {
      const button = document.querySelector(selector) as HTMLElement | null;
      button?.click();
    }
  });
  await page.waitForTimeout(300);
}

async function waitForToutiaoSpellCheckApplyStable(
  page: Page,
  timeoutMs = 8000,
): Promise<boolean> {
  const response = await page
    .waitForResponse(
      (candidate) =>
        candidate.url().includes("/mp/agw/creator_helper/spell_check_apply") &&
        candidate.request().method().toUpperCase() === "POST",
      { timeout: timeoutMs },
    )
    .catch(() => null);
  return Boolean(response);
}

async function waitForToutiaoWttPublishStable(
  page: Page,
  timeoutMs = 12000,
): Promise<import("playwright-core").Response | null> {
  return page
    .waitForResponse(
      (response) =>
        response.url().includes("/mp/agw/article/wtt") &&
        response.request().method().toUpperCase() === "POST",
      { timeout: timeoutMs },
    )
    .catch(() => null);
}

async function attemptToutiaoMicroPublishStable(params: {
  page: Page;
  publishButton: ReturnType<Page["locator"]>;
}): Promise<import("playwright-core").Response | null> {
  const firstPublishWatcher = waitForToutiaoWttPublishStable(params.page, 12000);
  const spellCheckWatcher = waitForToutiaoSpellCheckApplyStable(params.page, 8000);
  await params.publishButton.click({ timeout: 5000, force: true });

  let publishResponse = await firstPublishWatcher;
  if (publishResponse) {
    return publishResponse;
  }

  const spellCheckApplied = await spellCheckWatcher;
  if (!spellCheckApplied) {
    return null;
  }

  await dismissToutiaoBlockingOverlays(params.page);
  const secondPublishWatcher = waitForToutiaoWttPublishStable(params.page, 12000);
  const confirmClicked =
    (await tryClickActionByText(params.page, /纭鍙戝竷|缁х画鍙戝竷|鍙戝竷涓瓅鍙戝竷/)) || false;
  if (!confirmClicked) {
    try {
      await params.publishButton.click({ timeout: 5000, force: true });
    } catch {}
  }

  publishResponse = await secondPublishWatcher;
  return publishResponse;
}

async function attemptToutiaoMicroPublishWithFollowup(params: {
  page: Page;
  publishButton: ReturnType<Page["locator"]>;
}): Promise<import("playwright-core").Response | null> {
  let publishResponse = await attemptToutiaoMicroPublish({
    page: params.page,
    publishButton: params.publishButton,
    timeoutMs: 10000,
  });
  if (publishResponse) {
    return publishResponse;
  }

  const spellCheckResponse = await params.page
    .waitForResponse(
      (response) =>
        response.url().includes("/mp/agw/creator_helper/spell_check_apply") &&
        response.request().method().toUpperCase() === "POST",
      { timeout: 6000 },
    )
    .catch(() => null);
  if (!spellCheckResponse) {
    return null;
  }

  await dismissToutiaoBlockingOverlays(params.page);
  const confirmClicked =
    (await tryClickActionByText(params.page, /纭鍙戝竷|缁х画鍙戝竷|鍙戝竷/)) ||
    false;
  if (!confirmClicked) {
    try {
      await params.publishButton.click({ timeout: 5000, force: true });
    } catch {}
  }
  publishResponse = await params.page
    .waitForResponse(
      (response) =>
        response.url().includes("/mp/agw/article/wtt") &&
        response.request().method().toUpperCase() === "POST",
      { timeout: 10000 },
    )
    .catch(() => null);
  return publishResponse;
}

async function tryFillComposer(page: Page, content: string): Promise<"textarea" | "editor" | null> {
  const textareaSelectors = [
    "textarea",
    "textarea[placeholder]",
    "textarea[aria-label]",
    "textarea[placeholder*='\\u65b0\\u9c9c\\u4e8b']",
    "textarea[placeholder*='\\u5206\\u4eab']",
  ];
  for (const selector of textareaSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      try {
        await locator.click({ timeout: 2000 });
        await locator.fill(content, { timeout: 3000 });
        return "textarea";
      } catch {}
    }
  }
  const editorSelectors = ["[contenteditable='true']", "[role='textbox']", "[contenteditable='true'][aria-label]"];
  for (const selector of editorSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      try {
        await locator.click({ timeout: 2000 });
        await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
        await page.keyboard.insertText(content);
        return "editor";
      } catch {}
    }
  }
  return null;
}

async function tryClickPublish(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const keywords = ["发送", "发布", "Post"];
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],a"));
    for (const element of candidates) {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || !keywords.some((keyword) => text.includes(keyword))) {
        continue;
      }
      const htmlElement = element as HTMLElement;
      const disabled =
        htmlElement.getAttribute("aria-disabled") === "true" ||
        (htmlElement as HTMLButtonElement).disabled === true;
      if (disabled) {
        continue;
      }
      htmlElement.click();
      return true;
    }
    return false;
  });
}

async function tryClickActionByText(page: Page, pattern: RegExp): Promise<boolean> {
  const locator = page.locator("button,[role='button'],a").filter({ hasText: pattern }).first();
  if ((await locator.count()) > 0) {
    try {
      await locator.click({ timeout: 5000 });
      return true;
    } catch {}
  }
  return page.evaluate((source) => {
    const regex = new RegExp(source, "i");
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],a"));
    for (const element of candidates) {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || !regex.test(text)) {
        continue;
      }
      const htmlElement = element as HTMLElement;
      const disabled =
        htmlElement.getAttribute("aria-disabled") === "true" ||
        (htmlElement as HTMLButtonElement).disabled === true;
      if (disabled) {
        continue;
      }
      htmlElement.click();
      return true;
    }
    return false;
  }, pattern.source);
}

async function executeGenericBrowse(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): Promise<ExternalExecutionEvidence> {
  return withAccountContext(params.account, params.env, async (context) => {
    const page = await ensurePage(context, resolvePlatformHomeUrl(params.account));
    await page.waitForTimeout(2500);
    const title = await page.title().catch(() => params.account.platform);
    const url = page.url();
    if (isAuthRedirect({ platform: params.account.platform, url })) {
      throw new Error(`auth_required:${url}`);
    }
    const snippet = await captureBodySnippet(page);
    const screenshotPath = await captureEvidenceScreenshot({
      page,
      entry: params.entry,
      env: params.env,
    });
    return {
      summary: `Browsed ${params.account.platform} using skill ${params.account.platform}.browse at ${url}${snippet ? ` snippet=${snippet}` : ""}`,
      capability: "browse",
      status: "executed",
      evidenceType: url ? "url" : screenshotPath ? "screenshot" : "text",
      evidenceValue: url ?? screenshotPath ?? snippet,
      url,
      title,
      snippet,
      screenshotPath,
    };
  });
}

async function executeWeiboBrowse(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): Promise<ExternalExecutionEvidence> {
  return executeGenericBrowse(params);
}

async function executeWeiboPublish(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): Promise<ExternalExecutionEvidence> {
  return withAccountContext(params.account, params.env, async (context) => {
    const page = await ensurePage(context, "https://weibo.com/");
    await page.waitForTimeout(4000);
    if (isAuthRedirect({ platform: "weibo", url: page.url() })) {
      throw new Error(`auth_required:${page.url()}`);
    }
    const content = buildPublishContent(params.entry);
    const filled = await tryFillComposer(page, content);
    if (!filled) {
      throw new Error("unable to locate publish composer");
    }
    const imagePath = await ensureSocialImageUpload({
      page,
      context,
      entry: params.entry,
      env: params.env,
      platform: "weibo",
    });
    await page.waitForTimeout(1200);
    const publishResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/ajax/statuses/update") &&
          response.request().method().toUpperCase() === "POST",
        { timeout: 12000 },
      )
      .catch(() => null);
    const clicked = await tryClickPublish(page);
    if (!clicked) {
      throw new Error("unable to locate publish action");
    }
    const publishResponse = await publishResponsePromise;
    await page.waitForTimeout(5000);
    const url = page.url();
    const title = await page.title().catch(() => "weibo");
    const snippet = await captureBodySnippet(page);
    const screenshotPath = await captureEvidenceScreenshot({
      page,
      entry: params.entry,
      env: params.env,
    });
    const contentPrefix = content.slice(0, Math.min(12, content.length));
    const textareaValue = await page
      .locator("textarea")
      .first()
      .inputValue({ timeout: 2000 })
      .catch(() => "");
    const confirmed =
      (snippet?.includes(contentPrefix) ?? false) ||
      (filled === "textarea" && textareaValue.trim().length === 0);
    let postId: string | undefined;
    let mblogId: string | undefined;
    let postUrl: string | undefined;
    if (publishResponse) {
      try {
        const payload = (await publishResponse.json()) as {
          ok?: number;
          data?: { idstr?: string; mid?: string; mblogid?: string; user?: { idstr?: string } };
        };
        postId = payload.data?.idstr;
        mblogId = payload.data?.mblogid ?? payload.data?.mid;
        const userId = payload.data?.user?.idstr;
        if (userId && mblogId) {
          postUrl = `https://weibo.com/${userId}/${mblogId}`;
        }
        const visibleEvidence =
          payload.ok === 1 && postUrl
            ? await verifyFrontVisibleContent({
                context,
                platform: "weibo",
                url: postUrl,
                content,
                entry: params.entry,
                env: params.env,
                attempts: 3,
                waitMs: 2500,
              })
            : null;
        if (payload.ok === 1 && postUrl && visibleEvidence) {
        return {
          summary: `Published using skill weibo.publish at ${visibleEvidence.url}${mblogId ? ` post_id=${mblogId}` : ""}${visibleEvidence.screenshotPath ? ` screenshot=${visibleEvidence.screenshotPath}` : ""} content=${summarizePublishContent(content)}`,
          capability: "publish",
          status: "executed",
          evidenceType: "post_id",
          evidenceValue: visibleEvidence.url,
          externalId: mblogId ?? postId,
          contentPreview: summarizePublishContent(content, 180),
          url: visibleEvidence.url,
          title: visibleEvidence.title ?? title,
          snippet: visibleEvidence.snippet ?? snippet,
          screenshotPath: visibleEvidence.screenshotPath ?? screenshotPath ?? imagePath,
        };
        }
      } catch {}
    }
    if (!confirmed) {
      throw new Error("publish could not be confirmed from page evidence");
    }
    throw new Error("weibo publish front-visible verification failed");
  });
}

async function executeGenericSocialPublish(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
  url: string;
  platformName: string;
}): Promise<ExternalExecutionEvidence> {
  return withAccountContext(params.account, params.env, async (context) => {
    const page = await ensurePage(context, params.url);
    await page.waitForTimeout(5000);
    if (isAuthRedirect({ platform: params.platformName, url: page.url() })) {
      throw new Error(`auth_required:${page.url()}`);
    }
    const content = buildPublishContent(params.entry);
    const filled = await tryFillComposer(page, content);
    if (!filled) {
      throw new Error(`${params.platformName} publish composer unavailable`);
    }
    await page.waitForTimeout(1200);
    const clicked = await tryClickPublish(page);
    if (!clicked) {
      throw new Error(`${params.platformName} publish action unavailable`);
    }
    await page.waitForTimeout(7000);
    const url = page.url();
    const title = await page.title().catch(() => params.platformName);
    const snippet = await captureBodySnippet(page);
    const screenshotPath = await captureEvidenceScreenshot({
      page,
      entry: params.entry,
      env: params.env,
    });
    const contentPrefix = content.slice(0, Math.min(12, content.length));
    const confirmed =
      (snippet?.includes(contentPrefix) ?? false) ||
      !url.includes("/login");
    if (!confirmed) {
      throw new Error(`${params.platformName} publish could not be confirmed:${url}`);
    }
    return {
      summary: `Published using skill ${params.platformName}.publish at ${url}${screenshotPath ? ` screenshot=${screenshotPath}` : ""}`,
      capability: "publish",
      status: "executed",
      evidenceType: url ? "url" : screenshotPath ? "screenshot" : "text",
      evidenceValue: url ?? screenshotPath ?? snippet,
      contentPreview: summarizePublishContent(content, 180),
      url,
      title,
      snippet,
      screenshotPath,
    };
  });
}

async function executeGithubPublish(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): Promise<ExternalExecutionEvidence> {
  return withAccountContext(params.account, params.env, async (context) => {
    const page = await ensurePage(context, "https://gist.github.com/");
    await page.waitForTimeout(4000);
    if (isAuthRedirect({ platform: "github", url: page.url() })) {
      throw new Error(`auth_required:${page.url()}`);
    }
    const content = buildPublishContent(params.entry);
    const filename = `genesis-${Date.now()}.md`;
    const description = `Genesis external execution ${new Date().toISOString()}`;

    const descriptionInput = page
      .locator("input[name='gist[description]'], input[aria-label*='Gist description']")
      .first();
    if ((await descriptionInput.count()) === 0) {
      throw new Error("unable to locate github gist description");
    }
    await descriptionInput.fill(description, { timeout: 5000 });

    const fileInput = page
      .locator("input[name='gist[contents][][name]'], input[aria-label*='Filename']")
      .first();
    if ((await fileInput.count()) === 0) {
      throw new Error("unable to locate github gist filename");
    }
    await fileInput.fill(filename, { timeout: 5000 });

    const contentInput = page
      .locator("textarea[name='gist[contents][][value]'], .CodeMirror textarea, [data-testid='code-editor'] textarea")
      .first();
    if ((await contentInput.count()) === 0) {
      throw new Error("unable to locate github gist editor");
    }
    await contentInput.click({ timeout: 5000 });
    await contentInput.fill(content, { timeout: 5000 }).catch(async () => {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.insertText(content);
    });

    const createButton = page
      .locator("button,summary,[role='button']")
      .filter({ hasText: /Create secret gist|Create public gist/i })
      .first();
    if ((await createButton.count()) === 0) {
      throw new Error("unable to locate github gist create action");
    }
    await createButton.click({ timeout: 5000 });
    await page.waitForTimeout(5000);

    const url = page.url();
    if (!/gist\.github\.com\/.+\/[a-f0-9]+/i.test(url)) {
      throw new Error(`github gist publish could not be confirmed:${url}`);
    }
    const title = await page.title().catch(() => "github");
    const snippet = await captureBodySnippet(page);
    const screenshotPath = await captureEvidenceScreenshot({
      page,
      entry: params.entry,
      env: params.env,
    });
    return {
      summary: `Published using skill github.publish at ${url}${screenshotPath ? ` screenshot=${screenshotPath}` : ""}`,
      capability: "publish",
      status: "executed",
      evidenceType: "url",
      evidenceValue: url,
      contentPreview: summarizePublishContent(content, 180),
      url,
      title,
      snippet,
      screenshotPath,
    };
  });
}

async function executeToutiaoPublish(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): Promise<ExternalExecutionEvidence> {
  const content = buildPublishContent(params.entry);
  if (shouldUseToutiaoMicroPublish(content, params.entry)) {
    return withAccountContext(params.account, params.env, async (context) => {
      const page = await ensurePage(
        context,
        "https://mp.toutiao.com/profile_v4/weitoutiao/publish?from=toutiao_pc",
      );
      await page.waitForTimeout(6000);
      if (isAuthRedirect({ platform: "toutiao", url: page.url() })) {
        throw new Error(`auth_required:${page.url()}`);
      }
      await dismissToutiaoBlockingOverlays(page);

      const editor = page.locator(".ProseMirror[contenteditable='true'], .ProseMirror").first();
      if ((await editor.count()) === 0) {
        throw new Error("unable to locate toutiao micro editor");
      }
      await editor.fill(content, { timeout: 5000 });
      await page.waitForTimeout(1500);
      const imagePath = await ensureSocialImageUpload({
        page,
        context,
        entry: params.entry,
        env: params.env,
        platform: "toutiao",
      });

      await ensureToutiaoMicroSelections({ page, content });

      const publishButton = page.locator("button.publish-content").first();
      if ((await publishButton.count()) === 0) {
        throw new Error("unable to locate toutiao micro publish action");
      }
      let publishResponse = await attemptToutiaoMicroPublishStable({
        page,
        publishButton,
      });
      if (!publishResponse) {
        for (const fallbackLabel of TOUTIAO_DECLARATION_LABELS) {
          const checkedTexts = await readCheckedCheckboxTexts(page);
          if (checkedTexts.some((text) => text.includes(fallbackLabel))) {
            continue;
          }
          const clicked = await clickCheckboxLabelByText(page, fallbackLabel);
          if (!clicked) {
            continue;
          }
          publishResponse = await attemptToutiaoMicroPublishStable({
            page,
            publishButton,
          });
          if (publishResponse) {
            break;
          }
        }
      }
      await page.waitForTimeout(4000);

      const url = page.url();
      const title = await page.title().catch(() => "toutiao");
      const snippet = await captureBodySnippet(page);
      const screenshotPath = await captureEvidenceScreenshot({
        page,
        entry: params.entry,
        env: params.env,
      });
      let threadId: string | undefined;
      let confirmed = false;
      if (publishResponse) {
        try {
          const payload = (await publishResponse.json()) as {
            code?: number;
            message?: string;
            data?: { thread_id?: number | string };
          };
          threadId = payload.data?.thread_id != null ? String(payload.data.thread_id) : undefined;
          confirmed = payload.code === 0 && Boolean(threadId);
        } catch {}
      }
      const publicUrl = threadId ? `https://www.toutiao.com/w/${threadId}/` : undefined;
      const visibleEvidence =
        confirmed && publicUrl
          ? await verifyFrontVisibleContent({
              context,
              platform: "toutiao",
              url: publicUrl,
              content,
              entry: params.entry,
              env: params.env,
              attempts: 4,
              waitMs: 3000,
            })
          : null;
      if (!confirmed || !threadId || !visibleEvidence) {
        throw new Error(`toutiao micro publish could not be confirmed:${url}`);
      }
      return {
        summary: `Published using skill toutiao.publish at ${visibleEvidence.url} thread_id=${threadId}${visibleEvidence.screenshotPath ? ` screenshot=${visibleEvidence.screenshotPath}` : ""} content=${summarizePublishContent(content)}`,
        capability: "publish",
        status: "executed",
        evidenceType: "thread_id",
        evidenceValue: visibleEvidence.url,
        externalId: threadId,
        contentPreview: summarizePublishContent(content, 180),
        url: visibleEvidence.url,
        title: visibleEvidence.title ?? title,
        snippet: visibleEvidence.snippet ?? snippet,
        screenshotPath: visibleEvidence.screenshotPath ?? screenshotPath ?? imagePath,
      };
    });
  }

  return withAccountContext(params.account, params.env, async (context) => {
    const page = await ensurePage(
      context,
      "https://mp.toutiao.com/profile_v4/graphic/publish?from=toutiao_pc",
    );
      await page.waitForTimeout(5000);
      if (isAuthRedirect({ platform: "toutiao", url: page.url() })) {
        throw new Error(`auth_required:${page.url()}`);
      }
      await dismissToutiaoBlockingOverlays(page);

    const title = buildPublishTitle(params.entry);

    const titleInput = page
      .locator("textarea[placeholder*='鏂囩珷鏍囬'], .publish-editor-title textarea, textarea")
      .first();
    if ((await titleInput.count()) === 0) {
      throw new Error("unable to locate toutiao title input");
    }
    await titleInput.fill(title, { timeout: 5000 });

    const editor = page.locator(".ProseMirror[contenteditable='true'], .ProseMirror").first();
    if ((await editor.count()) === 0) {
      throw new Error("unable to locate toutiao editor");
    }
    await editor.fill(content, { timeout: 5000 });
    await page.waitForTimeout(1200);

    const primaryButton = page.locator("button.publish-btn-last, .publish-btn-last").first();
    let clickedPrimary = false;
    if ((await primaryButton.count()) > 0) {
      try {
        await primaryButton.click({ timeout: 5000, force: true });
        clickedPrimary = true;
      } catch {}
    }
    if (!clickedPrimary) {
      clickedPrimary = await tryClickActionByText(page, /棰勮骞跺彂甯億鍙戝竷浣滃搧|鍙戝竷/);
    }
    if (!clickedPrimary) {
      throw new Error("unable to locate toutiao publish action");
    }
    await page.waitForTimeout(4000);

    const clickedConfirm = await tryClickActionByText(page, /纭鍙戝竷|鍙戝竷|缁х画鍙戝竷/);
    if (clickedConfirm) {
      await page.waitForTimeout(5000);
    }

    const url = page.url();
    const finalTitle = await page.title().catch(() => "toutiao");
    const snippet = await captureBodySnippet(page);
    const screenshotPath = await captureEvidenceScreenshot({
      page,
      entry: params.entry,
      env: params.env,
    });
    const stillOnPublishPage =
      url.includes("/graphic/publish") && !((snippet?.includes("鍙戝竷鎴愬姛") ?? false) || (snippet?.includes("鏂囩珷绠＄悊") ?? false));
    const confirmed =
      (!stillOnPublishPage && !url.includes("/graphic/publish")) ||
      (snippet?.includes("????") ?? false) ||
      (snippet?.includes("????") ?? false);
    if (!confirmed) {
      throw new Error(`toutiao publish could not be confirmed:${url}`);
    }

    return {
      summary: `Published using skill toutiao.publish at ${url}${screenshotPath ? ` screenshot=${screenshotPath}` : ""}`,
      capability: "publish",
      status: "executed",
      evidenceType: url ? "url" : screenshotPath ? "screenshot" : "text",
      evidenceValue: url ?? screenshotPath ?? snippet,
      url,
      title: finalTitle,
      snippet,
      screenshotPath,
    };
  });
}

async function defaultExternalExecutionRunner(params: {
  entry: GenesisProactiveWorkEntry;
  account: GenesisPlatformAccountRecord;
  env: NodeJS.ProcessEnv;
}): Promise<ExternalExecutionEvidence> {
  if (
    params.entry.workType === "external_signal" ||
    params.entry.workType === "external_audit" ||
    params.entry.workType === "external_coordination" ||
    params.entry.workType === "external_automation"
  ) {
    if (params.account.platform === "weibo") {
      return executeWeiboBrowse(params);
    }
    return executeGenericBrowse(params);
  }
  if (params.account.platform === "weibo" && params.entry.workType === "external_publish") {
    return executeWeiboPublish(params);
  }
  if (params.account.platform === "toutiao" && params.entry.workType === "external_publish") {
    return executeToutiaoPublish(params);
  }
  if (params.account.platform === "github" && params.entry.workType === "external_publish") {
    return executeGithubPublish(params);
  }
  if (params.account.platform === "tiktok" && params.entry.workType === "external_publish") {
    return executeGenericSocialPublish({
      ...params,
      url: "https://www.tiktok.com/tiktokstudio",
      platformName: "tiktok",
    });
  }
  throw new Error(`no external executor for ${params.account.platform}:${params.entry.workType}`);
}

export async function runGenesisExternalExecutionCycle(params?: {
  env?: NodeJS.ProcessEnv;
  maxEntries?: number;
  runner?: ExternalExecutionRunner;
}): Promise<{ attempted: number; completed: number; failed: number }> {
  const env = params?.env ?? process.env;
  const runner = params?.runner ?? defaultExternalExecutionRunner;
  const maxEntries = Math.max(1, params?.maxEntries ?? 2);
  const pending = readGenesisProactiveWorkSummarySync(env).recentEntries.filter(
      (entry) =>
        (entry.status === "planned" || entry.status === "in_progress") &&
        entry.accountRecordId &&
        entry.platform &&
        entry.workType.startsWith("external_"),
    )
    .sort((left, right) => {
      const delta = resolveExternalExecutionPriority(right) - resolveExternalExecutionPriority(left);
      if (delta !== 0) {
        return delta;
      }
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
    });
  let attempted = 0;
  let completed = 0;
  let failed = 0;
  for (const entry of pending.slice(0, maxEntries)) {
    const initialAccount = readGenesisPlatformAccountRecordSync({
      recordId: entry.accountRecordId!,
      env,
    });
    if (!initialAccount) {
      continue;
    }
    const rebound = maybeRebindExternalExecutionAccountSync({
      entry,
      account: initialAccount,
      env,
    });
    const activeEntry =
      rebound.entry.status === "planned"
        ? {
            ...rebound.entry,
            status: "in_progress" as const,
            updatedAt: Date.now(),
            ts: Date.now(),
          }
        : rebound.entry;
    if (rebound.entry.status === "planned") {
      appendGenesisProactiveWorkEntrySync(activeEntry, env);
    }
    const account = rebound.account;
    if (
      activeEntry.workType === "external_publish" &&
      activeEntry.platform &&
      activeEntry.trafficFingerprint &&
      wasGenesisTrafficPublishedRecentlySync({
        platform: activeEntry.platform,
        fingerprint: activeEntry.trafficFingerprint,
        env,
      })
    ) {
      appendGenesisRunCompletionOutcomeSync({
        runId: `external-skip:${activeEntry.workId}:${Date.now()}`,
        agentId: activeEntry.agentId,
        sessionKey: activeEntry.sessionKey,
        workId: activeEntry.workId,
        accountRecordId: activeEntry.accountRecordId,
        platform: activeEntry.platform,
        action: activeEntry.action,
        climateKind: activeEntry.climateKind,
        externalOutcome: {
          capability: "publish",
          status: "pending",
          evidenceType: "text",
          evidenceValue: `duplicate_fingerprint:${activeEntry.trafficFingerprint}`,
        },
        ts: Date.now(),
        env,
        result: {
          payloads: [{ text: "Skipped duplicate traffic item because the same hotspot content was already published recently." }],
          summary: "Skipped duplicate traffic item because the same hotspot content was already published recently.",
        },
      });
      continue;
    }
    attempted += 1;
    try {
      const evidence = await runner({ entry: activeEntry, account, env });
      appendGenesisRunCompletionOutcomeSync({
        runId: `external:${activeEntry.workId}:${Date.now()}`,
        agentId: activeEntry.agentId,
        sessionKey: activeEntry.sessionKey,
        workId: activeEntry.workId,
        accountRecordId: activeEntry.accountRecordId,
        platform: activeEntry.platform,
        action: activeEntry.action,
        climateKind: activeEntry.climateKind,
        externalOutcome: {
          capability: evidence.capability,
          status: evidence.status,
          evidenceType: evidence.evidenceType,
          evidenceValue: evidence.evidenceValue ?? evidence.url ?? evidence.screenshotPath ?? evidence.snippet,
          externalId: evidence.externalId,
        },
        ts: Date.now(),
        env,
        result: {
          payloads: [{ text: evidence.summary }],
          summary: evidence.summary,
        },
      });
      completed += 1;
    } catch (error) {
      failed += 1;
      releaseGenesisPlatformAccountSync({
        recordId: account.recordId,
        lastOutcome: `external_exec_failed:${String(error)}`.slice(0, 280),
        status: /auth_required|login/i.test(String(error)) ? "relogin_needed" : "ready",
        env,
      });
    }
  }
  refreshGenesisProactiveWorkSummarySnapshotSync(env);
  return { attempted, completed, failed };
}

