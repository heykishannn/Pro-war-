import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  users, 
  profiles, 
  tournaments, 
  wallets, 
  transactions, 
  permissions, 
  user_permissions,
  tournament_participants,
  game_sessions,
  type User, 
  type InsertUser, 
  type Profile, 
  type InsertProfile,
  type Tournament,
  type InsertTournament,
  type Wallet,
  type InsertWallet,
  type Transaction,
  type InsertTransaction,
  type GameSession,
  type InsertGameSession
} from "@shared/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const client = postgres(connectionString);
const db = drizzle(client);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;

  // Profile operations
  getProfile(userId: number): Promise<Profile | undefined>;
  getProfileByUsername(username: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(userId: number, updates: Partial<Profile>): Promise<Profile | undefined>;

  // Tournament operations
  getTournaments(): Promise<Tournament[]>;
  getTournament(id: number): Promise<Tournament | undefined>;
  createTournament(tournament: InsertTournament): Promise<Tournament>;
  updateTournament(id: number, updates: Partial<Tournament>): Promise<Tournament | undefined>;
  deleteTournament(id: number): Promise<boolean>;
  joinTournament(tournamentId: number, userId: number): Promise<boolean>;

  // Wallet operations
  getWallet(userId: number): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWalletBalance(userId: number, amount: string): Promise<Wallet | undefined>;
  addTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: number): Promise<Transaction[]>;

  // Game operations
  createGameSession(session: InsertGameSession): Promise<GameSession>;
  updateGameSession(id: number, updates: Partial<GameSession>): Promise<GameSession | undefined>;
  getUserGameSessions(userId: number): Promise<GameSession[]>;

  // Admin operations
  getAllUsers(): Promise<Profile[]>;
  makeAdmin(userId: number): Promise<boolean>;
  removeAdmin(userId: number): Promise<boolean>;
  getAllTransactions(): Promise<Transaction[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getProfile(userId: number): Promise<Profile | undefined> {
    const result = await db.select().from(profiles).where(eq(profiles.user_id, userId)).limit(1);
    return result[0];
  }

  async getProfileByUsername(username: string): Promise<Profile | undefined> {
    const result = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
    return result[0];
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const result = await db.insert(profiles).values(profile).returning();
    return result[0];
  }

  async updateProfile(userId: number, updates: Partial<Profile>): Promise<Profile | undefined> {
    const result = await db.update(profiles).set(updates).where(eq(profiles.user_id, userId)).returning();
    return result[0];
  }

  async getTournaments(): Promise<Tournament[]> {
    return await db.select().from(tournaments).orderBy(desc(tournaments.created_at));
  }

  async getTournament(id: number): Promise<Tournament | undefined> {
    const result = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
    return result[0];
  }

  async createTournament(tournament: InsertTournament): Promise<Tournament> {
    const result = await db.insert(tournaments).values(tournament).returning();
    return result[0];
  }

  async updateTournament(id: number, updates: Partial<Tournament>): Promise<Tournament | undefined> {
    const result = await db.update(tournaments).set(updates).where(eq(tournaments.id, id)).returning();
    return result[0];
  }

  async deleteTournament(id: number): Promise<boolean> {
    const result = await db.delete(tournaments).where(eq(tournaments.id, id)).returning();
    return result.length > 0;
  }

  async joinTournament(tournamentId: number, userId: number): Promise<boolean> {
    try {
      // Check if user already joined
      const existing = await db.select().from(tournament_participants)
        .where(and(eq(tournament_participants.tournament_id, tournamentId), eq(tournament_participants.user_id, userId)))
        .limit(1);
      
      if (existing.length > 0) {
        return false;
      }

      // Add participant
      await db.insert(tournament_participants).values({
        tournament_id: tournamentId,
        user_id: userId,
      });

      // Update tournament participant count
      await db.update(tournaments)
        .set({ current_players: sql`${tournaments.current_players} + 1` })
        .where(eq(tournaments.id, tournamentId));

      return true;
    } catch (error) {
      console.error('Error joining tournament:', error);
      return false;
    }
  }

  async getWallet(userId: number): Promise<Wallet | undefined> {
    const result = await db.select().from(wallets).where(eq(wallets.user_id, userId)).limit(1);
    return result[0];
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    const result = await db.insert(wallets).values(wallet).returning();
    return result[0];
  }

  async updateWalletBalance(userId: number, amount: string): Promise<Wallet | undefined> {
    const result = await db.update(wallets)
      .set({ balance: amount, updated_at: new Date() })
      .where(eq(wallets.user_id, userId))
      .returning();
    return result[0];
  }

  async addTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const result = await db.insert(transactions).values(transaction).returning();
    return result[0];
  }

  async getUserTransactions(userId: number): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.user_id, userId))
      .orderBy(desc(transactions.created_at));
  }

  async createGameSession(session: InsertGameSession): Promise<GameSession> {
    const result = await db.insert(game_sessions).values(session).returning();
    return result[0];
  }

  async updateGameSession(id: number, updates: Partial<GameSession>): Promise<GameSession | undefined> {
    const result = await db.update(game_sessions).set(updates).where(eq(game_sessions.id, id)).returning();
    return result[0];
  }

  async getUserGameSessions(userId: number): Promise<GameSession[]> {
    return await db.select().from(game_sessions)
      .where(eq(game_sessions.user_id, userId))
      .orderBy(desc(game_sessions.created_at));
  }

  async getAllUsers(): Promise<Profile[]> {
    return await db.select().from(profiles).orderBy(desc(profiles.created_at));
  }

  async makeAdmin(userId: number): Promise<boolean> {
    const result = await db.update(profiles)
      .set({ is_admin: true })
      .where(eq(profiles.user_id, userId))
      .returning();
    return result.length > 0;
  }

  async removeAdmin(userId: number): Promise<boolean> {
    const result = await db.update(profiles)
      .set({ is_admin: false })
      .where(eq(profiles.user_id, userId))
      .returning();
    return result.length > 0;
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return await db.select().from(transactions).orderBy(desc(transactions.created_at));
  }
}

export const storage = new DatabaseStorage();
