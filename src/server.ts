import app from "./app";
import config from "./app/config";
import { deleteUnverifiedDoctors } from "./app/lib/cron";
import { transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import { redisClient } from "./app/lib/redits";
import {
  seedRosterDoctors,
  seedSuperAdmon,
  seedTesterAdmin,
  seedTesterDoctor,
} from "./app/utils/seed";

const PORT = config.port;

const connectServices = async () => {
  await prisma.$connect();
  console.log("Connected to the database successfully.");

  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("Redis Connected Successfully");
  }

  await seedSuperAdmon();
  await seedTesterAdmin();
  await seedTesterDoctor();
  await seedRosterDoctors();
};

const isVercel = process.env.VERCEL === "1";

if (isVercel) {
  await connectServices();
} else {
  const main = async () => {
    try {
      await connectServices();

      await transporter.verify();
      console.log("NodeMailer connected successfully");

      await deleteUnverifiedDoctors();

      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    } catch (error) {
      console.error("Error starting the server:", error);
      await prisma.$disconnect();
      process.exit(1);
    }
  };

  void main();
}

export default app;
