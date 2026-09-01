/**
 * 任務定義（賺洲遊幣的唯一途徑）。
 *
 * 沿用 prototype 的 7 個任務 + 填資料，每項 +1 枚，上限 8 枚。
 * ⚠️ 追蹤社群無法真的驗證（IG/FB 沒有這種 API），沿用原型的「信任制」：
 *    客人點了前往、回到頁面就發幣。伺服器只保證「同一個 LINE 帳號每個任務只能領一次」。
 */
export const SOCIAL = {
  ig_khh: "https://www.instagram.com/intercontinental_kaohsiung/",   // 已由行銷確認
  fb_khh: "https://www.facebook.com/ICKaohsiung/",
  // 臺北洲際（Tony 2026-09-01：臺北獎項已進轉盤，加這兩個任務讓每人幣數 4 → 6，
  // 一等獎（投 5 枚）才抽得到；同時也幫臺北洲際的社群導流）。
  // ⚠️ 這兩個網址沿用原型草稿，上線前請行銷確認是官方帳號本人。
  ig_tpe: "https://www.instagram.com/intercontinental_taipei/",
  fb_tpe: "https://www.facebook.com/ICTaipei/",
  // 高雄洲際「食遇 TASTE」（Tony 2026-09-01 提供）
  ig_shiyu: "https://www.instagram.com/taste_ickaohsiung/",
  fb_shiyu: "https://www.facebook.com/profile.php?id=61577973899822",
};

export const TASKS = [
  { id: "ig_khh",   title: "追蹤 高雄洲際酒店 Instagram",      kind: "follow", url: SOCIAL.ig_khh,   reward: 1 },
  { id: "fb_khh",   title: "追蹤 高雄洲際酒店 Facebook",       kind: "follow", url: SOCIAL.fb_khh,   reward: 1 },
  { id: "ig_tpe",   title: "追蹤 臺北洲際酒店 Instagram",      kind: "follow", url: SOCIAL.ig_tpe,   reward: 1 },
  { id: "fb_tpe",   title: "追蹤 臺北洲際酒店 Facebook",       kind: "follow", url: SOCIAL.fb_tpe,   reward: 1 },
  { id: "ig_shiyu", title: "追蹤 高雄洲際酒店 食遇 Instagram", kind: "follow", url: SOCIAL.ig_shiyu, reward: 1 },
  { id: "fb_shiyu", title: "追蹤 高雄洲際酒店 食遇 Facebook",  kind: "follow", url: SOCIAL.fb_shiyu, reward: 1 },
  { id: "share",    title: "分享本活動給好友",                  kind: "share",  url: null,            reward: 1 },
  { id: "profile",  title: "填寫個人資料",                      kind: "profile", url: null,           reward: 1 },
];

/** 網址還沒補的任務不對外發布，免得客人點到死連結。 */
export const PUBLISHED_TASKS = TASKS.filter((t) => t.kind !== "follow" || t.url);

export const TASK_BY_ID = Object.fromEntries(PUBLISHED_TASKS.map((t) => [t.id, t]));

export const MAX_EARNABLE = PUBLISHED_TASKS.reduce((s, t) => s + t.reward, 0);
