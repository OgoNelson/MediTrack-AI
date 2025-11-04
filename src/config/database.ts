import mongoose from "mongoose";
import { logger } from "../utils/logger";

const connectDatabase = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string, {
      serverSelectionTimeoutMS: 5000, // optional but helpful for quick failure
    });

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error('❌ Failed to connect to MongoDB');
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info("✅ Disconnected from MongoDB");
  } catch (error) {
    logger.error("❌ Error disconnecting from MongoDB:", error);
  }
};

// Graceful shutdown handler
export const setupDatabaseGracefulShutdown = (): void => {
  process.on("SIGINT", async () => {
    await disconnectDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

export default {
  connectDatabase,
  disconnectDatabase,
  setupDatabaseGracefulShutdown,
};
