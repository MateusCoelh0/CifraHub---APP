import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { PoolClient } from "pg";
import { pool } from "../db/repository.js";

/** Campos públicos da identidade reconhecida pelo backend. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}
/** Campos de identidade extraídos de um JWT validado. */
export interface TokenPayload {
  sub: string;
  email: string;
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32)
    throw new Error("JWT_SECRET precisa ter pelo menos 32 caracteres.");
  return value;
}
export function assertAuthConfiguration(): void {
  secret();
}

/** Emite um JWT de curta duração para a identidade autenticada.
 * @param user Conta que receberá o token.
 * @returns Token assinado para uso na API e no WebSocket.
 */
export function issueToken(user: AuthUser): string {
  return jwt.sign({ email: user.email }, secret(), { subject: user.id, expiresIn: "12h" });
}

/** Valida assinatura, expiração e campos mínimos do JWT.
 * @param token Token recebido no cabeçalho ou handshake WebSocket.
 * @returns Identidade declarada no token.
 * @throws Erro quando o token é inválido ou expirou.
 */
export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, secret());
  if (typeof payload === "string" || !payload.sub || typeof payload.email !== "string")
    throw new Error("Token inválido.");
  return { sub: payload.sub, email: payload.email };
}

/** Cria uma conta com senha armazenada por hash bcrypt.
 * @param name Nome público da conta.
 * @param email E-mail único normalizado.
 * @param password Senha em texto recebida apenas durante a operação.
 * @returns Dados públicos da nova conta.
 * @throws Erro para dados inválidos, e-mail duplicado ou falha no banco.
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  if (!pool) throw new Error("Banco PostgreSQL indisponível.");
  const normalized = email.trim().toLowerCase();
  if (!name.trim() || !/^\S+@\S+\.\S+$/.test(normalized) || password.length < 10)
    throw new Error("Informe nome, e-mail válido e senha com pelo menos 10 caracteres.");
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'INSERT INTO users (display_name,email,password_hash) VALUES ($1,$2,$3) RETURNING id::text,email,display_name AS "displayName"',
    [name.trim(), normalized, hash],
  );
  return rows[0] as AuthUser;
}

/** Confere as credenciais sem revelar se o e-mail está cadastrado.
 * @param email E-mail informado no login.
 * @param password Senha informada no login.
 * @returns Conta autenticada ou null para credenciais incorretas.
 */
export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  if (!pool) throw new Error("Banco PostgreSQL indisponível.");
  const { rows } = await pool.query(
    'SELECT id::text,email,display_name AS "displayName",password_hash FROM users WHERE lower(email)=lower($1)',
    [email.trim()],
  );
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return null;
  return { id: rows[0].id, email: rows[0].email, displayName: rows[0].displayName };
}

/** Localiza os campos públicos de uma conta pelo identificador.
 * @param id Identificador UUID da conta.
 * @returns Conta pública ou null se não existir.
 */
export async function findUserById(id: string): Promise<AuthUser | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    'SELECT id::text,email,display_name AS "displayName" FROM users WHERE id=$1',
    [id],
  );
  return (rows[0] as AuthUser | undefined) ?? null;
}

export async function seedOwnerPassword(
  email: string,
  password: string,
  client?: PoolClient,
): Promise<void> {
  if (!pool) throw new Error("Banco PostgreSQL indisponível.");
  if (password.length < 10) throw new Error("A senha deve ter pelo menos 10 caracteres.");
  const hash = await bcrypt.hash(password, 12);
  await (client ?? pool).query("UPDATE users SET password_hash=$2 WHERE lower(email)=lower($1)", [
    email.trim(),
    hash,
  ]);
}
