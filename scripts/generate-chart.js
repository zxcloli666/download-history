import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DOCS_DIR = path.join(__dirname, '..', 'docs');

const WIDTH = 800;
const HEIGHT = 400;
const PADDING = { top: 55, right: 40, bottom: 60, left: 60 };
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right;
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

function generateSVG(owner, repo, data) {
  if (data.length === 0) {
    return generateEmptySVG(owner, repo);
  }

  const values = data.map(d => d.total);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values);
  const valueRange = maxValue - minValue || 1;

  // Calculate points for the line
  const points = data.map((d, i) => {
    const x = PADDING.left + (i / (data.length - 1 || 1)) * CHART_WIDTH;
    const y = PADDING.top + CHART_HEIGHT - ((d.total - minValue) / valueRange) * CHART_HEIGHT;
    return { x, y, value: d.total, date: d.date };
  });

  // Create path for the line
  const linePath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  ).join(' ');

  // Create path for gradient fill
  const areaPath = `
    M ${PADDING.left} ${PADDING.top + CHART_HEIGHT}
    ${points.map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
    L ${PADDING.left + CHART_WIDTH} ${PADDING.top + CHART_HEIGHT}
    Z
  `.trim();

  // Y-axis labels (5 ticks)
  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const value = minValue + (valueRange * i / 4);
    const y = PADDING.top + CHART_HEIGHT - (i / 4) * CHART_HEIGHT;
    yTicks.push({ y, label: formatNumber(Math.round(value)) });
  }

  // X-axis labels (show max 8 dates)
  const xTicks = [];
  const step = Math.max(1, Math.floor(data.length / 8));
  for (let i = 0; i < data.length; i += step) {
    const point = points[i];
    xTicks.push({ x: point.x, label: formatDate(data[i].date) });
  }
  // Always include the last point
  if (data.length > 1 && (data.length - 1) % step !== 0) {
    const lastPoint = points[points.length - 1];
    xTicks.push({ x: lastPoint.x, label: formatDate(data[data.length - 1].date) });
  }

  const currentTotal = values[values.length - 1];
  const previousTotal = values.length > 1 ? values[values.length - 2] : currentTotal;
  const change = currentTotal - previousTotal;
  const changePercent = previousTotal > 0 ? ((change / previousTotal) * 100).toFixed(1) : 0;
  const changeSign = change >= 0 ? '+' : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradient for area fill -->
    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0.05" />
    </linearGradient>

    <!-- Glow filter for line -->
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Animation -->
    <style>
      @keyframes draw {
        from { stroke-dashoffset: 2000; }
        to { stroke-dashoffset: 0; }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .line-path {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: draw 1.5s ease-out forwards;
      }
      .area-path {
        opacity: 0;
        animation: fadeIn 1s ease-out 0.5s forwards;
      }
      .data-point {
        opacity: 0;
        animation: fadeIn 0.5s ease-out 1s forwards;
      }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0d1117" rx="8"/>

  <!-- Title -->
  <text x="${WIDTH / 2}" y="25" text-anchor="middle" fill="#c9d1d9" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600">
    ${owner}/${repo} Downloads
  </text>

  <!-- Stats -->
  <text x="${WIDTH - 20}" y="25" text-anchor="end" fill="#58a6ff" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">
    ${formatNumber(currentTotal)} total
  </text>
  <text x="${WIDTH - 20}" y="42" text-anchor="end" fill="${change >= 0 ? '#3fb950' : '#f85149'}" font-family="system-ui, -apple-system, sans-serif" font-size="12">
    ${changeSign}${formatNumber(change)} (${changeSign}${changePercent}%)
  </text>

  <!-- Grid lines -->
  <g opacity="0.1">
    ${yTicks.map(tick => `
      <line x1="${PADDING.left}" y1="${tick.y}" x2="${PADDING.left + CHART_WIDTH}" y2="${tick.y}"
            stroke="#c9d1d9" stroke-width="1"/>
    `).join('')}
  </g>

  <!-- Y-axis labels -->
  ${yTicks.map(tick => `
    <text x="${PADDING.left - 10}" y="${tick.y + 4}" text-anchor="end"
          fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="11">
      ${tick.label}
    </text>
  `).join('')}

  <!-- X-axis labels -->
  ${xTicks.map(tick => `
    <text x="${tick.x}" y="${PADDING.top + CHART_HEIGHT + 20}" text-anchor="middle"
          fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="11">
      ${tick.label}
    </text>
  `).join('')}

  <!-- Area under line -->
  <path d="${areaPath}" fill="url(#areaGradient)" class="area-path"/>

  <!-- Main line with glow -->
  <path d="${linePath}" fill="none" stroke="#3b82f6" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" class="line-path"/>

  <!-- Data points -->
  ${points.map(p => `
    <circle cx="${p.x}" cy="${p.y}" r="4" fill="#3b82f6" stroke="#0d1117" stroke-width="2" class="data-point"/>
  `).join('')}

  <!-- Axis lines -->
  <line x1="${PADDING.left}" y1="${PADDING.top}" x2="${PADDING.left}" y2="${PADDING.top + CHART_HEIGHT}"
        stroke="#30363d" stroke-width="2"/>
  <line x1="${PADDING.left}" y1="${PADDING.top + CHART_HEIGHT}" x2="${PADDING.left + CHART_WIDTH}" y2="${PADDING.top + CHART_HEIGHT}"
        stroke="#30363d" stroke-width="2"/>
</svg>`;
}

function generateEmptySVG(owner, repo) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0d1117" rx="8"/>
  <text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" fill="#8b949e"
        font-family="system-ui, -apple-system, sans-serif" font-size="16">
    ${owner}/${repo} - No data yet
  </text>
</svg>`;
}

function generateChart(repoString) {
  const [owner, repo] = repoString.split('/');
  const dataFile = path.join(DATA_DIR, `${owner}_${repo}.json`);
  const outputFile = path.join(DOCS_DIR, `${owner}_${repo}.svg`);

  let data = [];
  if (fs.existsSync(dataFile)) {
    data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  }

  const svg = generateSVG(owner, repo, data);

  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  fs.writeFileSync(outputFile, svg);
  console.log(`✓ Generated chart for ${owner}/${repo}`);
}

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  for (const repo of config.repos) {
    generateChart(repo);
  }

  // Copy config.json to docs/ for GitHub Pages (symlinks don't work on Pages)
  const docsConfigPath = path.join(DOCS_DIR, 'config.json');
  fs.writeFileSync(docsConfigPath, JSON.stringify(config, null, 2));
  console.log('✓ Copied config.json to docs/');

  console.log('\n✓ All charts generated');
}

main();
