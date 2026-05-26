import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "bot.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  const schema = fs.readFileSync(path.join(process.cwd(), "schema.sql"), "utf8");
  db.exec(schema);
}

migrate();

export const queries = {
  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  setSetting: db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ),
  createTicket: db.prepare(
    "INSERT INTO tickets(guild_id, channel_id, creator_id, created_at) VALUES(?, ?, ?, ?)"
  ),
  getTicketByChannel: db.prepare("SELECT * FROM tickets WHERE channel_id = ?"),
  getOpenTicketByCreator: db.prepare(
    "SELECT * FROM tickets WHERE creator_id = ? AND status = 'open'"
  ),
  getOpenTicketByCreatorOrChannel: db.prepare(
    "SELECT * FROM tickets WHERE creator_id = ? AND channel_id = ? AND status = 'open'"
  ),
  claimTicket: db.prepare(
    "UPDATE tickets SET claimed_by = ? WHERE channel_id = ? AND status = 'open'"
  ),
  closeTicket: db.prepare(
    "UPDATE tickets SET status = 'closed', closed_at = ? WHERE channel_id = ?"
  ),
  createSubmission: db.prepare(
    `INSERT INTO submissions(
      ticket_id, schematic_name, designers, credits, rates, stats,
      created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  updateSubmissionMain: db.prepare(
    `UPDATE submissions SET schematic_name = ?, designers = ?, credits = ?,
      rates = ?, stats = ?, updated_at = ? WHERE ticket_id = ?`
  ),
  updateSubmissionDetails: db.prepare(
    `UPDATE submissions SET positives = ?, negatives = ?, instructions = ?,
      updated_at = ? WHERE ticket_id = ?`
  ),
  updateSubmissionRender: db.prepare(
    `UPDATE submissions SET width = ?, height = ?, length = ?,
      non_air_volume = ?, bounding_volume = ?, render_path = ?, updated_at = ?
      WHERE ticket_id = ?`
  ),
  getSubmissionByTicket: db.prepare(
    "SELECT * FROM submissions WHERE ticket_id = ? ORDER BY id DESC LIMIT 1"
  ),
  createUpload: db.prepare(
    `INSERT INTO uploads(ticket_id, message_id, attachment_id, file_name, sha256, status, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)`
  ),
  getUploadByHash: db.prepare("SELECT * FROM uploads WHERE tick
