const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const MonolithRecommendation = require('./recommendation');
let Database;
let db;
let recommendationEngine;

// Try to load better-sqlite3, but handle errors gracefully
try {
  Database = require('better-sqlite3');
  console.log("Successfully loaded better-sqlite3 module");
} catch (err) {
  console.error("Error loading better-sqlite3:", err);
  console.warn("Warning: Failed to load better-sqlite3. Database features will be disabled.");
  Database = null;
}

const axios = require('axios');

// Global reference to the main window to prevent automatic closure due to JavaScript garbage collection
let mainWindow;

// Add global function for media preloading
global.fetchMediaForPreload = async (url) => {
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
    console.error(`Error preloading media from ${url}:`, error);
    return null;
  }
};

// Handle opening URLs in private/incognito windows
ipcMain.handle('open-private-window', async (event, url) => {
  const os = require('os');
  const platform = os.platform();
  const fs = require('fs');
  const { exec } = require('child_process');

  if (platform === 'win32') {
    const commonBrowserPaths = [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
    ];

    // Find the first existing Brave path
    const bravePath = commonBrowserPaths.find(path => fs.existsSync(path));
    
    if (bravePath) {
      try {
        // Execute the command directly through cmd
        exec(`cmd /c "${bravePath}" --incognito "${url}"`, { windowsHide: false });
        return true;
      } catch (error) {
        console.error('Error launching Brave:', error);
      }
    }
    
    // Fallback to shell.openExternal if Brave not found
    const { shell } = require('electron');
    try {
      await shell.openExternal(url);
      return true;
    } catch (error) {
      console.error('Error opening in browser:', error);
      return false;
    }
  } else if (platform === 'darwin') {
    // macOS - try standard private browsing flags
    try {
      await shell.openExternal(url, {
        activate: true,
        args: ['--incognito', '--new-window']
      });
      return true;
    } catch (error) {
      console.error('Error opening private window on macOS:', error);
      return false;
    }
  } else {
    // Linux and other platforms
    try {
      await shell.openExternal(url, {
        activate: true,
        args: ['--incognito', '--private-window']
      });
      return true;
    } catch (error) {
      console.error('Error opening private window:', error);
      return false;
    }
  }
});

