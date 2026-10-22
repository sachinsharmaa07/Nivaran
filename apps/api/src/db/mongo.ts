import mongoose from "mongoose";
import fs from "node:fs";

let connectionPromise: Promise<typeof mongoose> | null = null;

export function getMongoUri(): string {
  const raw = process.env["MONGO_URI"] ?? "mongodb://localhost:27017/nivaran?replicaSet=rs0";
  const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
  if (!inDocker) {
    let uri = raw;
    if (uri.includes("//mongo:")) {
      uri = uri.replace("//mongo:", "//localhost:");
    }
    if (uri.includes("replicaSet=") && !uri.includes("directConnection=true")) {
      uri = uri.replace(/replicaSet=[^&]+/, "directConnection=true");
    } else if (!uri.includes("directConnection=true")) {
      uri += (uri.includes("?") ? "&" : "?") + "directConnection=true";
    }
    return uri;
  }
  return raw;
}

export function connectMongo(): Promise<typeof mongoose> {
  if (!connectionPromise) {
    const uri = getMongoUri();
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
  }
  return connectionPromise;
}

export async function disconnectMongo(): Promise<void> {
  if (connectionPromise) {
    await mongoose.disconnect();
    connectionPromise = null;
  }
}

export { mongoose };
