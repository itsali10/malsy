/**
 * Restores files from Cursor Local History ONLY under this GradGame folder.
 * Run: node tools/restore-from-cursor-history.js
 */
const fs = require('fs');
const path = require('path');

const HISTORY = path.join(process.env.APPDATA || '', 'Cursor', 'User', 'History');
const DEST_ROOT = path.resolve(__dirname, '..');
const ALLOW_PREFIX = DEST_ROOT.toLowerCase();

function decodeResource(resource) {
    const u = resource.replace(/^file:\/\//, '');
    const decoded = decodeURIComponent(u);
    if (/^\/[a-zA-Z]:\//.test(decoded)) {
        return path.normalize(decoded.slice(1).replace(/\//g, path.sep));
    }
    return path.normalize(decoded.replace(/\//g, path.sep));
}

function main() {
    if (!fs.existsSync(HISTORY)) {
        console.error('Cursor History not found:', HISTORY);
        process.exit(1);
    }

    const dirs = fs.readdirSync(HISTORY, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(HISTORY, d.name));

    /** @type {Map<string, { src: string, ts: number }>} */
    const best = new Map();

    for (const dir of dirs) {
        const ej = path.join(dir, 'entries.json');
        if (!fs.existsSync(ej)) continue;
        let data;
        try {
            data = JSON.parse(fs.readFileSync(ej, 'utf8'));
        } catch {
            continue;
        }
        const dest = decodeResource(data.resource || '');
        if (!dest.toLowerCase().startsWith(ALLOW_PREFIX)) continue;
        if (!data.entries || !data.entries.length) continue;
        const latest = data.entries.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
        const src = path.join(dir, latest.id);
        if (!fs.existsSync(src)) continue;
        const prev = best.get(dest);
        if (!prev || latest.timestamp > prev.ts) {
            best.set(dest, { src, ts: latest.timestamp });
        }
    }

    let n = 0;
    for (const [dest, { src, ts }] of best) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        console.log('Restored', path.relative(DEST_ROOT, dest));
        n++;
    }
    console.log('Done,', n, 'files under', DEST_ROOT);
}

main();
