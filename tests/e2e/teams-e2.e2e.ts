import { expect, test, Page } from "@playwright/test";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { assertNoRawDatabaseError, credentials, login, navigateAfterLogin } from "./helpers";

let fixtureAdmin: SupabaseClient;
let assistantId: string | undefined;
let assistantPhotoPath: string | undefined;
let assistantOriginalPhoto: string | null = null;

test.beforeAll(async () => {
  const url = process.env.BSMILE_QA_SUPABASE_URL!;
  if (process.env.BSMILE_QA_PROJECT_REF !== "enylrvmjgbntkrgpqsfe" || new URL(url).hostname !== "enylrvmjgbntkrgpqsfe.supabase.co") throw new Error("Teams E2 fixtures require QA");
  const serviceKey = process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("QA provisioning credential missing");
  fixtureAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const assistant = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await assistant.auth.signInWithPassword(credentials("assistant_manager"));
  if (signedIn.error || !signedIn.data.user) throw new Error("Could not sign in QA Assistant Manager");
  assistantId = signedIn.data.user.id;
  const profile = await fixtureAdmin.from("profiles").select("avatar_url").eq("id", assistantId).single();
  if (profile.error) throw new Error("Could not load the QA Assistant Manager profile");
  assistantOriginalPhoto = profile.data.avatar_url;
  assistantPhotoPath = `${assistantId}/teams-e2-avatar-${crypto.randomUUID()}.png`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=", "base64");
  const uploaded = await assistant.storage.from("profile-photos").upload(assistantPhotoPath, png, { contentType: "image/png", upsert: true });
  if (uploaded.error) throw new Error("Could not upload QA Teams profile photo");
  const saved = await assistant.from("profiles").update({ avatar_url: assistantPhotoPath }).eq("id", assistantId);
  if (saved.error) throw new Error("Could not attach QA Teams profile photo");
  await assistant.auth.signOut();
});

test.afterAll(async () => {
  const staleGroups = await fixtureAdmin.from("chat_conversations").select("id,group_admin_id").like("title", "E2 QA Group %").is("archived_at", null);
  if (staleGroups.error) throw new Error("Could not inspect disposable Teams groups");
  for (const group of staleGroups.data || []) {
    const archived = await fixtureAdmin.from("chat_conversations").update({ archived_at: new Date().toISOString(), archived_by: group.group_admin_id }).eq("id", group.id);
    if (archived.error) throw new Error("Disposable Teams group cleanup failed");
  }
  if (assistantId) {
    const restored = await fixtureAdmin.from("profiles").update({ avatar_url: assistantOriginalPhoto }).eq("id", assistantId);
    if (restored.error) throw new Error("QA Assistant Manager photo restoration failed");
  }
  if (assistantPhotoPath) await fixtureAdmin.storage.from("profile-photos").remove([assistantPhotoPath]);
});

const chatPath = (role: "employee" | "general_manager" | "assistant_manager") => role === "general_manager" ? "/admin/chat" : "/employee/chat";

async function openConversationList(page: Page) {
  await expect(page.locator(".chat-hub")).toBeVisible({ timeout: 30_000 });
  const back = page.getByRole("button", { name: "Back", exact: true });
  if (page.viewportSize()!.width <= 760) {
    await expect(back).toBeVisible({ timeout: 30_000 });
    await back.click();
  }
  await expect(page.getByRole("button", { name: "New conversation", exact: true })).toBeVisible();
}

