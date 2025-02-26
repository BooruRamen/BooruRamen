const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const axios = require('axios');

// Global reference to the main window to prevent automatic closure due to JavaScript garbage collection
let mainWindow;

// Database connection
let db;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, // Enable context isolation for better security
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,  // Disable web security to allow loading remote content
    },
    backgroundColor: '#333333', // Dark background color similar to the original app
  });

  // Configure content security policy to allow loading from danbooru
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' https://danbooru.donmai.us https://cdn.donmai.us https://cdn.jsdelivr.net 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:;"]
      }
    });
  });
  
  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Open the DevTools in development mode for debugging
  mainWindow.webContents.openDevTools();

  // Handle window being closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Initialize the SQLite database
function initDatabase() {
  try {
    const dbPath = path.join(app.getPath('userData'), 'seen_posts.db');
    db = new Database(dbPath);
    
    // Create tables if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS seen_posts (
        id INTEGER PRIMARY KEY,
        status TEXT,
        tags TEXT,
        rating TEXT
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    
    // Check if 'tags' and 'rating' columns exist and add them if not
    const columns = db.prepare("PRAGMA table_info(seen_posts)").all();
    const columnNames = columns.map(col => col.name);
    
    if (!columnNames.includes('tags')) {
      try {
        db.exec("ALTER TABLE seen_posts ADD COLUMN tags TEXT");
      } catch (err) {
        console.error("Error adding column tags:", err);
      }
    }
    if (!columnNames.includes('rating')) {
      try {
        db.exec("ALTER TABLE seen_posts ADD COLUMN rating TEXT");
      } catch (err) {
        console.error("Error adding column rating:", err);
      }
    }
    
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization failed:", error);
    // Ensure db is set to null on failure
    db = null;
  }
}

// IPC handler for fetching media from remote sources
ipcMain.handle('fetch-media', async (event, url) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'BooruRamen/1.0'
      }
    });
    
    // Convert the arraybuffer to base64
    const buffer = Buffer.from(response.data, 'binary');
    const base64 = buffer.toString('base64');
    
    // Determine content type
    let contentType = response.headers['content-type'];
    if (!contentType) {
      // Try to guess content type from URL
      if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      } else if (url.endsWith('.png')) {
        contentType = 'image/png';
      } else if (url.endsWith('.gif')) {
        contentType = 'image/gif';
      } else if (url.endsWith('.webm')) {
        contentType = 'video/webm';
      } else if (url.endsWith('.mp4')) {
        contentType = 'video/mp4';
      }
    }
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error(`Error fetching media from ${url}:`, error);
    return null;
  }
});

// IPC handlers for database operations
ipcMain.handle('get-setting', (event, key, defaultValue) => {
  if (!db) {
    console.error('Database is not initialized');
    return defaultValue;
  }
  try {
    const result = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
    return result ? result.value : defaultValue;
  } catch (error) {
    console.error("Error getting setting:", error);
    return defaultValue;
  }
});

ipcMain.handle('set-setting', (event, key, value) => {
  try {
    if (!db) {
      console.error('Database is not initialized');
      return false;
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
    return true;
  } catch (error) {
    console.error("Error setting setting:", error);
    return false;
  }
});

ipcMain.handle('is-seen', (event, postId) => {
  try {
    if (!db) {
      console.error('Database is not initialized');
      return false;
    }
    const result = db.prepare("SELECT 1 FROM seen_posts WHERE id=?").get(postId);
    return result !== undefined;
  } catch (error) {
    console.error("Error checking if post is seen:", error);
    return false;
  }
});

ipcMain.handle('mark-as-seen', (event, postId, tags, rating) => {
  try {
    if (!db) {
      console.error('Database is not initialized');
      return false;
    }
    db.prepare("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating) VALUES (?, NULL, ?, ?)").run(postId, tags, rating);
    return true;
  } catch (error) {
    console.error("Error marking post as seen:", error);
    return false;
  }
});

ipcMain.handle('mark-post-status', (event, postId, status, tags, rating) => {
  try {
    if (!db) {
      console.error('Database is not initialized');
      return false;
    }
    db.prepare("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating) VALUES (?, NULL, ?, ?)").run(postId, tags, rating);
    db.prepare("UPDATE seen_posts SET status = ?, tags = ?, rating = ? WHERE id = ?").run(status, tags, rating, postId);
    return true;
  } catch (error) {
    console.error("Error marking post status:", error);
    return false;
  }
});

// User profile operations
ipcMain.handle('load-user-profile', (event) => {
  try {
    const profilePath = path.join(app.getPath('userData'), 'user_profile.json');
    if (fs.existsSync(profilePath)) {
      const profileData = fs.readFileSync(profilePath, 'utf8');
      return JSON.parse(profileData);
    } else {
      // Return empty profile if file doesn't exist
      const emptyProfile = {
        tag_scores: {},
        tag_totals: {},
        rating_scores: {},
        rating_totals: {},
        total_liked: 0,
        total_disliked: 0
      };
      return emptyProfile;
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
    return null;
  }
});

ipcMain.handle('save-user-profile', (event, profile) => {
  try {
    const profilePath = path.join(app.getPath('userData'), 'user_profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error("Error saving user profile:", error);
    return false;
  }
});

ipcMain.handle('build-user-profile', async (event) => {
  if (!db) {
    console.error('Database is not initialized');
    return null;
  }
  try {
    const likedPosts = db.prepare("SELECT tags, rating FROM seen_posts WHERE status = 'liked'").all();
    const dislikedPosts = db.prepare("SELECT tags, rating FROM seen_posts WHERE status = 'disliked'").all();
    
    const tag_scores = {};
    const tag_totals = {};
    const rating_scores = {};
    const rating_totals = {};
    
    const total_liked = likedPosts.length;
    const total_disliked = dislikedPosts.length;
    
    // Process liked posts
    likedPosts.forEach(({ tags, rating }) => {
      const tagsArray = tags ? tags.split(' ') : [];
      tagsArray.forEach(tag => {
        tag_scores[tag] = (tag_scores[tag] || 0) + 1;
        tag_totals[tag] = (tag_totals[tag] || 0) + 1;
      });
      rating_scores[rating] = (rating_scores[rating] || 0) + 1;
      rating_totals[rating] = (rating_totals[rating] || 0) + 1;
    });
    
    // Process disliked posts
    dislikedPosts.forEach(({ tags, rating }) => {
      const tagsArray = tags ? tags.split(' ') : [];
      tagsArray.forEach(tag => {
        tag_scores[tag] = (tag_scores[tag] || 0) - 1;
        tag_totals[tag] = (tag_totals[tag] || 0) + 1;
      });
      rating_scores[rating] = (rating_scores[rating] || 0) - 1;
      rating_totals[rating] = (rating_totals[rating] || 0) + 1;
    });
    
    const profile = {
      tag_scores,
      tag_totals,
      rating_scores,
      rating_totals,
      total_liked,
      total_disliked
    };
    
    // Save profile to file
    const profilePath = path.join(app.getPath('userData'), 'user_profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    
    return profile;
  } catch (error) {
    console.error("Error building user profile:", error);
    return null;
  }
});

// Cleanup on app quit
app.on('will-quit', () => {
  // Close database connection
  if (db) {
    db.close();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  initDatabase();
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it's common for applications to stay open until the user explicitly quits
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  // On macOS it's common to re-create a window when the dock icon is clicked
  if (mainWindow === null) createWindow();
});