# database.py

import sqlite3

# Initialize SQLite database
conn = sqlite3.connect("seen_posts.db")
c = conn.cursor()

# Create tables if they don't exist
c.execute("""
    CREATE TABLE IF NOT EXISTS seen_posts (
        id INTEGER PRIMARY KEY,
        status TEXT,
        tags TEXT,
        rating TEXT
    )
""")
c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
""")
conn.commit()

# Check if 'tags' and 'rating' columns exist and add them if not
c.execute("PRAGMA table_info(seen_posts)")
columns = [col[1] for col in c.fetchall()]
if 'tags' not in columns:
    c.execute("ALTER TABLE seen_posts ADD COLUMN tags TEXT")
    conn.commit()
if 'rating' not in columns:
    c.execute("ALTER TABLE seen_posts ADD COLUMN rating TEXT")
    conn.commit()

# Function to get a setting from the database
def get_setting(key, default=None):
    c.execute("SELECT value FROM settings WHERE key=?", (key,))
    result = c.fetchone()
    return result[0] if result else default

# Function to set a setting in the database
def set_setting(key, value):
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()

# Function to check if a post is already seen
def is_seen(post_id):
    c.execute("SELECT 1 FROM seen_posts WHERE id=?", (post_id,))
    return c.fetchone() is not None

# Function to mark a post as seen
def mark_as_seen(post_id, tags, rating):
    c.execute("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating) VALUES (?, NULL, ?, ?)", (post_id, tags, rating))
    conn.commit()

# Function to mark post as liked or disliked, and update tags and rating
def mark_post_status(post_id, status, tags, rating):
    c.execute("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating) VALUES (?, NULL, ?, ?)", (post_id, tags, rating))
    c.execute("UPDATE seen_posts SET status = ?, tags = ?, rating = ? WHERE id = ?", (status, tags, rating, post_id))
    conn.commit()

# Function to close the database connection
def close_connection():
    conn.close()
