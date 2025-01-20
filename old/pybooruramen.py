import vlc
import threading
import tkinter as tk
import requests
from pybooru import Danbooru
import sqlite3
from io import BytesIO
from PIL import Image, ImageTk
import tempfile
import os
import webbrowser
import time
import sys

# Initialize Danbooru client and SQLite database
client = Danbooru('danbooru')
conn = sqlite3.connect("seen_posts.db")
c = conn.cursor()

# Modify the database schema to include 'status', 'tags', 'rating', and 'settings' table
c.execute("CREATE TABLE IF NOT EXISTS seen_posts (id INTEGER PRIMARY KEY, status TEXT, tags TEXT, rating TEXT)")
c.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
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

# Retrieve the last used page number
last_used_page = int(get_setting('last_used_page', 1))

# Initialize tkinter window
root = tk.Tk()
root.title("Danbooru Viewer")
root.geometry("1280x850")  # Set the overall window size (height changed to 850)

# Frames for media display and controls
media_frame = tk.Frame(root, width=1280, height=720)  # Frame for video display
media_frame.pack_propagate(False)  # Prevent frame from resizing to its contents
media_frame.pack(pady=10)  # Add vertical padding at the top

button_frame = tk.Frame(root)  # Main frame for buttons
button_frame.pack(fill='x')  # Add padding and fill horizontally

# **Media display label**
media_label = tk.Label(media_frame, width=1280, height=720)
media_label.pack()

# Global variables
video_instance = None
player = None
page = last_used_page  # Start at the last used page
current_index = 0
posts = []
recent_video_files = []  # List to store tuples of (post_index, temp_video_path)
temp_video_path = None  # Temporary file for downloaded video

# Variable to hold the selected rating option
rating_option = tk.StringVar()
rating_option.set('General and Sensitive')  # Default option changed to 'General and Sensitive'

# Variable to hold the selected media type option
media_option = tk.StringVar()
media_option.set('Video and Images')  # Default option

# Function to check if a post is already seen
def is_seen(post_id):
    c.execute("SELECT 1 FROM seen_posts WHERE id=?", (post_id,))
    return c.fetchone() is not None

# Modify the 'mark_as_seen' function to handle 'status', 'tags', and 'rating'
def mark_as_seen(post_id, tags, rating):
    c.execute("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating) VALUES (?, NULL, ?, ?)", (post_id, tags, rating))
    conn.commit()

# Function to mark post as liked or disliked, and update tags and rating
def mark_post_status(post_id, status, tags, rating):
    c.execute("INSERT OR IGNORE INTO seen_posts (id, status, tags, rating) VALUES (?, NULL, ?, ?)", (post_id, tags, rating))
    c.execute("UPDATE seen_posts SET status = ?, tags = ?, rating = ? WHERE id = ?", (status, tags, rating, post_id))
    conn.commit()

