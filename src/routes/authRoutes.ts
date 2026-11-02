import { Router } from "express";
import { authenticateUser, issueToken, registerUser } from "../auth/authService.js";
import { requireAuth } from "../auth/authMiddleware.js";
import { listBands } from "../services/bandService.js";
import { validateRequest } from "../security/validateRequest.js";
import { loginSchema, registerSchema } from "../security/schemas.js";

/** Rotas públicas de cadastro e login e rota autenticada de perfil. */
export const authRoutes = Router();

authRoutes.post("/register", validateRequest("body", registerSchema), async (req, res) => {
  try {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email e password são obrigatórios." });
      return;
    }
    const user = await registerUser(name, email, password);
    res.status(201).json({ success: true, user, token: issueToken(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao registrar.";
    res.status(message.includes("duplicate key") ? 409 : 400).json({
      success: false,
      error: {
        code: message.includes("duplicate key") ? "CONFLICT" : "BAD_REQUEST",
        message: message.includes("duplicate key") ? "E-mail já cadastrado." : message,
      },
    });
  }
});

authRoutes.post("/login", validateRequest("body", loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email e password são obrigatórios." });
      return;
    }
    const user = await authenticateUser(email, password);
    if (!user) {
      res.status(401).json({ error: "E-mail ou senha inválidos." });
      return;
    }
    res.json({ success: true, user, token: issueToken(user) });
  } catch (error) {
    throw error;
  }
});

authRoutes.get("/me", requireAuth, async (req, res) => {
  const user = req.user ?? null;
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  try {
    res.json({ user, bands: await listBands(user.id) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Erro interno." });
  }
});
