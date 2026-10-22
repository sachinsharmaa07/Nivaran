import { afterAll } from "vitest";
import { closePools } from "../db/config.js";
import { disconnectMongo } from "../db/mongo.js";

afterAll(async () => {
  await disconnectMongo();
  await closePools();
});
