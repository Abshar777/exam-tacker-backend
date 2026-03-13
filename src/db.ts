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
  const count = await Admin.countDocuments();
  if (count === 0) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await Admin.create({ username: "admin", passwordHash });
    console.log("✅ Default admin created: admin / admin123");
  }
}
