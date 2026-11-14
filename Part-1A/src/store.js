'use strict';

const fs = require('node:fs');

let temporaryFileCounter = 0;

class StoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StoreError';
    this.cause = cause;
  }
}

function resolveDataFile() {
  return process.env.DEALS_FILE || './data/deals.json';
}

function parentDirectory(filePath) {
  const separatorIndex = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\'),
  );

  if (separatorIndex === -1) {
    return null;
  }

  if (separatorIndex === 0) {
    return filePath[0];
  }

  if (separatorIndex === 2 && filePath[1] === ':') {
    return filePath.slice(0, 3);
  }

  return filePath.slice(0, separatorIndex);
}

function ensureParentDirectory(filePath) {
  const directory = parentDirectory(filePath);
  if (!directory) {
    return;
  }

  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (error) {
    throw new StoreError('Unable to create the deals directory', error);
  }
}

function removeTemporaryFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new StoreError('Unable to remove a temporary deals file', error);
    }
  }
}

function writeDeals(deals) {
  if (!Array.isArray(deals)) {
    throw new TypeError('Deals must be an array');
  }

  const filePath = resolveDataFile();
  ensureParentDirectory(filePath);

  let serialized;
  try {
    serialized = `${JSON.stringify(deals, null, 2)}\n`;
  } catch (error) {
    throw new StoreError('Unable to serialize deals', error);
  }

  let temporaryPath;
  while (!temporaryPath) {
    const candidatePath =
      `${filePath}.${process.pid}.${Date.now()}.` +
      `${temporaryFileCounter++}.tmp`;

    try {
      fs.writeFileSync(candidatePath, serialized, {
        encoding: 'utf8',
        flag: 'wx',
      });
      temporaryPath = candidatePath;
    } catch (error) {
      if (error.code === 'EEXIST') {
        continue;
      }

      removeTemporaryFile(candidatePath);
      throw new StoreError('Unable to write the deals file', error);
    }
  }

  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    removeTemporaryFile(temporaryPath);
    throw new StoreError('Unable to replace the deals file', error);
  }
}

function readDeals() {
  const filePath = resolveDataFile();
  ensureParentDirectory(filePath);

  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      writeDeals([]);
      return [];
    }

    throw new StoreError('Unable to read the deals file', error);
  }

  let deals;
  try {
    deals = JSON.parse(contents);
  } catch (error) {
    throw new StoreError('The deals file contains invalid JSON', error);
  }

  if (!Array.isArray(deals)) {
    throw new StoreError('The deals file must contain a JSON array');
  }

  return deals;
}

module.exports = {
  StoreError,
  readDeals,
  resolveDataFile,
  writeDeals,
};
