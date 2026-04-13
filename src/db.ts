import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Admin } from "./models/Admin";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/tlogic";

console.log(MONGO_URI, "MONGO_URI");
export async function connectDB() {
  await mongoose.connect(MONGO_URI, {
    authSource: "admin",
  });
  console.log("✅ MongoDB connected");
  await seedAdmin();
}

async function seedAdmin() {
  const passwordHash = await bcrypt.hash("tLogic@2025", 10);
  await Admin.findOneAndUpdate(
    {},
    { username: "tlogic-admin", passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log("✅ Admin credentials set: tlogic-admin / tLogic@2025");
}
