/**
 * Task definitions. Completing tasks is the only way to earn coins.
 *
 * Seven follow/share tasks plus the details form, one coin each, eight in total.
 * Following a channel cannot genuinely be verified -- Instagram and Facebook
 * offer no API for it -- so this works on trust: the coin is issued when the
 * player goes there and comes back. What the server does guarantee is that one
 * LINE account can claim each task only once.
 */
export const SOCIAL = {
  ig_khh: "https://www.instagram.com/intercontinental_kaohsiung/",
  fb_khh: "https://www.facebook.com/ICKaohsiung/",
  // Taipei. These two tasks raise the per-person ceiling so the top tier is
  // reachable, and send traffic to the Taipei channels.
  ig_tpe: "https://www.instagram.com/intercontinental_taipei/",
  fb_tpe: "https://www.facebook.com/ICTaipei/",
  // Kaohsiung, TASTE
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

/** A task with no URL yet is not published, so nobody can tap a dead link. */
export const PUBLISHED_TASKS = TASKS.filter((t) => t.kind !== "follow" || t.url);

export const TASK_BY_ID = Object.fromEntries(PUBLISHED_TASKS.map((t) => [t.id, t]));

export const MAX_EARNABLE = PUBLISHED_TASKS.reduce((s, t) => s + t.reward, 0);