# Fetch new posts based on the current media and rating options
def fetch_new_posts(limit=20):
    global page
    selected_rating = rating_option.get()
    selected_media_option = media_option.get()

    # Build the rating_tags based on selected_rating
    if selected_rating == 'General Only':
        rating_tags = 'rating:general'
    elif selected_rating == 'General and Sensitive':
        rating_tags = 'rating:general..sensitive'
    elif selected_rating == 'General, Sensitive, and Questionable':
        rating_tags = 'rating:general..questionable'
    elif selected_rating == 'General, Sensitive, Questionable, and Explicit':
        rating_tags = ''  # No rating filter; include all ratings
    elif selected_rating == 'Sensitive Only':
        rating_tags = 'rating:sensitive'
    elif selected_rating == 'Questionable Only':
        rating_tags = 'rating:questionable'
    elif selected_rating == 'Explicit Only':
        rating_tags = 'rating:explicit'
    else:
        rating_tags = ''  # Default to no rating filter

    # Build the tags parameter based on media_option
    tags = []

    if selected_media_option == 'Video Only':
        tags.append('animated')
    elif selected_media_option == 'Images Only':
        tags.append('-animated')  # Exclude animated posts
    # For 'Video and Images', we don't add any 'animated' tag

    if rating_tags:
        tags.append(rating_tags)
    tags_str = ' '.join(tags)

    # Initialize the maximum number of pages to try
    MAX_PAGES_TO_TRY = 100  # Increase the max pages to try
    pages_tried = 0

    # Start with trying the current page
    pages_to_try = [page]

    # Keep track of pages we have already tried
    tried_pages = set()

    while pages_tried < MAX_PAGES_TO_TRY:
        for p in pages_to_try:
            if p in tried_pages:
                continue  # Skip pages we've already tried
            page = p
            tried_pages.add(page)
            try:
                posts = client.post_list(tags=tags_str, limit=limit, page=page)
            except Exception as e:
                print(f"Error fetching posts: {e}")
                if '429' in str(e):
                    print("Rate limit exceeded. Please wait and try again later.")
                    return []
                else:
                    raise e

            if not posts:
                print(f"No posts returned from API on page {page}.")
                continue

            new_posts = [post for post in posts if not is_seen(post["id"])]

            # Filter posts based on selected_media_option
            if selected_media_option == 'Video Only':
                new_posts = [post for post in new_posts if post.get("file_ext", '') in ["mp4", "webm"]]
            elif selected_media_option == 'Images Only':
                new_posts = [post for post in new_posts if post.get("file_ext", '') not in ["mp4", "webm"]]
            # For 'Video and Images', we don't need to filter

            if new_posts:
                set_setting('last_used_page', page)  # Save the current page
                return new_posts
            else:
                print(f"No new posts on page {page}.")

        # If no new posts found on initial pages, increment page and try again
        page += 1  # Increment to the next page
        set_setting('last_used_page', page)  # Update last_used_page whenever page changes
        pages_tried += 1
        pages_to_try = [page]  # Only try the next page in the next iteration
        print(f"Trying next page: {page}")
        time.sleep(1)  # Delay to prevent hitting the rate limit

    print("No new posts found after trying multiple pages.")
    return []

# Function to clear the media_label content
def clear_media_label():
    media_label.config(image='', text='')  # Clear image and text from label

# Global flag to control playback loop
looping = True

# Global flag to indicate if the app is closing
closing_app = False

# Function to stop VLC playback and release resources gracefully
def stop_vlc_completely():
    global player, video_instance, closing_app
    closing_app = True  # Indicate that the app is closing

    # Stop playback and release the media player and instance
    if player:
        try:
            player.stop()
            player.release()  # Explicitly release VLC media player
        except Exception as e:
            print(f"Error releasing player: {e}")
        player = None

    if video_instance:
        video_instance.release()  # Explicitly release VLC instance
        video_instance = None

    # Small delay to ensure all resources are released
    time.sleep(0.1)

# Updated on_close function for complete cleanup
def on_close():
    global looping, page
    looping = False  # Stop the playback loop

    stop_vlc_completely()  # Stop and completely release VLC resources

    # Delete any remaining temp video files
    for index, temp_path in recent_video_files:
        try:
            os.remove(temp_path)
            print(f"Deleted temp video file: {temp_path}")
        except Exception as e:
            print(f"Error deleting temp video file {temp_path}: {e}")
    recent_video_files.clear()

    # Save the last used page number
    set_setting('last_used_page', page)

    conn.close()           # Close the database connection
    root.destroy()          # Destroy the tkinter window
    sys.exit(0)             # Exit the application to stop all background threads

# Attach the on_close function to the window close event
root.protocol("WM_DELETE_WINDOW", on_close)

# Function to stop video playback
def stop_playback():
    global player, video_instance
    if player:
        player.stop()
    # Do not delete temp files here; they are managed by cleanup_old_temp_files

# Function to download video locally and manage temporary files
def download_video(url, post_index):
    response = requests.get(url, stream=True)
    if response.status_code == 200:
        temp_video_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        for chunk in response.iter_content(chunk_size=8192):
            temp_video_file.write(chunk)
        temp_video_path = temp_video_file.name
        temp_video_file.close()
        print("Video downloaded to:", temp_video_path)
        # Add to recent_video_files
        recent_video_files.append((post_index, temp_video_path))
        return temp_video_path
    else:
        print("Error downloading video.")
        return None

