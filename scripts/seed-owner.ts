import "dotenv/config";
import { seedOwnerPassword } from "../src/auth/authService.js";

const email = process.env.LEGACY_OWNER_EMAIL;
const password = process.env.OWNER_INITIAL_PASSWORD;
if (!email || !password) {
  console.error("Defina LEGACY_OWNER_EMAIL e OWNER_INITIAL_PASSWORD no .env.");
  process.exit(1);
}
await seedOwnerPassword(email,password);
console.log(`Senha inicial atualizada para a conta administradora ${email}.`);