for (const role of ["employee", "general_manager", "assistant_manager"] as const) {
  test(`${role} sees stable Teams avatars and a mobile-safe Create Group action`, async ({ page }) => {
    await login(page, role);
    await navigateAfterLogin(page, chatPath(role));
    await expect(page.locator(".chat-hub")).toBeVisible({ timeout: 30_000 });
    const createGroup = page.getByRole("button", { name: "Create group", exact: true });
    await expect(createGroup).toBeVisible();
    if (page.viewportSize()!.width <= 760) expect((await createGroup.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await openConversationList(page);
    const system = page.locator(".chat-conversation.system").first();
    await expect(system).toBeVisible();
    await system.click();
    await page.getByRole("button", { name: "Conversation details", exact: true }).click();
    const avatars = page.locator(".chat-member .chat-avatar");
    await expect(avatars.first()).toBeVisible();
    expect(await avatars.evaluateAll(nodes => nodes.every(node => ["profile", "demo", "initials"].includes(node.getAttribute("data-avatar-source") || "")))).toBe(true);
    expect(await avatars.first().evaluate(node => {
      const box = node.getBoundingClientRect();
      return Math.abs(box.width - box.height) < 1 && box.width > 0;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await assertNoRawDatabaseError(page);
  });
}

test("Assistant Manager receives its authorized signed profile photo in Teams", async ({ page }) => {
  await login(page, "assistant_manager");
  await navigateAfterLogin(page, "/employee/chat");
  await page.getByRole("button", { name: "Conversation details", exact: true }).click();
  const image = page.locator('.chat-member .chat-avatar[data-avatar-source="profile"] img').first();
  await expect(image).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await page.route("**/storage/v1/object/sign/profile-photos/**", route => route.request().method() === "GET" ? route.abort() : route.continue());
  await page.reload();
  await page.getByRole("button", { name: "Conversation details", exact: true }).click();
  await expect(page.locator('.chat-member .chat-avatar[data-avatar-source="initials"] [aria-label="QA Assistant Manager initials"]')).toBeVisible({ timeout: 30_000 });
  await assertNoRawDatabaseError(page);
});

test("General Manager creates, manages the photo lifecycle, and logically archives a custom group", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await login(page, "general_manager");
  await navigateAfterLogin(page, "/admin/chat");
  const marker = `E2 QA Group ${Date.now()}`;
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New group" });
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Create group", exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Group name").fill(marker);
  const people = dialog.locator(".chat-people-list>button");
  await expect(people.first()).toBeVisible();
  await people.filter({ hasText: "A QA Employee With An Exceptionally Long Name For Mobile Layout" }).first().click();
  await dialog.getByRole("searchbox", { name: /Members/ }).fill("QA Assistant Manager");
  const assistantPerson = people.first();
  await expect(assistantPerson).toBeVisible();
  await expect(assistantPerson).toContainText("QA Assistant Manager");
  await assistantPerson.click();
  await expect(dialog.locator(".chat-selected-members>button")).toHaveCount(2);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await openConversationList(page);
  const persisted = page.locator(".chat-conversation").filter({ hasText: marker });
  await expect(persisted).toBeVisible({ timeout: 30_000 });
  await persisted.click();
  await expect(page.getByRole("heading", { name: marker, exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Conversation details", exact: true }).click();
  const addPhoto = page.getByRole("button", { name: "Add photo", exact: true });
  await expect(addPhoto).toBeVisible();
  if (page.viewportSize()!.width <= 760) expect((await addPhoto.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Choose group photo").setInputFiles({ name: "group-one.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeVisible({ timeout: 30_000 });
  const firstDetailPhoto = page.locator('.chat-detail-summary-avatar[data-avatar-source="profile"] img');
  await expect(firstDetailPhoto).toBeVisible();
  const firstPhotoUrl = await firstDetailPhoto.getAttribute("src");
  await page.getByRole("button", { name: "Back to conversation", exact: true }).click();
  await expect(page.locator('.chat-message-header .chat-avatar[data-avatar-source="profile"] img')).toBeVisible();
  await openConversationList(page);
  const photographed = page.locator(".chat-conversation").filter({ hasText: marker });
  await expect(photographed.locator('.chat-avatar[data-avatar-source="profile"] img')).toBeVisible();
  await photographed.click();
  await page.reload();
  await openConversationList(page);
  const reloaded = page.locator(".chat-conversation").filter({ hasText: marker });
  await expect(reloaded.locator('.chat-avatar[data-avatar-source="profile"] img')).toBeVisible({ timeout: 30_000 });
  await reloaded.click();
  await page.getByRole("button", { name: "Conversation details", exact: true }).click();
  await page.getByLabel("Choose group photo").setInputFiles({ name: "group-two.png", mimeType: "image/png", buffer: png });
  await expect.poll(() => page.locator('.chat-detail-summary-avatar[data-avatar-source="profile"] img').getAttribute("src")).not.toBe(firstPhotoUrl);
  await expect.poll(async () => (await fixtureAdmin.storage.from("group-photos").list(`groups/${(await fixtureAdmin.from("chat_conversations").select("id").eq("title", marker).single()).data!.id}`)).data?.length).toBe(1);
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add photo", exact: true })).toBeVisible();
  await expect(page.locator('.chat-detail-summary-avatar[data-avatar-source="initials"]')).toBeVisible();
  const groupRecord = await fixtureAdmin.from("chat_conversations").select("id,avatar_path").eq("title", marker).single();
  if (groupRecord.error) throw groupRecord.error;
  expect(groupRecord.data.avatar_path).toBeNull();
  await expect.poll(async () => (await fixtureAdmin.storage.from("group-photos").list(`groups/${groupRecord.data.id}`)).data?.length).toBe(0);

  const memberContext = await browser.newContext({ baseURL: process.env.BSMILE_QA_BASE_URL, viewport: page.viewportSize()! });
  try {
    const memberPage = await memberContext.newPage();
    await login(memberPage, "assistant_manager", { reuseState: false });
    await navigateAfterLogin(memberPage, "/employee/chat");
    await openConversationList(memberPage);
    await memberPage.locator(".chat-conversation").filter({ hasText: marker }).click();
    await memberPage.getByRole("button", { name: "Conversation details", exact: true }).click();
    await expect(memberPage.getByRole("button", { name: "Add photo", exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole("button", { name: "Change photo", exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
  await expect(page.locator(".chat-member").filter({ hasText: "Admin" })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Back to conversation", exact: true }).click();

  for (const theme of ["standard", "colorful"] as const) {
    await page.locator("html").evaluate((root, value) => root.setAttribute("data-theme", value), theme);
    const composer = page.locator(".chat-composer");
    await expect(composer).toBeVisible();
    if (theme === "colorful") expect(await composer.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe("rgb(255, 255, 255)");
    for (const control of [page.getByRole("button", { name: "Attach file" }), page.getByRole("button", { name: "Record voice message" }), page.getByRole("button", { name: "Send", exact: true })]) {
      await expect(control).toBeVisible();
      if (page.viewportSize()!.width <= 760) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }

  await page.getByRole("button", { name: "More conversation options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete group", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Delete group?" });
  await confirmation.getByRole("button", { name: "Delete group", exact: true }).click();
  await expect(page.getByRole("heading", { name: marker, exact: true })).toHaveCount(0);

  const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await db.auth.signInWithPassword(credentials("general_manager"));
  if (auth.error) throw auth.error;
  const archived = await db.from("chat_conversations").select("archived_at").eq("title", marker).single();
  if (archived.error || !archived.data.archived_at) throw archived.error || new Error("group was not logically archived");
  await db.auth.signOut();
  await assertNoRawDatabaseError(page);
});

test("system group never exposes custom-group archive controls", async ({ page }) => {
  await login(page, "general_manager");
  await navigateAfterLogin(page, "/admin/chat");
  await openConversationList(page);
  const system = page.locator(".chat-conversation.system").first();
  await expect(system).toBeVisible();
  await system.click();
  await page.getByRole("button", { name: "Conversation details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add photo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to conversation", exact: true }).click();
  await page.getByRole("button", { name: "More conversation options", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Delete group", exact: true })).toHaveCount(0);
  await assertNoRawDatabaseError(page);
});
