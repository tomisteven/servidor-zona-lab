import mongoose from 'mongoose';

const CONNECTION_STATES = new Map([
  [0, 'disconnected'],
  [1, 'connected'],
  [2, 'connecting'],
  [3, 'disconnecting'],
]);

const SERVER_SELECTION_TIMEOUT_MS = 10_000;

mongoose.set('strictQuery', true);

export async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}

export function getDatabaseStatus() {
  return CONNECTION_STATES.get(mongoose.connection.readyState) ?? 'unknown';
}
