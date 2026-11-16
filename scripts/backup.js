import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import env from '../src/config/env.js';
import { createStoragePaths } from '../src/config/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDirectory = path.join(SERVER_ROOT, 'backups', timestamp);

async function main() {
  const storagePaths = createStoragePaths();

  await mkdir(path.join(backupDirectory, 'mongodb'), { recursive: true });
  await connectDatabase(env.mongodbUri);

  try {
    const database = mongoose.connection.db;
    const collections = await database.listCollections().toArray();
    const manifest = {
      createdAt: new Date().toISOString(),
      database: database.databaseName,
      collections: [],
    };

    for (const collectionInfo of collections) {
      const documents = await database.collection(collectionInfo.name).find({}).toArray();
      const fileName = `${collectionInfo.name.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

      await writeFile(
        path.join(backupDirectory, 'mongodb', fileName),
        JSON.stringify(documents, null, 2),
        'utf8',
      );

      manifest.collections.push({
        name: collectionInfo.name,
        documents: documents.length,
        fileName,
      });
    }

    await writeFile(
      path.join(backupDirectory, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    await cp(storagePaths.root, path.join(backupDirectory, 'storage'), {
      recursive: true,
      force: true,
    });

    console.log(`✓ Backup lógico generado en ${backupDirectory}`);
    console.log(`  ${manifest.collections.length} colecciones y storage/media + storage/logos.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
