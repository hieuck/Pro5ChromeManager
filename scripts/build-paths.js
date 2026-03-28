const fs = require('fs');
const path = require('path');

const SERVER_ENTRY_CANDIDATES = [
  path.join('dist', 'server', 'server', 'index.js'),
  path.join('dist', 'server', 'index.js'),
];

function resolveExistingServerEntry(projectRoot) {
  for (const relativePath of SERVER_ENTRY_CANDIDATES) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      return { relativePath, absolutePath };
    }
  }

  return {
    relativePath: SERVER_ENTRY_CANDIDATES[0],
    absolutePath: path.join(projectRoot, SERVER_ENTRY_CANDIDATES[0]),
  };
}

module.exports = {
  SERVER_ENTRY_CANDIDATES,
  resolveExistingServerEntry,
};
