"""
獎項匯入：獎項一覽表.xlsx → server/prizes.kh.json

用法：
    python scripts/import-prizes.py "C:\\Users\\smtony\\Downloads\\獎項一覽表.xlsx"

行銷更新 Excel 後重跑這支，再 git push，Zeabur 重新部署就會把新獎項寫進 DB。
已發出的數量（prizes.issued）不會被覆蓋。
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path.home() / "Downloads" / "獎項一覽表.xlsx"

# 新版 Excel 18 欄：0-7 臺北 / 8-17 高雄。（舊版 20 欄含「機率」，行銷已移除。）
KH = dict(level=8, slot=9, name=10, link=11, quota=12,
          threshold=13, terms=14, expiry=15, code=16, owner=17)

TIER_BY_LEVEL = {"I": 5, "II": 3, "III": 1}   # 一等獎投 5 / 二等獎投 3 / 三等獎投 1
TIER_LABEL = {5: "一等獎", 3: "二等獎", 1: "三等獎"}

# ── 行銷指定隱藏的獎項（完全比對名稱）──────────────────────────
# 轉盤、獎項一覽、抽獎池三處皆排除。本階段臺北整組不進，這兩筆是額外保險。
HIDDEN = {
    "臺北洲際酒店 高樓層開放式套房住宿一晚（含雙人早餐）",
    "臺北洲際酒店 豪華經典房住宿一晚（含雙人早餐）",
}

# ── 中獎權重（Tony 2026-09-01 拍板）─────────────────────────────
# Excel 已無機率欄。一等獎三個實體獎品各 2%，其餘由洲遊幣獎吸收；
# 二等／三等比照同一精神：實體獎壓低、洲遊幣獎當「退幣重抽」吸收剩餘機率。
# key = 獎項 id，value = 百分比。未列出的 id 自動吃掉該等級剩餘的機率。
WEIGHT_PCT = {
    # 一等獎（投 5 枚）
    "kh-5-1": 2.0,    # 港灣海景開放式套房 住宿一晚
    "kh-5-2": 2.0,    # 豪華經典房 住宿一晚
    "kh-5-4": 2.0,    # 餐飲 5 折優惠禮遇
    # kh-5-3 洲遊幣 +5 → 自動吃剩餘 94%

    # 二等獎（投 3 枚）
    "kh-3-1": 6.0,    # 餐飲 85 折優惠禮遇（名額 10）
    "kh-3-3": 3.0,    # BL.T33 洲際經典雙人下午茶（名額 5）
    "kh-3-4": 3.0,    # 玫果沁釀覆盆莓煎茶氣泡飲（名額 5）
    # kh-3-2 洲遊幣 +3 → 自動吃剩餘 88%

    # 三等獎（投 1 枚）
    "kh-1-1": 8.0,    # 明信片組（名額 20）
    "kh-1-3": 8.0,    # 洲賀熊（名額 20）
    "kh-1-4": 8.0,    # 旅行外幣收納錢包（名額 20）
    "kh-1-5": 4.0,    # 天然楠竹不鏽鋼環保隨行瓶（名額 10）
    "kh-1-6": 4.0,    # 餐飲抵用券 NT$500（名額 10）
    # kh-1-2 洲遊幣 +1 → 自動吃剩餘 68%
}


def cell(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        sys.exit(f"找不到檔案：{src}")

    ws = openpyxl.load_workbook(src, data_only=True)["獎項一覽表"]
    rows = list(ws.iter_rows(values_only=True))

    prizes = []
    for r in rows[2:]:
        level, slot, name = cell(r[KH["level"]]), r[KH["slot"]], cell(r[KH["name"]])
        if level not in TIER_BY_LEVEL or not name or name in HIDDEN:
            continue
        try:
            quota = int(float(r[KH["quota"]] or 0))
        except (TypeError, ValueError):
            quota = 0
        coin = re.search(r"洲遊幣》?\s*\+\s*(\d+)", name)
        threshold = cell(r[KH["threshold"]])
        prizes.append({
            "id": f"kh-{TIER_BY_LEVEL[level]}-{int(slot)}",
            "hotel": "KH",
            "tier": TIER_BY_LEVEL[level],
            "slot": int(slot),
            "name": name,
            "coupon_link": cell(r[KH["link"]]),
            "coin_reward": int(coin.group(1)) if coin else 0,
            "quota": quota,
            "weight": 0.0,          # 下面統一分配
            "spend_threshold": None if threshold == "X" else threshold,
            "terms": cell(r[KH["terms"]]),
            "expiry_note": cell(r[KH["expiry"]]),
            "owner": cell(r[KH["owner"]]),
        })

    # 套用權重：明確指定的照給，同等級剩餘的平均分給未指定者。
    for tier in (1, 3, 5):
        group = [p for p in prizes if p["tier"] == tier]
        assigned = [p for p in group if p["id"] in WEIGHT_PCT]
        rest = [p for p in group if p["id"] not in WEIGHT_PCT]
        used = sum(WEIGHT_PCT[p["id"]] for p in assigned)
        if used > 100.0 + 1e-9:
            sys.exit(f"{TIER_LABEL[tier]} 指定機率合計 {used}% > 100%，請修正 WEIGHT_PCT")
        for p in assigned:
            p["weight"] = WEIGHT_PCT[p["id"]]
        if rest:
            share = (100.0 - used) / len(rest)
            for p in rest:
                p["weight"] = round(share, 4)
        elif used < 100.0 - 1e-9:
            sys.exit(f"{TIER_LABEL[tier]} 機率合計只有 {used}%，且沒有可吸收剩餘的格位")

    out = ROOT / "server" / "prizes.kh.json"
    out.write_text(json.dumps(prizes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"匯入 {len(prizes)} 個高雄獎項 → {out.relative_to(ROOT)}\n")
    physical_total = 0
    for tier in (1, 3, 5):
        group = [p for p in prizes if p["tier"] == tier]
        total_w = sum(p["weight"] for p in group)
        phys = [p for p in group if not p["coin_reward"]]
        phys_rate = sum(p["weight"] for p in phys)
        phys_qty = sum(p["quota"] for p in phys)
        physical_total += phys_qty
        print(f"── {TIER_LABEL[tier]}（投 {tier} 枚）· 機率合計 {total_w:g}% ──")
        for p in group:
            kind = "Omnichat 券" if p["coupon_link"] else (
                f"洲遊幣 +{p['coin_reward']}（退幣重抽）" if p["coin_reward"] else "⚠ 無連結")
            print(f"   {p['slot']}. {p['name'][:30]:<30} 名額{p['quota']:>3}  {p['weight']:>5.4g}%  {kind}")
        print(f"   → 實體獎中獎率 {phys_rate:g}%、實體庫存 {phys_qty} 份\n")
    print(f"實體獎總庫存：{physical_total} 份")


if __name__ == "__main__":
    main()
