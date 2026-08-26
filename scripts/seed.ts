// CLI wrapper. The seed itself is a module so importing DEMO_KEYS cannot truncate a database.
import { seed } from "@/core/db/seed";

seed().then(() => process.exit(0)).catch((error) => {
  console.error("seed failed:", error);
  process.exit(1);
});
