
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const username = "subhranilsahu";

let token = process.env.GITHUB_TOKEN;

if (!token) {
  try {
    token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8"
    }).trim();
  } catch {
    throw new Error("Set GITHUB_TOKEN or login using gh auth login");
  }
}

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
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    query,
    variables: { login: username }
  })
});

if (!response.ok) {
  throw new Error(`GitHub API error: ${response.status}`);
}

const result = await response.json();

if (result.errors) {
  throw new Error(JSON.stringify(result.errors));
}

const calendar =
  result.data.user.contributionsCollection.contributionCalendar;

const levelMap = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4
};

const days = calendar.weeks.flatMap(week =>
  week.contributionDays.map(day => ({
    date: day.date,
    contributionCount: day.contributionCount,
    contributionLevel: levelMap[day.contributionLevel]
  }))
);

const data = {
  username,
  startDate: days[0]?.date ?? null,
  totalContributions: calendar.totalContributions,
  days
};

await mkdir("data", { recursive: true });
await mkdir("assets", { recursive: true });

await writeFile(
  "data/github.json",
  JSON.stringify(data, null, 2)
);

const colors = [
  "#161b22",
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353"
];

const cell = 11;
const gap = 3;
const step = cell + gap;
const left = 45;
const top = 38;

const width = left + 53 * step + 5;
const height = top + 7 * step + 25;

const months = [];
let previousMonth = "";

days.forEach((day, index) => {
  const date = new Date(day.date + "T00:00:00Z");
  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC"
  });

  const week = Math.floor(index / 7);

  if (month !== previousMonth && (index % 7 === 0 || index < 7)) {
    months.push(
      `<text x="${left + week * step}" y="20">${month}</text>`
    );
    previousMonth = month;
  }
});

const cells = days.map((day, index) => {
  const date = new Date(day.date + "T00:00:00Z");
  const week = Math.floor(index / 7);
  const weekday = date.getUTCDay();
  const level = day.contributionLevel;

  return `
    <rect
      class="day"
      x="${left + week * step}"
      y="${top + weekday * step}"
      width="${cell}"
      height="${cell}"
      rx="2"
      fill="${colors[level]}"
      style="--delay:${index * 5}ms"
    >
      <title>${day.contributionCount} contributions on ${day.date}</title>
    </rect>
  `;
}).join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="100%"
     viewBox="0 0 ${width} ${height}">

<style>
  text {
    font: 11px Arial, sans-serif;
    fill: #8b949e;
  }

  .day {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: drop .5s ease forwards;
    animation-delay: var(--delay);
  }

  @keyframes drop {
    0% {
      opacity: 0;
      transform: translateY(-15px) scale(.7);
    }
    75% {
      opacity: 1;
      transform: translateY(2px) scale(1.08);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .day {
      animation: none;
      opacity: 1;
    }
  }
</style>

<text x="${left}" y="12"
      style="font-size:13px;font-weight:bold;fill:#e6edf3">
  ${calendar.totalContributions.toLocaleString()} contributions
</text>

${months.join("")}

${[1, 3, 5].map(day => `
  <text x="0" y="${top + day * step + 9}">
    ${["Mon", "Wed", "Fri"][[1,3,5].indexOf(day)]}
  </text>
`).join("")}

${cells}

</svg>
`;

await writeFile("assets/github-contributions.svg", svg);

console.log("Contribution graph updated successfully!");
