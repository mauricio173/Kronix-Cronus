const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const db = require("./db");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
(async () => {
  const password = await ask(
    "Crie uma senha administrativa (mínimo 12 caracteres): ",
  );
  if (password.length < 12) {
    console.error("A senha precisa ter pelo menos 12 caracteres.");
    process.exitCode = 1;
    rl.close();
    return;
  }
  const secret = crypto.randomBytes(48).toString("hex");
  const hash = crypto.scryptSync(password, secret, 64).toString("hex");
  const envPath = path.join(__dirname, "..", ".env");
  let current = "";
  if (fs.existsSync(envPath)) current = fs.readFileSync(envPath, "utf8");
  const set = (text, key, value) => {
    const line = new RegExp(`^${key}=.*$`, "m");
    return line.test(text)
      ? text.replace(line, `${key}=${value}`)
      : `${text.trimEnd()}\n${key}=${value}\n`;
  };
  let env =
    current ||
    fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  env = set(env, "ADMIN_PASSWORD_HASH", hash);
  env = set(env, "SESSION_SECRET", secret);
  if (!/^BASE_URL=/m.test(env)) env += "\nBASE_URL=http://localhost:3000\n";
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  db.prepare("DELETE FROM sessions").run();
  console.log(
    `\nAdministrador inicial configurado em ${envPath}. Guarde sua senha em local seguro. Não compartilhe o arquivo .env.`,
  );
  rl.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  rl.close();
});
