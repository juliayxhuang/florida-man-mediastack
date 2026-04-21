const headlineEl = document.getElementById("headline");
const metaEl = document.getElementById("meta");
const sourceEl = document.getElementById("source");
const verifyEl = document.getElementById("verify");
const daysContainer = document.getElementById("days");
const monthsContainer = document.getElementById("months");
const button = document.getElementById("generateBtn");
const strictToggle = document.getElementById("strictToggle");

let selectedDay = null;
let selectedMonth = null;

// MONTHS
const months = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

// RENDER DAYS (1–31)
for (let i = 1; i <= 31; i++) {
  const div = document.createElement("div");
  div.textContent = i;
  div.classList.add("day");

  div.addEventListener("click", () => {
    document.querySelectorAll(".day").forEach(d => d.classList.remove("selected"));
    div.classList.add("selected");
    selectedDay = i;
  });

  daysContainer.appendChild(div);
}

// RENDER MONTHS
months.forEach(month => {
  const div = document.createElement("div");
  div.textContent = month.slice(0, 3).toLowerCase();
  div.classList.add("month");

  div.addEventListener("click", () => {
    document.querySelectorAll(".month").forEach(m => m.classList.remove("selected"));
    div.classList.add("selected");
    selectedMonth = month;
  });

  monthsContainer.appendChild(div);
});

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isMonthDayMatchUtc(date, monthName, dayNumber) {
  return months[date.getUTCMonth()] === monthName && date.getUTCDate() === dayNumber;
}

function titleMatchesMonthDay(title, monthName, dayNumber) {
  if (!title) return false;
  const monthIdx = months.indexOf(monthName);
  if (monthIdx === -1) return false;

  const full = monthName;
  const abbr = monthName.slice(0, 3);
  const day = String(dayNumber);
  const day2 = dayNumber < 10 ? `0${dayNumber}` : null;

  const parts = [`\\b(?:${full}|${abbr})\\b\\s+${day}\\b`];
  if (day2) parts.push(`\\b(?:${full}|${abbr})\\b\\s+${day2}\\b`);

  const re = new RegExp(parts.join("|"), "i");
  return re.test(title);
}

function getRedditPermalink(post) {
  const permalink = post?.data?.permalink;
  if (!permalink) return null;
  return `https://www.reddit.com${permalink}`;
}

function getExternalArticleUrl(post) {
  const raw = post?.data?.url_overridden_by_dest || post?.data?.url;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("reddit.com") || host === "redd.it") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

async function fetchBestMatch(monthName, dayNumber, strictMode) {
  if (location.protocol === "file:") {
    return { ok: false, reason: "no_server_file_protocol" };
  }

  const apiUrl = `/api/find?month=${encodeURIComponent(monthName)}&day=${encodeURIComponent(
    dayNumber
  )}&strict=${strictMode ? "1" : "0"}`;

  try {
    const res = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: "api_error" };
    const data = await res.json();
    if (!data?.ok) return { ok: false, reason: "api_error" };
    return data;
  } catch {
    return { ok: false, reason: "api_unreachable" };
  }
}

// FETCH HEADLINE
button.addEventListener("click", async () => {

  if (!selectedDay || !selectedMonth) {
    return; // silently do nothing (as requested)
  }

  headlineEl.textContent = "Loading...";
  metaEl.textContent = "";
  sourceEl.textContent = "";
  verifyEl.textContent = "";

  try {
    const strictMode = strictToggle ? strictToggle.checked : true;
    const data = await fetchBestMatch(selectedMonth, selectedDay, strictMode);

    if (!data.ok) {
      headlineEl.textContent = "Backend not reachable 😔";
      verifyEl.textContent =
        data.reason === "no_server_file_protocol"
          ? "Open the Render URL (not file://) to use verification."
          : "Try refreshing (or check /health on your Render service).";
      return;
    }

    if (!data.result) {
      headlineEl.textContent = strictMode
        ? "No verified articles match that date 😔"
        : "No headlines found 😔";
      verifyEl.textContent = strictMode
        ? "Try turning strict mode off."
        : "Try a different date.";
      return;
    }

    const title = data.result.title;
    const published = data.result.published ? new Date(data.result.published) : null;
    const redditCreated = data.result.redditCreated ? new Date(data.result.redditCreated) : null;
    const year = (published || redditCreated || new Date()).getFullYear();

    headlineEl.textContent = title;
    metaEl.textContent = `${selectedMonth.toUpperCase()} ${selectedDay}, ${year} · R/FLORIDAMAN`;

    const linkToShow = data.result.articleUrl || data.result.redditUrl;
    if (linkToShow) {
      sourceEl.textContent = "Source: ";
      const a = document.createElement("a");
      a.href = linkToShow;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = "open link";
      sourceEl.appendChild(a);
    }

    if (data.result.matched && published) {
      verifyEl.textContent = `Verified publish date (NY): ${formatLongDate(published)} (${data.result.publishSource || "detected"})`;
    } else if (!data.result.articleUrl) {
      verifyEl.textContent = "No external article link found (showing Reddit post).";
    } else if (!published) {
      verifyEl.textContent = "No matching publish date found (showing closest match).";
    } else {
      verifyEl.textContent = "Publish date didn’t match (showing closest match).";
    }

  } catch (err) {
    console.error(err);
    headlineEl.textContent = "Florida Man is being chaotic right now.";
  }
});
