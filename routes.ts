import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { z } from "zod";
import { insertUserSchema, insertProfileSchema, insertTournamentSchema, insertTransactionSchema } from "@shared/schema";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const signupSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
});

const tournamentSchema = z.object({
  title: z.string().min(1),
  game: z.string().min(1),
  entry_fee: z.string(),
  prize_pool: z.string(),
  max_players: z.number().min(1),
  description: z.string().optional(),
  banner_url: z.string().optional(),
});

const transactionSchema = z.object({
  type: z.enum(["deposit", "withdrawal", "win", "loss", "bonus"]),
  amount: z.string(),
  payment_id: z.string().optional(),
  payment_method: z.string().optional(),
  description: z.string().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, email, password } = signupSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
      });

      // Create profile
      const profile = await storage.createProfile({
        user_id: user.id,
        username,
        email,
        wallet_balance: "0.00",
        is_admin: false,
        is_owner: false,
      });

      // Create wallet
      await storage.createWallet({
        user_id: user.id,
        balance: "0.00",
        bonus_balance: "0.00",
      });

      res.status(201).json({ 
        message: "User created successfully",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        }
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Get profile
      const profile = await storage.getProfile(user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Get wallet
      const wallet = await storage.getWallet(user.id);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          wallet_balance: wallet?.balance || "0.00",
          is_admin: profile.is_admin,
          is_owner: profile.is_owner,
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Tournament routes
  app.get("/api/tournaments", async (req, res) => {
    try {
      const tournaments = await storage.getTournaments();
      res.json(tournaments);
    } catch (error) {
      console.error("Get tournaments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tournaments", async (req, res) => {
    try {
      const tournamentData = tournamentSchema.parse(req.body);
      const tournament = await storage.createTournament(tournamentData);
      res.status(201).json(tournament);
    } catch (error) {
      console.error("Create tournament error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/tournaments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = tournamentSchema.partial().parse(req.body);
      const tournament = await storage.updateTournament(id, updates);
      
      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      res.json(tournament);
    } catch (error) {
      console.error("Update tournament error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/tournaments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteTournament(id);
      
      if (!success) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      res.json({ message: "Tournament deleted successfully" });
    } catch (error) {
      console.error("Delete tournament error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tournaments/:id/join", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const success = await storage.joinTournament(tournamentId, userId);
      
      if (!success) {
        return res.status(400).json({ message: "Failed to join tournament" });
      }

      res.json({ message: "Successfully joined tournament" });
    } catch (error) {
      console.error("Join tournament error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Wallet routes
  app.get("/api/wallet/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const wallet = await storage.getWallet(userId);
      
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      res.json(wallet);
    } catch (error) {
      console.error("Get wallet error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/wallet/:userId/add", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { amount, payment_id, payment_method } = req.body;

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Get current wallet
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Calculate new balance
      const newBalance = (parseFloat(wallet.balance) + parseFloat(amount)).toFixed(2);

      // Update wallet
      const updatedWallet = await storage.updateWalletBalance(userId, newBalance);

      // Record transaction
      await storage.addTransaction({
        user_id: userId,
        type: "deposit",
        amount: amount,
        status: "completed",
        payment_id,
        payment_method,
        description: `Deposit of ₹${amount}`,
      });

      res.json(updatedWallet);
    } catch (error) {
      console.error("Add money error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/wallet/:userId/withdraw", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { amount } = req.body;

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Get current wallet
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Check sufficient balance
      if (parseFloat(wallet.balance) < parseFloat(amount)) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Calculate new balance
      const newBalance = (parseFloat(wallet.balance) - parseFloat(amount)).toFixed(2);

      // Update wallet
      const updatedWallet = await storage.updateWalletBalance(userId, newBalance);

      // Record transaction
      await storage.addTransaction({
        user_id: userId,
        type: "withdrawal",
        amount: amount,
        status: "pending",
        description: `Withdrawal of ₹${amount}`,
      });

      res.json(updatedWallet);
    } catch (error) {
      console.error("Withdraw money error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Transaction routes
  app.get("/api/transactions/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const transactions = await storage.getUserTransactions(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/make-admin", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const success = await storage.makeAdmin(userId);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "User made admin successfully" });
    } catch (error) {
      console.error("Make admin error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/remove-admin", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const success = await storage.removeAdmin(userId);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "Admin privileges removed successfully" });
    } catch (error) {
      console.error("Remove admin error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/transactions", async (req, res) => {
    try {
      const transactions = await storage.getAllTransactions();
      res.json(transactions);
    } catch (error) {
      console.error("Get all transactions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