# Updated play_video function with None checks and error handling
def play_video(temp_video_path):
    global video_instance, player, looping, closing_app
    if not temp_video_path:
        print("Failed to download video.")
        return

    # Initialize VLC instance if it doesn't exist
    if not video_instance:
        video_instance = vlc.Instance('--no-video-title-show', '--avcodec-hw=none')
    if not player:
        player = video_instance.media_player_new()

    media = video_instance.media_new(temp_video_path)
    player.set_media(media)

    # Set the player output to the tkinter label and match label size if app is not closing
    if not closing_app:
        media_label.update_idletasks()  # Ensure the label is fully rendered
        window_id = media_label.winfo_id()
        player.set_hwnd(window_id)

    player.video_set_scale(0)  # 0 means automatic scaling to fit the display area
    player.set_fullscreen(False)

    # Start playback
    try:
        if not closing_app:
            player.play()
    except Exception as e:
        print(f"Error starting playback: {e}")
        return

    looped_once = False  # Flag to ensure only one reset per loop

    # Controlled looping mechanism with exit condition
    while looping and player and not closing_app:
        try:
            current_time = player.get_time()       # Current playback time in milliseconds
            total_duration = player.get_length()   # Total video duration in milliseconds

            # Only reset once per loop when near the end
            if total_duration > 0 and current_time >= total_duration - 500 and not looped_once:
                print("Pre-buffering to start for seamless loop...")
                player.set_time(0)   # Set playback to the start of the video
                time.sleep(0.1)      # Small delay to allow VLC to stabilize
                looped_once = True   # Prevent repeated looping within this period

                # Resume playback if paused or stalled
                if player.get_state() != vlc.State.Playing and not closing_app:
                    player.play()

            # Reset the flag after looping completes
            if current_time < total_duration - 500:
                looped_once = False  # Allow looping again in the next cycle

            # Check if an error occurs
            state = player.get_state()
            if state == vlc.State.Error:
                print("Error occurred during playback.")
                break

            time.sleep(0.1)  # Check every 100 milliseconds for smoother pre-buffering

        except AttributeError:
            # Handle cases where player is None due to on_close cleanup
            print("Player was released, exiting play loop.")
            break
        except Exception as e:
            # Handle any unexpected errors gracefully
            print(f"Unexpected error during playback: {e}")
            break

    # Stop playback when loop exits if player still exists
    if player and not closing_app:
        try:
            player.stop()
        except Exception as e:
            print(f"Error stopping playback: {e}")

# Function to clean up old temporary video files
def cleanup_old_temp_files():
    global recent_video_files, current_index
    # Keep only temp files for current_index - 3 <= index <= current_index + 3
    indices_to_keep = set(range(current_index - 3, current_index + 4))
    new_recent_video_files = []
    for index, temp_path in recent_video_files:
        if index in indices_to_keep:
            new_recent_video_files.append((index, temp_path))
        else:
            # Delete the temp file
            try:
                os.remove(temp_path)
                print(f"Deleted temp video file: {temp_path}")
            except Exception as e:
                print(f"Error deleting temp video file {temp_path}: {e}")
    recent_video_files = new_recent_video_files

# Function to load and display the current post
def show_post(index):
    global current_index
    stop_playback()  # Stop any ongoing playback
    current_index = index

    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    mark_as_seen(post_id, tags, rating)

    media_url = post.get("file_url")
    file_extension = post.get("file_ext", "")

    # Clear the media label content before loading new media
    clear_media_label()

    # Clean up temp files that are more than 3 posts away
    cleanup_old_temp_files()

    if media_url:
        if file_extension in ["mp4", "webm"]:  # Video formats
            temp_video_path = download_video(media_url, current_index)
            if temp_video_path:
                video_thread = threading.Thread(target=play_video, args=(temp_video_path,))
                video_thread.start()
            else:
                print("Failed to download video.")
                next_post()  # Move to the next post if download fails
        else:
            response = requests.get(media_url)
            if response.status_code == 200:
                try:
                    image_data = Image.open(BytesIO(response.content))
                    image_data.thumbnail((1280, 720))
                    image = ImageTk.PhotoImage(image_data)
                    media_label.config(image=image)
                    media_label.image = image
                except Exception as e:
                    print(f"Failed to load image: {e}")
                    next_post()  # Move to the next post if image fails to load
            else:
                print("Error: Failed to fetch the image.")
                next_post()  # Move to the next post if fetch fails
    else:
        print("Error: No media URL available.")
        next_post()  # Move to the next post if no media URL

# Function to open the current post in the browser
def open_in_browser():
    post_id = posts[current_index]["id"]
    url = f"https://danbooru.donmai.us/posts/{post_id}"
    webbrowser.open(url)

