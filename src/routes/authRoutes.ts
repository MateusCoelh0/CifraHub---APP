import { Router } from "express";
import { authenticateUser, findUserById, issueToken, registerUser } from "../auth/authService.js";
import { requireAuth } from "../auth/authMiddleware.js";
import { listBands } from "../services/bandService.js";

export const authRoutes = Router();

authRoutes.post("/register", async (req,res) => {
  try {
    const { name,email,password } = req.body as { name?: string;email?: string;password?: string };
    if (!name || !email || !password) { res.status(400).json({ error:"name, email e password são obrigatórios." }); return; }
    const user = await registerUser(name,email,password);
    res.status(201).json({ user, token:issueToken(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao registrar.";
    res.status(message.includes("duplicate key") ? 409 : 400).json({ error:message.includes("duplicate key") ? "E-mail já cadastrado." : message });
  }
});

authRoutes.post("/login", async (req,res) => {
  try {
    const { email,password } = req.body as { email?: string;password?: string };
    if (!email || !password) { res.status(400).json({ error:"email e password são obrigatórios." }); return; }
    const user = await authenticateUser(email,password);
    if (!user) { res.status(401).json({ error:"E-mail ou senha inválidos." }); return; }
    res.json({ user, token:issueToken(user) });
  } catch (error) { res.status(500).json({ error:error instanceof Error ? error.message : "Falha no login." }); }
});

authRoutes.get("/me", requireAuth, async (req,res) => {
  const user = req.user ?? null;
  if (!user) { res.status(401).json({ error:"Usuário não encontrado." }); return; }
  try { res.json({ user, bands:await listBands(user.id) }); }
  catch(error) { res.status(500).json({error:error instanceof Error ? error.message : "Erro interno."}); }
});