// Handle opening URLs in regular browser window
ipcMain.handle('open-in-browser', async (event, url) => {
  const { shell } = require('electron');
  try {
    // Use shell.openExternal with no specific flags for regular window
    await shell.openExternal(url, {
      activate: true,
      workingDirectory: process.cwd()
    });
    return true;
  } catch (error) {
    console.error('Error opening in browser:', error);
    return false;
  }
});

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
  // Skip database initialization if better-sqlite3 module isn't available
  if (!Database) {
    console.warn("Database module not loaded. Database functionality will be disabled. Using localStorage fallback.");
    return;
  }
  
  try {
    // Use userData path for storing databases
    const dbPath = path.join(app.getPath('userData'), 'seen_posts.db');
    console.log(`Attempting to initialize database at: ${dbPath}`);
    
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }
    
    // Check if this is a first-time setup by looking for DB file
    const isFirstTimeSetup = !fs.existsSync(dbPath);
    
    // Open the database with reduced logging for production
    db = new Database(dbPath, { 
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
      fileMustExist: false 
    });
    
    // Enable WAL mode for better concurrent access, but only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log("Setting journal mode to WAL");
      db.pragma('journal_mode = WAL');
    } else {
      db.pragma('journal_mode = WAL');
    }
    
    // Only create tables and indexes on first run
    if (isFirstTimeSetup) {
      console.log("First-time database setup. Creating tables and indexes...");
      
      // Create tables if they don't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS seen_posts (
          id INTEGER PRIMARY KEY,
          status TEXT,
          tags TEXT,
          rating TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_seen_posts_status ON seen_posts(status);
        CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
      `);
    } else {
      // Check schema version to handle migrations
      let schemaVersion = 1;
      try {
        const versionResult = db.prepare("SELECT value FROM settings WHERE key='schema_version'").get();
        if (versionResult) {
          schemaVersion = parseInt(versionResult.value);
        }
      } catch (err) {
        // Schema version doesn't exist yet, will be created below
      }
      
      // Handle schema migrations based on version
      if (schemaVersion < 2) {
        // Migration for schema version 1 to 2
        try {
          // Ensure all needed columns exist
          const columns = db.prepare("PRAGMA table_info(seen_posts)").all();
          const columnNames = columns.map(col => col.name);
          
          const neededColumns = {
            'tags': 'TEXT',
            'rating': 'TEXT',
            'timestamp': 'DATETIME DEFAULT CURRENT_TIMESTAMP'
          };
          
          Object.entries(neededColumns).forEach(([colName, colType]) => {
            if (!columnNames.includes(colName)) {
              console.log(`Adding '${colName}' column to seen_posts table`);
              db.exec(`ALTER TABLE seen_posts ADD COLUMN ${colName} ${colType}`);
            }
          });
          
          // Set schema version to 2
          db.prepare("INSERT OR REPLACE INTO settings (key, value, timestamp) VALUES ('schema_version', ?, CURRENT_TIMESTAMP)").run('2');
          schemaVersion = 2;
        } catch (err) {
          console.error("Error in schema migration 1->2:", err);
        }
      }
      
      // Add future migrations here as needed
      // if (schemaVersion < 3) { ... }
    }
    
    // Only perform a basic test in development mode
    if (process.env.NODE_ENV === 'development') {
      // Test database with a simple query
      try {
        const count = db.prepare("SELECT COUNT(*) as count FROM seen_posts").get();
        console.log(`Database test successful. Found ${count.count} records in seen_posts table.`);
      } catch (testError) {
        console.error("Database test failed:", testError);
        
        // Try to reinitialize with more basic options
        if (db) {
          try {
            db.close();
          } catch (closeError) {
            console.error("Error closing database:", closeError);
          }
        }
        db = null;
        
        try {
          console.log("Attempting to reinitialize the database...");
          db = new Database(dbPath, { fileMustExist: false });
          console.log("Database reinitialized successfully");
        } catch (reopenError) {
          console.error("Failed to reinitialize database:", reopenError);
          db = null;
        }
      }
    }
    
    // Initialize the recommendation engine with the database
    recommendationEngine = new MonolithRecommendation(db);
    console.log("Recommendation engine created");
    
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization failed:", error);
    // Ensure db is set to null on failure
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        console.error("Error closing database after initialization failure:", closeError);
      }
    }
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
    console.warn('Database is not initialized, returning default value');
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
      console.warn('Database is not initialized, skipping set-setting');
      return false;
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)").run(key, String(value));
    return true;
  } catch (error) {
    console.error("Error setting setting:", error);
    return false;
  }
});

ipcMain.handle('is-seen', (event, postId) => {
  try {
    if (!db) {
      console.warn('Database is not initialized, assuming post not seen');
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
      console.warn('Database is not initialized, skipping mark-as-seen');
      return false;
    }
    db.prepare("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating, timestamp) VALUES (?, NULL, ?, ?, CURRENT_TIMESTAMP)").run(postId, tags, rating);
    return true;
  } catch (error) {
    console.error("Error marking post as seen:", error);
    return false;
  }
});

ipcMain.handle('mark-post-status', (event, postId, status, tags, rating) => {
  try {
    if (!db) {
      console.warn('Database is not initialized, skipping mark-post-status');
      return false;
    }
    db.prepare("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating, timestamp) VALUES (?, NULL, ?, ?, CURRENT_TIMESTAMP)").run(postId, tags, rating);
    db.prepare("UPDATE seen_posts SET status = ?, tags = ?, rating = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?").run(status, tags, rating, postId);
    return true;
  } catch (error) {
    console.error("Error marking post status:", error);
    return false;
  }
});

// Implementing a batch settings update method to reduce individual database operations

// Add this handler near the other IPC handlers
ipcMain.handle('set-settings-batch', (event, settingsObj) => {
  try {
    if (!db) {
      console.warn('Database is not initialized, skipping set-settings-batch');
      return false;
    }
    
    // Use a transaction for better performance with multiple operations
    const transaction = db.transaction(() => {
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)");
      
      Object.entries(settingsObj).forEach(([key, value]) => {
        stmt.run(key, String(value));
      });
    });
    
    // Execute the transaction
    transaction();
    return true;
  } catch (error) {
    console.error("Error setting settings batch:", error);
    return false;
  }
});

// User profile operations
ipcMain.handle('load-user-profile', (event) => {
  try {
    // First try to get the user profile from the app's user data directory
    const profilePath = path.join(app.getPath('userData'), 'user_profile.json');
    
    // If that doesn't exist, try the one in the app directory (for backward compatibility)
    const backupProfilePath = path.join(app.getAppPath(), 'user_profile.json');
    
    if (fs.existsSync(profilePath)) {
      const profileData = fs.readFileSync(profilePath, 'utf8');
      return JSON.parse(profileData);
    } else if (fs.existsSync(backupProfilePath)) {
      const profileData = fs.readFileSync(backupProfilePath, 'utf8');
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
    // Make sure userData directory exists
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    const profilePath = path.join(userDataPath, 'user_profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error("Error saving user profile:", error);
    return false;
  }
});

ipcMain.handle('build-user-profile', async (event) => {
  if (!db) {
    console.warn('Database is not initialized, returning empty profile');
    return {
      tag_scores: {},
      tag_totals: {},
      rating_scores: {},
      rating_totals: {},
      total_liked: 0,
      total_disliked: 0
    };
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
    try {
      const userDataPath = app.getPath('userData');
      const profilePath = path.join(userDataPath, 'user_profile.json');
      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    } catch (saveErr) {
      console.error("Error saving built profile:", saveErr);
    }
    
    return profile;
  } catch (error) {
    console.error("Error building user profile:", error);
    return {
      tag_scores: {},
      tag_totals: {},
      rating_scores: {},
      rating_totals: {},
      total_liked: 0,
      total_disliked: 0
    };
  }
});

// Add diagnostic tool to check database status
ipcMain.handle('check-database-status', (event) => {
  const status = {
    isInitialized: db !== null,
    databasePath: db ? db.name : null,
    tables: [],
    error: null
  };
  
  if (db) {
    try {
      // Get list of tables
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all();
      status.tables = tables.map(t => t.name);
      
      // Get count of records in seen_posts
      const seenCount = db.prepare("SELECT COUNT(*) as count FROM seen_posts").get();
      status.seenPostsCount = seenCount.count;
      
      // Get count of records in settings
      const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get();
      status.settingsCount = settingsCount.count;
      
    } catch (err) {
      status.error = err.message;
    }
  }
  
  return status;
});

// Add a batch method to check multiple posts at once
ipcMain.handle('are-posts-seen', (event, postIds) => {
  try {
    if (!db || !postIds || postIds.length === 0) {
      return {};
    }
    
    // Convert the IDs array to a comma-separated string for SQL IN clause
    const placeholders = postIds.map(() => '?').join(',');
    const query = `SELECT id FROM seen_posts WHERE id IN (${placeholders})`;
    
    // Execute the query with the postIds array as parameters
    const results = db.prepare(query).all(...postIds);
    
    // Convert to a map of id -> boolean for easy lookup
    const seenMap = {};
    postIds.forEach(id => {
      seenMap[id] = false; // Default all to not seen
    });
    
    // Mark the ones that were found as seen
    results.forEach(row => {
      seenMap[row.id] = true;
    });
    
    return seenMap;
  } catch (error) {
    console.error("Error batch-checking seen posts:", error);
    return {};
  }
});

// Add this right after the build-user-profile handler
ipcMain.handle('initialize-recommendation-engine', async (event, userProfile) => {
  try {
    if (!recommendationEngine) {
      recommendationEngine = new MonolithRecommendation(db);
    }
    await recommendationEngine.initialize(userProfile);
    return { success: true };
  } catch (error) {
    console.error("Error initializing recommendation engine:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-recommendation-profile', async (event, post, status) => {
  try {
    if (!recommendationEngine) {
      recommendationEngine = new MonolithRecommendation(db);
      await recommendationEngine.initialize();
    }
    
    const updatedProfile = recommendationEngine.updateProfile(post, status);
    return { success: true, profile: updatedProfile };
  } catch (error) {
    console.error("Error updating recommendation profile:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recommend-posts', async (event, posts) => {
  try {
    if (!recommendationEngine) {
      recommendationEngine = new MonolithRecommendation(db);
      await recommendationEngine.initialize();
    }
    
    recommendationEngine.adjustExplorationRate();
    const recommendedPosts = recommendationEngine.recommendPosts(posts);
    
    return { success: true, posts: recommendedPosts };
  } catch (error) {
    console.error("Error recommending posts:", error);
    return { success: false, error: error.message, posts: posts };
  }
});

ipcMain.handle('save-recommendation-model', async (event) => {
  try {
    if (!recommendationEngine) {
      return { success: false, error: "Recommendation engine not initialized" };
    }
    
    const model = recommendationEngine.exportModel();
    const modelPath = path.join(app.getPath('userData'), 'recommendation_model.json');
    
    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf8');
    return { success: true, path: modelPath };
  } catch (error) {
    console.error("Error saving recommendation model:", error);
    return { success: false, error: error.message };
  }
});

// Load saved recommendation model
ipcMain.handle('load-recommendation-model', async (event) => {
  try {
    if (!recommendationEngine) {
      recommendationEngine = new MonolithRecommendation(db);
    }
    
    // First try to load from database if available
    if (db) {
      try {
        // Check if the recommendation_models table exists
        const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recommendation_models'").get();
        
        if (tableCheck) {
          const stmt = db.prepare('SELECT model FROM recommendation_models ORDER BY timestamp DESC LIMIT 1');
          const row = stmt.get();
          
          if (row && row.model) {
            const model = JSON.parse(row.model);
            const success = recommendationEngine.importModel(model);
            return { success };
          }
        }
      } catch (dbErr) {
        console.warn('Error loading model from database:', dbErr);
        // Continue to try loading from file
      }
    }
    
    // If no model in database or loading failed, try from file
    const modelPath = path.join(app.getPath('userData'), 'recommendation_model.json');
    if (fs.existsSync(modelPath)) {
      const modelData = fs.readFileSync(modelPath, 'utf8');
      const model = JSON.parse(modelData);
      
      const success = recommendationEngine.importModel(model);
      return { success };
    }
    
    // If no model exists yet, initialize with a new one
    await recommendationEngine.initialize();
    return { success: true };
  } catch (error) {
    console.error("Error loading recommendation model:", error);
    return { success: false, error: error.message };
  }
});

// Get top user tags from recommendation engine
ipcMain.handle('get-top-user-tags', async (event, limit = 20) => {
  try {
    if (!recommendationEngine) {
      recommendationEngine = new MonolithRecommendation(db);
      await recommendationEngine.initialize();
    }
    
    return await recommendationEngine.getTopUserTags(limit);
  } catch (error) {
    console.error('Error getting top user tags:', error);
    return [];
  }
});

// Get top tag combinations from recommendation engine
ipcMain.handle('get-top-tag-combinations', async (event, limit = 10) => {
  try {
    if (!recommendationEngine) {
      recommendationEngine = new MonolithRecommendation(db);
      await recommendationEngine.initialize();
    }
    
    return await recommendationEngine.getTopTagCombinations(limit);
  } catch (error) {
    console.error('Error getting top tag combinations:', error);
    return [];
  }
});

// New: Add handler for getting preloaded media
ipcMain.handle('get-preloaded-media', (event, postId) => {
  try {
    if (!recommendationEngine) {
      return null;
    }
    
    return recommendationEngine.getPreloadedMedia(postId);
  } catch (error) {
    console.error('Error getting preloaded media:', error);
    return null;
  }
});

// Cleanup on app quit
app.on('will-quit', () => {
  // Close database connection
  if (db) {
    try {
      db.close();
    } catch (err) {
      console.error("Error closing database connection:", err);
    }
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