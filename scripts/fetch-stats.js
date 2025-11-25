import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'GitHub-Download-Tracker',
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
  });
}

async function fetchAllReleases(owner, repo) {
  let allReleases = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
    const releases = await httpsRequest(url);

    if (releases.length === 0) break;

    allReleases = allReleases.concat(releases);
    console.log(`  Fetched ${releases.length} releases (page ${page})`);

    if (releases.length < perPage) break;
    page++;
  }

  return allReleases;
}

async function fetchReleaseStats(owner, repo) {
  console.log(`Fetching releases for ${owner}/${repo}...`);

  const releases = await fetchAllReleases(owner, repo);
  console.log(`Total releases found: ${releases.length}`);

  let total = 0;
  const formatMap = new Map();

  for (const release of releases) {
    for (const asset of release.assets) {
      total += asset.download_count;

      // Extract file extension
      const ext = asset.name.includes('.')
        ? '.' + asset.name.split('.').pop().toLowerCase()
        : 'no-ext';

      if (!formatMap.has(ext)) {
        formatMap.set(ext, 0);
      }
      formatMap.set(ext, formatMap.get(ext) + asset.download_count);
    }
  }

  const formats = Array.from(formatMap.entries())
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count);

  return { total, formats };
}

async function fetchTrafficClones(owner, repo) {
  try {
    console.log(`Fetching traffic clones for ${owner}/${repo}...`);
    const data = await httpsRequest(
      `https://api.github.com/repos/${owner}/${repo}/traffic/clones`
    );
    return data.clones || [];
  } catch (error) {
    console.log(`Unable to fetch traffic clones (this is normal for public repos without admin access)`);
    return [];
  }
}

async function processRepo(repoString) {
  const [owner, repo] = repoString.split('/');
  const fileName = `${owner}_${repo}.json`;
  const filePath = path.join(DATA_DIR, fileName);

  // Load existing data
  let history = [];
  if (fs.existsSync(filePath)) {
    history = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  // Fetch current stats
  const stats = await fetchReleaseStats(owner, repo);
  const today = new Date().toISOString().split('T')[0];

  // Check if we already have data for today
  const existingIndex = history.findIndex(entry => entry.date === today);

  if (existingIndex >= 0) {
    // Update existing entry
    history[existingIndex] = {
      date: today,
      total: stats.total,
      formats: stats.formats
    };
  } else {
    // Add new entry
    history.push({
      date: today,
      total: stats.total,
      formats: stats.formats
    });

    // On first run, try to get traffic clones
    if (history.length === 1) {
      const clones = await fetchTrafficClones(owner, repo);
      if (clones.length > 0) {
        // Add historical clone data (last 14 days)
        const cloneHistory = clones.map(c => ({
          date: c.timestamp.split('T')[0],
          total: c.count,
          formats: [{ ext: 'clones', count: c.count }]
        }));
        history = [...cloneHistory, ...history];
      }
    }
  }

  // Sort by date
  history.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Save data
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));

  console.log(`✓ Updated ${owner}/${repo}: ${stats.total} total downloads`);
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.warn('⚠️  Warning: GITHUB_TOKEN not set. API rate limit: 60 requests/hour');
    console.warn('   Set GITHUB_TOKEN for 5000 requests/hour\n');
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  for (const repo of config.repos) {
    try {
      await processRepo(repo);
    } catch (error) {
      console.error(`Error processing ${repo}:`, error.message);
    }
  }

  console.log('\n✓ All repositories processed');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
