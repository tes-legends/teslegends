const fs = require('fs');
const path = require('path');

const distFolder = path.join(__dirname, '../dist/bacon');
const indexPath = path.join(distFolder, 'index.html');
const notFoundPath = path.join(distFolder, '404.html');

if (!fs.existsSync(indexPath)) {
  console.error('❌ index.html not found:', indexPath);
  process.exit(1);
}

// Read index.html
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// --- Script that restores deep link (goes in BOTH files) ---
const restoreScript = `
<script>
(function () {
  const redirect = sessionStorage.getItem('redirect');
  if (redirect) {
    sessionStorage.removeItem('redirect');
    history.replaceState(null, null, redirect);
  }
})();
</script>
`;

// --- Script that captures deep link (404 ONLY) ---
const captureScript = `
<script>
sessionStorage.setItem(
  'redirect',
  location.pathname + location.search + location.hash
);
location.replace('/');
</script>
`;

// Inject restore script before </body> if not present
function injectRestore(html) {
  if (html.includes('sessionStorage.getItem(\'redirect\')')) {
    return html;
  }
  return html.replace('</body>', restoreScript + '\n</body>');
}

// Build index.html
indexHtml = injectRestore(indexHtml);
fs.writeFileSync(indexPath, indexHtml, 'utf8');

// Build 404.html
let notFoundHtml = injectRestore(indexHtml);
notFoundHtml = notFoundHtml.replace('</body>', captureScript + '\n</body>');

fs.writeFileSync(notFoundPath, notFoundHtml, 'utf8');

console.log('✅ GitHub Pages SPA routing fix applied');
