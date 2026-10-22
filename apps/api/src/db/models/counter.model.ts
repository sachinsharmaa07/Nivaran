/**
 * Counter Mongoose model — atomic per-tenant issue counter for publicId generation
 */
import { Schema, model, type Document } from "mongoose";

export interface ICounter extends Document {
  tenantId: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    tenantId: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: false }
);

CounterSchema.index({ tenantId: 1 }, { unique: true });

export const Counter = model<ICounter>("Counter", CounterSchema);
