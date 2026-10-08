import { PrismaClient } from "@prisma/client";
import { seed } from "./seedCore";

const db = new PrismaClient();
seed(db)
  .then(() => console.log("Seed complete"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
