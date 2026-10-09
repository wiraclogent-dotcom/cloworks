import { PrismaClient } from "@prisma/client";
import { CLOGENT_WORKSPACE_ID, makeScoped } from "../src/lib/db";
import { seed } from "./seedCore";

const client = new PrismaClient();
seed(makeScoped(client, CLOGENT_WORKSPACE_ID))
  .then(() => console.log("Seed complete"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.$disconnect());
