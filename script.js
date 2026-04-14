// ============================================
// 🔑 MEDIASTACK API KEY (Get from https://mediastack.com/)
// ============================================
const MEDIASTACK_API_KEY = "5ca5b9750c69918840bf5688c1cccf8e";
// ============================================

function populateYears() {
  const yearEl = document.getElementById('year');
  const currentYear = new Date().getFullYear();
  for (let y = 2000; y <= currentYear; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearEl.appendChild(opt);
  }
}

function populateDays() {
  const year = document.getElementById('year').value;
  const month = document.getElementById('month').value;
  const daysInMonth = new Date(year, new Date(month + ' 1').getMonth() + 1, 0).getDate();
  const dayEl = document.getElementById('day');
  const current = parseInt(dayEl.value) || 1;
  dayEl.innerHTML = '';
  for (let i = 1; i <= daysInMonth; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    if (i === current) opt.selected = true;
    dayEl.appendChild(opt);
  }
}

document.getElementById('year').addEventListener('change', populateDays);
document.getElementById('month').addEventListener('change', populateDays);
populateYears();
populateDays();

async function search() {
  const year = document.getElementById('year').value;
  const month = document.getElementById('month').value;
  const day = document.getElementById('day').value;
  const resultEl = document.getElementById('result');

  resultEl.innerHTML = '<p>Loading...</p>';

  // Convert month name to search-friendly format
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthIndex = monthNames.indexOf(month) + 1;
  const dateStr = `${year}-${monthIndex.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  // Mediastack API - search with date filter
  const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_API_KEY}&keywords=florida man&date=${dateStr}&languages=en`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      resultEl.innerHTML = `<p>Error: ${data.error.message}</p>`;
      return;
    }

    if (!data.data || data.data.length === 0) {
      resultEl.innerHTML = `<p>No articles found for "florida man" on ${month} ${day}, ${year}.</p>`;
      return;
    }

    // Pick the first article
    const article = data.data[0];
    const headline = article.title;
    const source = article.source;
    const pubDate = new Date(article.published_at).toLocaleDateString();
    const description = article.description || 'No description available.';
    const articleUrl = article.url;
    resultEl.innerHTML = `
      <h3>${headline}</h3>
      <p><strong>Description:</strong> ${description}</p>
      <p><small>Source: ${source} | Date: ${pubDate}</small></p>
      <p><a href="${articleUrl}" target="_blank">Read full article</a></p>
    `;

  } catch (err) {
    resultEl.innerHTML = `<p>Something went wrong: ${err.message}</p>`;
  }
}