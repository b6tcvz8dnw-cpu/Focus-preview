import { dateKey, buildWeekData } from "../core/date-time.js";

const achievements = [
  { minutes: 30, title: "はじめの一歩", description: "集中時間を合計30分達成", icon: "✦" },
  { minutes: 180, title: "積み重ね", description: "集中時間を合計3時間達成", icon: "◆" },
  { minutes: 600, title: "習慣の芽", description: "集中時間を合計10時間達成", icon: "❋" },
  { minutes: 1500, title: "探究者", description: "集中時間を合計25時間達成", icon: "✧" },
  { minutes: 3000, title: "継続の人", description: "集中時間を合計50時間達成", icon: "♜" },
  { minutes: 6000, title: "その先へ", description: "集中時間を合計100時間達成", icon: "★" },
  { minutes: 12000, title: "深い探究", description: "集中時間を合計200時間達成", icon: "✺" },
  { minutes: 30000, title: "積み重ねの軌跡", description: "集中時間を合計500時間達成", icon: "♛" }
];

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

/**
 * DOM presentation only. All data and navigation state are supplied by the
 * application; this module never reads storage or mutates learning records.
 */
export function createStudyViews({ root = document } = {}) {
  const $ = id => root.getElementById(id);
  let lastAchievementMinutes = null;

  function renderAchievements(minutes) {
    const currentMinutes = Math.max(0, Number(minutes) || 0);
    if (currentMinutes === lastAchievementMinutes) return;
    lastAchievementMinutes = currentMinutes;
    $("achievementList").innerHTML = achievements.map(item => {
      const earned = currentMinutes >= item.minutes;
      const progress = Math.min(100, currentMinutes / item.minutes * 100);
      return '<div class="achievement ' + (earned ? "" : "locked") + '"><div class="achievement-icon">' + item.icon + '</div><div><strong>' + item.title + '</strong><small>' + item.description + '</small><div class="achievement-progress"><i style="width:' + progress + '%"></i></div></div><div class="achievement-state">' + (earned ? "達成！" : Math.floor(progress) + "%") + '</div></div>';
    }).join("");
    const next = achievements.find(item => currentMinutes < item.minutes);
    $("achievementNext").textContent = next
      ? "次の達成まで：あと" + (next.minutes - currentMinutes) + "分"
      : "すべてのアチーブメントを達成！";
  }

  function renderWeekly({ history, now = new Date() }) {
    const data = buildWeekData(history, now);
    const sum = data.reduce((total, day) => total + day.minutes, 0);
    const max = Math.max(30, ...data.map(day => day.minutes));
    $("todayMinutes").textContent = Number(history[dateKey(now)] || 0);
    $("weekTotal").textContent = sum >= 60
      ? Math.floor(sum / 60) + "時間" + (sum % 60 ? sum % 60 + "分" : "")
      : sum + "分";
    $("weekRange").textContent = data[0].key.slice(5).replace("-", "/") + " 〜 " + data[6].key.slice(5).replace("-", "/");
    $("weekChart").setAttribute("aria-label", "直近7日間の日別学習時間。" + data.map(day => day.label + " " + day.minutes + "分").join("、"));
    $("weekChart").innerHTML = data.map(day => {
      const height = day.minutes ? Math.max(5, day.minutes / max * 100) : 0;
      return '<div class="day-col" aria-label="' + day.key + " " + day.minutes + '分"><div class="day-value">' + (day.minutes ? day.minutes + "分" : "–") + '</div><div class="bar-track"><div class="day-bar" style="height:' + height + '%"></div></div><div class="day-label">' + day.label + "</div></div>";
    }).join("");
    return data;
  }

  function renderGoals({ history, dailyGoal, weeklyGoal, now = new Date() }) {
    const today = Number(history[dateKey(now)] || 0);
    const week = buildWeekData(history, now).reduce((total, day) => total + day.minutes, 0);
    const item = (label, value, goal) => {
      const progress = goal ? Math.min(100, value / goal * 100) : 0;
      const progressText = goal ? value + "分 / " + goal + "分" : value + "分、目標未設定";
      return '<div class="goal-line"><div class="goal-head"><span>' + label + '</span><b>' + value + " / " + (goal || "未設定") + '分</b></div><div class="goal-track" role="progressbar" aria-label="' + label + 'の目標進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '" aria-valuetext="' + progressText + '"><div class="goal-fill" style="width:' + progress + '%"></div></div></div>';
    };
    $("goalProgress").innerHTML = item("今日", today, dailyGoal) + item("今週", week, weeklyGoal);
  }

  function renderCalendar({ history, cursor }) {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (const weekday of ["日", "月", "火", "水", "木", "金", "土"]) {
      cells.push('<div class="calendar-cell head" aria-hidden="true">' + weekday + "</div>");
    }
    const max = Math.max(30, ...Array.from({ length: days }, (_, index) =>
      Number(history[dateKey(new Date(year, month, index + 1))] || 0)
    ));
    for (let index = 0; index < first; index++) cells.push('<div class="calendar-cell" aria-hidden="true"></div>');
    for (let day = 1; day <= days; day++) {
      const key = dateKey(new Date(year, month, day));
      const value = Number(history[key] || 0);
      const heat = value ? Math.max(.15, value / max) : 0;
      const today = key === dateKey(new Date());
      const accessibleValue = value ? value + "分の集中記録" : "集中記録なし";
      cells.push('<div class="calendar-cell ' + (today ? "today" : "") + '" role="img" aria-label="' + year + '年' + (month + 1) + '月' + day + '日、' + accessibleValue + '"' + (today ? ' aria-current="date"' : "") + '><span aria-hidden="true">' + day + '</span><i class="heat" aria-hidden="true" style="--heat:' + heat + '"></i></div>');
    }
    $("calendarTitle").textContent = year + "年 " + (month + 1) + "月";
    $("calendarGrid").setAttribute("role", "group");
    $("calendarGrid").setAttribute("aria-label", year + "年" + (month + 1) + "月の学習時間カレンダー");
    $("calendarGrid").innerHTML = cells.join("");
  }

  function renderHistory({ records, query = "", reflectionOnly = false, subject = "", period = "all", now = new Date() }) {
    const normalizedQuery = query.trim().toLowerCase();
    const days = Number(period);
    const cutoff = Number.isFinite(days) && days > 0
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime()
      : 0;
    const list = [...records].sort((a, b) => b.timestamp - a.timestamp)
      .filter(record => (!reflectionOnly || String(record.note || "").trim())
        && (!subject || String(record.subject || "") === subject)
        && (!cutoff || Number(record.timestamp) >= cutoff)
        && (!normalizedQuery || [record.note, record.intention, record.subject].some(value => String(value || "").toLowerCase().includes(normalizedQuery))))
      .slice(0, 60);
    $("historyList").innerHTML = list.length
      ? list.map(record => '<div class="history-item"><div class="history-top"><span>' +
        new Date(record.timestamp).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) +
        "</span><b>" + record.minutes + "分</b></div>" +
        (record.subject ? '<span class="history-subject">' + escapeHTML(record.subject) + "</span>" : "") +
        (record.intention ? "<small>開始前の意図：" + escapeHTML(record.intention) + "</small>" : "") +
        (record.note ? "<small>振り返り：" + escapeHTML(record.note) + "</small>" : "") +
        '<div class="history-actions"><button data-record-edit="' + escapeHTML(record.id) + '">分数を修正</button><button data-record-delete="' + escapeHTML(record.id) + '">削除</button></div></div>'
      ).join("")
      : '<p class="muted">条件に合う記録がありません。科目や期間を変えてみてね。</p>';
  }

  function renderAnalytics({ history, range, now = new Date() }) {
    const buckets = [];
    const sumRange = (start, end) => Object.entries(history).reduce((total, [key, value]) => {
      const date = new Date(key + "T12:00:00");
      return date >= start && date < end ? total + Math.max(0, Number(value) || 0) : total;
    }, 0);

    if (range === "day") {
      for (let index = 13; index >= 0; index--) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - index);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        buckets.push({ label: (start.getMonth() + 1) + "/" + start.getDate(), value: sumRange(start, end) });
      }
    } else if (range === "week") {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      for (let index = 11; index >= 0; index--) {
        const start = new Date(monday);
        start.setDate(start.getDate() - 7 * index);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        buckets.push({ label: (start.getMonth() + 1) + "/" + start.getDate(), value: sumRange(start, end) });
      }
    } else {
      for (let index = 11; index >= 0; index--) {
        const start = new Date(now.getFullYear(), now.getMonth() - index, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - index + 1, 1);
        buckets.push({
          label: start.getFullYear() === now.getFullYear()
            ? start.getMonth() + 1
            : start.getFullYear() + "/" + (start.getMonth() + 1),
          value: sumRange(start, end)
        });
      }
    }

    const max = Math.max(30, ...buckets.map(bucket => bucket.value));
    const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    const period = range === "day" ? "直近14日間" : range === "week" ? "直近12週間" : "直近12か月";
    $("analyticsContent").innerHTML = '<div class="analytics-total"><strong>' + total +
      '</strong><span>分 · 表示期間の合計</span></div><div class="analytics-bars">' +
      buckets.map(bucket => '<div class="analytics-bar-col" title="' + bucket.label + "：" + bucket.value +
        '分"><span>' + (bucket.value ? bucket.value : "–") +
        '</span><i><b style="height:' + Math.max(0, bucket.value / max * 100) +
        '%"></b></i><small>' + bucket.label + "</small></div>").join("") +
      '</div><p class="muted">' + period + " · 記録がない期間も含めて表示</p>";
    root.querySelectorAll("[data-analytics-range]").forEach(button =>
      button.classList.toggle("selected", button.dataset.analyticsRange === range)
    );
    return buckets;
  }

  return { renderAchievements, renderWeekly, renderGoals, renderCalendar, renderHistory, renderAnalytics };
}
