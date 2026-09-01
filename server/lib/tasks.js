/**
 * 任務定義（賺洲遊幣的唯一途徑）。
 *
 * 沿用 prototype 的 7 個任務 + 填資料，每項 +1 枚，上限 8 枚。
 * ⚠️ 追蹤社群無法真的驗證（IG/FB 沒有這種 API），沿用原型的「信任制」：
 *    客人點了前往、回到頁面就發幣。伺服器只保證「同一個 LINE 帳號每個任務只能領一次」。
 */
export const SOCIAL = {
  ig_khh: "https://www.instagram.com/intercontinental_kaohsiung/",
  fb_khh: "https://www.facebook.com/ICKaohsiung/",
  ig_shiyu: null, // TODO 行銷提供「食遇」官方 Instagram 後填入
  fb_shiyu: null, // TODO 行銷提供「食遇」官方 Facebook 後填入
};

export const TASKS = [
  { id: "ig_khh",   title: "追蹤 高雄洲際酒店 Instagram",      kind: "follow", url: SOCIAL.ig_khh,   reward: 1 },
  { id: "fb_khh",   title: "追蹤 高雄洲際酒店 Facebook",       kind: "follow", url: SOCIAL.fb_khh,   reward: 1 },
  { id: "ig_shiyu", title: "追蹤 高雄洲際酒店 食遇 Instagram", kind: "follow", url: SOCIAL.ig_shiyu, reward: 1 },
  { id: "fb_shiyu", title: "追蹤 高雄洲際酒店 食遇 Facebook",  kind: "follow", url: SOCIAL.fb_shiyu, reward: 1 },
  { id: "share",    title: "分享本活動給好友",                  kind: "share",  url: null,            reward: 1 },
  { id: "profile",  title: "填寫個人資料",                      kind: "profile", url: null,           reward: 1 },
];

/** 網址還沒補的任務不對外發布，免得客人點到死連結。 */
export const PUBLISHED_TASKS = TASKS.filter((t) => t.kind !== "follow" || t.url);

export const TASK_BY_ID = Object.fromEntries(PUBLISHED_TASKS.map((t) => [t.id, t]));

export const MAX_EARNABLE = PUBLISHED_TASKS.reduce((s, t) => s + t.reward, 0);
