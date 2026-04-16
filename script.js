const headlineEl = document.getElementById("headline");
const metaEl = document.getElementById("meta");
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

// FETCH HEADLINE
button.addEventListener("click", async () => {

  if (!selectedDay || !selectedMonth) {
    return; // silently do nothing (as requested)
  }

  headlineEl.textContent = "Loading...";
  metaEl.textContent = "";

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

    const randomPost = posts[Math.floor(Math.random() * posts.length)];

    const title = randomPost.data.title;
    const createdUTC = randomPost.data.created_utc;
    const date = new Date(createdUTC * 1000);

    const year = date.getFullYear();

    headlineEl.textContent = title;
    metaEl.textContent = `${selectedMonth.toUpperCase()} ${selectedDay}, ${year} · R/FLORIDAMAN`;

  } catch (err) {
    console.error(err);
    headlineEl.textContent = "Florida Man is being chaotic right now.";
  }
});