# Button functions to navigate posts
def next_post():
    global current_index, page
    if current_index < len(posts) - 1:
        current_index += 1
        show_post(current_index)
    else:
        page += 1  # Move to next page
        set_setting('last_used_page', page)  # Save the new page
        fetch_and_update_posts()

def previous_post():
    global current_index
    if current_index > 0:
        current_index -= 1
        show_post(current_index)

# Fetch new posts and update
def fetch_and_update_posts():
    global posts, current_index, page
    new_posts = fetch_new_posts()
    if new_posts:
        posts = new_posts  # Replace the posts list with new posts
        current_index = 0
        show_post(current_index)
    else:
        print("No new posts available.")
        media_label.config(text="No new posts available.")

# Function to handle liking a post
def like_post():
    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    mark_post_status(post_id, 'liked', tags, rating)
    next_post()

# Function to handle disliking a post
def dislike_post():
    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    mark_post_status(post_id, 'disliked', tags, rating)
    next_post()

# --- Arrange buttons as per the specified layout ---

# Rating choices
rating_choices = [
    'General Only',
    'General and Sensitive',
    'General, Sensitive, and Questionable',
    'General, Sensitive, Questionable, and Explicit',
    'Sensitive Only',
    'Questionable Only',
    'Explicit Only'
]

# Media choices
media_choices = ['Video Only', 'Images Only', 'Video and Images']

# Create the main top button frame
top_button_frame = tk.Frame(button_frame)
top_button_frame.pack(fill='x')

# Configure columns in top_button_frame for centering
top_button_frame.columnconfigure(0, weight=1)
top_button_frame.columnconfigure(1, weight=0)
top_button_frame.columnconfigure(2, weight=1)

# Left frame for Previous button only
left_frame = tk.Frame(top_button_frame)
left_frame.grid(row=0, column=0, sticky='w', padx=10)

# Previous button
prev_button = tk.Button(left_frame, text="Previous", command=previous_post)
prev_button.pack(anchor='w')

# Center frame for Dislike and Like buttons
center_frame = tk.Frame(top_button_frame)
center_frame.grid(row=0, column=1)

# Dislike button
dislike_button = tk.Button(center_frame, text="Dislike", command=dislike_post)
dislike_button.pack(side='left', padx=5)

# Like button
like_button = tk.Button(center_frame, text="Like", command=like_post)
like_button.pack(side='left', padx=5)

# Right frame for Next button only
right_frame = tk.Frame(top_button_frame)
right_frame.grid(row=0, column=2, sticky='e', padx=10)

# Next button
next_button = tk.Button(right_frame, text="Next", command=next_post)
next_button.pack(anchor='e')

# Bottom frame for the Rating and Media dropdowns
bottom_frame = tk.Frame(button_frame)
bottom_frame.pack(fill='x', pady=(5, 0))  # Add padding to separate from the top row

# Rating dropdown menu
rating_menu = tk.OptionMenu(bottom_frame, rating_option, *rating_choices)
rating_menu.grid(row=0, column=0, padx=10, sticky='w')

# Media Type dropdown menu
media_menu = tk.OptionMenu(bottom_frame, media_option, *media_choices)
media_menu.grid(row=0, column=1, padx=10, sticky='w')

# Open in Browser button below the dropdowns
open_browser_button = tk.Button(bottom_frame, text="Open in Browser", command=open_in_browser)
open_browser_button.grid(row=1, column=0, columnspan=2, pady=(5, 0), padx=10, sticky='w')  # Positioned on a new row

# Function to handle changes in the rating option
def rating_option_changed(*args):
    print(f"Rating option changed to: {rating_option.get()}")
    # Stop any active playback
    stop_playback()
    # Clear the media label content
    clear_media_label()
    # Fetch new posts without resetting the page
    fetch_and_update_posts()

# Function to handle changes in the media option
def media_option_changed(*args):
    print(f"Media option changed to: {media_option.get()}")
    # Stop any active playback
    stop_playback()
    # Clear the media label content
    clear_media_label()
    # Fetch new posts without resetting the page
    fetch_and_update_posts()

# Set up the trace on the rating_option variable
rating_option.trace('w', rating_option_changed)
media_option.trace('w', media_option_changed)

# Display the first post
fetch_and_update_posts()

root.mainloop()
conn.close()  # Close the database connection when the application is closed
