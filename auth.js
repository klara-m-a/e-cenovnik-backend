// Simple authentication module
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

// Store sessions in memory (or file for persistence)
const sessions = {}

// Generate a random session ID
function generateSessionId() {
  return crypto.randomBytes(32).toString("hex")
}

// Create a session file store for persistence across restarts
const SESSION_DIR = path.join(__dirname, "sessions")
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
}

// Load existing sessions from files
function loadSessions() {
  try {
    const files = fs.readdirSync(SESSION_DIR)
    files.forEach((file) => {
      if (file.endsWith(".json")) {
        const sessionId = file.replace(".json", "")
        const data = fs.readFileSync(path.join(SESSION_DIR, file), "utf8")
        sessions[sessionId] = JSON.parse(data)
      }
    })
    console.log(`Loaded ${Object.keys(sessions).length} sessions`)
  } catch (err) {
    console.error("Error loading sessions:", err)
  }
}

// Save session to file
function saveSession(sessionId, data) {
  try {
    fs.writeFileSync(path.join(SESSION_DIR, `${sessionId}.json`), JSON.stringify(data), "utf8")
  } catch (err) {
    console.error("Error saving session:", err)
  }
}

// Remove session file
function removeSession(sessionId) {
  try {
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (err) {
    console.error("Error removing session file:", err)
  }
}

// Initialize by loading existing sessions
loadSessions()

// Simple authentication function
function authenticate(username, password) {
  // Get credentials from environment variables
  const validUsername = process.env.ADMIN_USERNAME
  const validPassword = process.env.ADMIN_PASSWORD

  if (!validUsername || !validPassword) {
    console.error("Missing ADMIN_USERNAME or ADMIN_PASSWORD in environment")
    return false
  }

  return username === validUsername && password === validPassword
}

// Create a new session
function createSession(username) {
  const sessionId = generateSessionId()
  const session = {
    username,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  }

  sessions[sessionId] = session
  saveSession(sessionId, session)

  return sessionId
}

// Validate a session
function validateSession(sessionId) {
  if (!sessionId || !sessions[sessionId]) {
    return false
  }

  const session = sessions[sessionId]
  const now = new Date()
  const expiresAt = new Date(session.expiresAt)

  // Check if session has expired
  if (now > expiresAt) {
    delete sessions[sessionId]
    removeSession(sessionId)
    return false
  }

  return true
}

// Destroy a session
function destroySession(sessionId) {
  if (sessions[sessionId]) {
    delete sessions[sessionId]
    removeSession(sessionId)
    return true
  }
  return false
}

module.exports = {
  authenticate,
  createSession,
  validateSession,
  destroySession,
}
