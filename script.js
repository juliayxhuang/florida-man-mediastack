const headlineEl = document.getElementById("headline");
const metaEl = document.getElementById("meta");
const sourceEl = document.getElementById("source");
const verifyEl = document.getElementById("verify");
const daysContainer = document.getElementById("days");
const monthsContainer = document.getElementById("months");
const button = document.getElementById("generateBtn");

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

async function fetchArticlePublishDate(articleUrl) {
  if (!articleUrl) return { published: null, source: null, reason: "no_url" };

  // If opened as a local file, there’s no server to proxy the request.
  if (location.protocol === "file:") {
    return { published: null, source: null, reason: "no_server_file_protocol" };
  }

  const apiUrl = `/api/publish-date?url=${encodeURIComponent(articleUrl)}`;
  try {
    const res = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return { published: null, source: null, reason: "api_error" };
    const data = await res.json();
    if (!data?.ok || !data?.published) {
      return { published: null, source: data?.source ?? null, reason: data?.reason ?? "not_found" };
    }
    const d = new Date(data.published);
    if (Number.isNaN(d.getTime())) return { published: null, source: data?.source ?? null, reason: "bad_date" };
    return { published: d, source: data.source ?? null, reason: null };
  } catch {
    return { published: null, source: null, reason: "api_unreachable" };
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
    const query = encodeURIComponent(`Florida Man ${selectedMonth} ${selectedDay}`);
    const url = `https://www.reddit.com/r/FloridaMan/search.json?q=${query}&restrict_sr=1&sort=relevance&limit=25`;

    const response = await fetch(url, {
      headers: { "Accept": "application/json" }
    });

    const data = await response.json();
    const posts = data.data.children;

    if (!posts || posts.length === 0) {
      headlineEl.textContent = "No headlines found 😔";
      return;
    }

    const titleMatchedPosts = posts.filter(p => {
      const title = p?.data?.title || "";
      return titleMatchesMonthDay(title, selectedMonth, selectedDay);
    });

    const dateMatchedPosts = posts.filter(p => {
      const createdUTC = p?.data?.created_utc;
      if (!createdUTC) return false;
      const createdDate = new Date(createdUTC * 1000);
      return isMonthDayMatchUtc(createdDate, selectedMonth, selectedDay);
    });

    const candidatePosts =
      titleMatchedPosts.length > 0 ? titleMatchedPosts :
      dateMatchedPosts.length > 0 ? dateMatchedPosts :
      posts;

    shuffleInPlace(candidatePosts);

    let chosen = null;
    let chosenRedditDate = null;
    let chosenArticleUrl = null;
    let chosenPublishDate = null;
    let chosenPublishSource = null;
    let chosenVerifyReason = null;

    // Try a handful of candidates until we find one whose *article* publish date matches
    // the selected month/day (when we can detect it).
    const attempts = Math.min(8, candidatePosts.length);
    for (let i = 0; i < attempts; i++) {
      const post = candidatePosts[i];
      const createdUTC = post.data.created_utc;
      const redditDate = new Date(createdUTC * 1000);
      const articleUrl = getExternalArticleUrl(post);

      if (!articleUrl) {
        chosen = post;
        chosenRedditDate = redditDate;
        chosenArticleUrl = null;
        chosenPublishDate = null;
        chosenPublishSource = null;
        chosenVerifyReason = "no_external_link";
        break;
      }

      const { published, source, reason } = await fetchArticlePublishDate(articleUrl);
      if (!published) {
        // If we can't detect a publish date, accept it (but message that it couldn't be verified).
        chosen = post;
        chosenRedditDate = redditDate;
        chosenArticleUrl = articleUrl;
        chosenPublishDate = null;
        chosenPublishSource = source;
        chosenVerifyReason =
          (titleMatchedPosts.length === 0 && dateMatchedPosts.length === 0)
            ? "no_frontend_date_match"
            : (reason || "not_found");
        break;
      }

      if (isMonthDayMatchUtc(published, selectedMonth, selectedDay)) {
        chosen = post;
        chosenRedditDate = redditDate;
        chosenArticleUrl = articleUrl;
        chosenPublishDate = published;
        chosenPublishSource = source;
        chosenVerifyReason = null;
        break;
      }
    }

    if (!chosen) {
      chosen = candidatePosts[0];
      const createdUTC = chosen.data.created_utc;
      chosenRedditDate = new Date(createdUTC * 1000);
      chosenArticleUrl = getExternalArticleUrl(chosen);
      chosenVerifyReason =
        (titleMatchedPosts.length === 0 && dateMatchedPosts.length === 0)
          ? "no_frontend_date_match"
          : "no_verified_match";
    }

    const title = chosen.data.title;
    const year = (chosenPublishDate || chosenRedditDate).getFullYear();

    headlineEl.textContent = title;
    metaEl.textContent = `${selectedMonth.toUpperCase()} ${selectedDay}, ${year} · R/FLORIDAMAN`;

    const redditLink = getRedditPermalink(chosen);
    const linkToShow = chosenArticleUrl || redditLink;
    if (linkToShow) {
      sourceEl.textContent = "Source: ";
      const a = document.createElement("a");
      a.href = linkToShow;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = "open link";
      sourceEl.appendChild(a);
    }

    if (chosenPublishDate) {
      verifyEl.textContent = `Verified publish date: ${formatLongDate(chosenPublishDate)} (${chosenPublishSource || "detected"})`;
    } else if (chosenVerifyReason === "no_external_link") {
      verifyEl.textContent = "No external article link on this post (using Reddit post date).";
    } else if (chosenVerifyReason === "no_server_file_protocol") {
      verifyEl.textContent = "Open via the local server to verify publish dates (file:// can’t fetch articles).";
    } else if (chosenVerifyReason === "api_unreachable") {
      verifyEl.textContent = "Publish-date verifier server not reachable (using Reddit post date).";
    } else if (chosenVerifyReason === "no_frontend_date_match") {
      verifyEl.textContent = "Couldn’t find an exact match for that date in results (showing the closest match).";
    } else if (chosenVerifyReason === "no_verified_match") {
      verifyEl.textContent = "Couldn’t find a matching publish date (showing a Reddit-matched post).";
    } else {
      verifyEl.textContent = "Couldn’t detect the article publish date (using Reddit post date).";
    }

  } catch (err) {
    console.error(err);
    headlineEl.textContent = "Florida Man is being chaotic right now.";
  }
});
