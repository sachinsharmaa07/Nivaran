import mongoose from "mongoose";
import fs from "node:fs";

let connectionPromise: Promise<typeof mongoose> | null = null;

export function getMongoUri(): string {
  const isTest = process.env["NODE_ENV"] === "test" || Boolean(process.env["VITEST"]);
  const raw =
    process.env["MONGO_URI"] ??
    (isTest
      ? "mongodb://localhost:27017/nivaran_test?directConnection=true"
      : "mongodb://localhost:27017/nivaran?replicaSet=rs0");

  if (isTest) {
    const lc = raw.toLowerCase();
    if (lc.includes("/nivaran") && !lc.includes("/nivaran_test")) {
      throw new Error(
        `[TEST SAFETY] Mongo URI points at the dev database ('nivaran'). ` +
          `Tests must use 'nivaran_test'. Refusing to run.`
      );
    }
  }

  const inDocker = Boolean(process.env["IN_DOCKER"]) || fs.existsSync("/.dockerenv");
  if (!inDocker) {
    let uri = raw;
    if (uri.includes("//mongo:")) {
      uri = uri.replace("//mongo:", "//localhost:");
    }
    try {
      const u = new URL(uri);
      u.searchParams.delete("replicaSet");
      u.searchParams.set("directConnection", "true");
      return u.toString();
    } catch {
      if (uri.includes("replicaSet=")) {
        uri = uri.replace(/replicaSet=[^&]+/, "directConnection=true");
      } else if (!uri.includes("directConnection=true")) {
        uri += (uri.includes("?") ? "&" : "?") + "directConnection=true";
      }
      return uri;
    }
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
  connectionPromise = null;
  await mongoose.disconnect();
}

export { mongoose };
