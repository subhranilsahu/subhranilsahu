#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME || "subhranilsahu";
const token = process.env.GITHUB_TOKEN || (() => {
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Set GITHUB_TOKEN or sign in with the GitHub CLI (gh auth login).");
  }
})();

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "subhranilsahu-contribution-graph"
  },
  body: JSON.stringify({ query, variables: { login: username } })
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: HTTP ${response.status} ${await response.text()}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map(error => error.message).join("\\n"));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) throw new Error(`Could not find contribution calendar for GitHub user "${username}".`);

const weeks = calendar.weeks.map(week => week.contributionDays.map(day => ({
  date: day.date,
  contributionCount: day.contributionCount,
  contributionLevel: day.contributionLevel,
  level: ({
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4
  })[day.contributionLevel] ?? 0
})));

const data = {
  username,
  startDate: weeks[0]?.[0]?.date ?? null,
  totalContributions: calendar.totalContributions,
  weeks
};

await mkdir("data", { recursive: true });
await mkdir("assets", { recursive: true });
await writeFile("data/github.json", JSON.stringify(data, null, 2) + "\\n");

const colors = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
const cell = 10;
const gap = 3;
const step = cell + gap;
const left = 28;
const top = 34;
const graphWidth = left + weeks.length * step + 8;
const graphHeight = 132;
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const monthLabels = [];
let lastMonth = "";
weeks.forEach((week, index) => {
  const date = week[0]?.date;
  if (!date) return;
  const month = new Date(date + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" });
  const key = date.slice(0, 7);
  if (key !== lastMonth) {
    monthLabels.push(`<text x="${left + index * step}" y="19" class="muted">${month}</text>`);
    lastMonth = key;
  }
});

const dayLabels = [
  `<text x="0" y="${top + step * 1 + 9}" class="muted">Mon</text>`,
  `<text x="0" y="${top + step * 3 + 9}" class="muted">Wed</text>`,
  `<text x="0" y="${top + step * 5 + 9}" class="muted">Fri</text>`
];

let cells = "";
let index = 0;
weeks.forEach((week, weekIndex) => {
  week.forEach((day, dayIndex) => {
    const x = left + weekIndex * step;
    const y = top + dayIndex * step;
    const delay = (weekIndex * 7 + dayIndex) * 12;
    cells += `
      <g>
        <title>${esc(day.date)}: ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}</title>
        <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${colors[day.level]}">
          <animate attributeName="opacity" values="0;1" dur="0.35s" begin="${delay}ms" fill="freeze" />
          <animateTransform attributeName="transform" type="translate" values="0 -7;0 0" dur="0.35s" begin="${delay}ms" fill="freeze" />
        </rect>
      </g>`;
    index++;
  });
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${graphWidth}" height="${graphHeight}" viewBox="0 0 ${graphWidth} ${graphHeight}" role="img" aria-label="${calendar.totalContributions} GitHub contributions in the last year">
  <title>${calendar.totalContributions} contributions in the last year</title>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10px; }
    .muted { fill: #8b949e; }
    @media (prefers-reduced-motion: reduce) {
      animate, animateTransform { display: none; }
    }
  </style>
  <text x="0" y="15" font-size="13" font-weight="600" fill="#c9d1d9">${calendar.totalContributions} contributions in the last year</text>
  ${monthLabels.join("")}
  ${dayLabels.join("")}
  ${cells}
  <g transform="translate(${Math.max(left, graphWidth - 126)} 122)">
    <text x="-28" y="9" class="muted">Less</text>
    ${colors.map((color, i) => `<rect x="${i * 13}" y="0" width="10" height="10" rx="2" fill="${color}" />`).join("")}
    <text x="77" y="9" class="muted">More</text>
  </g>
</svg>
`;

await writeFile("assets/contributions.svg", svg);
console.log(`Updated ${username}'s contribution data: ${calendar.totalContributions} contributions.`);
