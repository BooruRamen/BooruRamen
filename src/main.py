# main.py

import threading
import tkinter as tk
import requests
import sys
import webbrowser
from io import BytesIO
from PIL import Image, ImageTk
from datetime import datetime, timedelta

import database
import danbooru_client
import media
import user_profile

# Initialize tkinter window
root = tk.Tk()
root.tk_setPalette(background='#333333', foreground='white', activeBackground='#555555', activeForeground='white')
root.configure(bg='#333333')
root.title("Danbooru Viewer")
root.geometry("1280x900")  # Set the overall window size

# Variable to track fullscreen state
fullscreen = False

# Store default background colors
default_bg = root.cget('bg')

# Get screen dimensions
screen_width = root.winfo_screenwidth()
screen_height = root.winfo_screenheight()

# Frames for media display and controls
media_frame = tk.Frame(root, width=1280, height=720)  # Set default frame size
media_frame.pack_propagate(False)
media_frame.pack(pady=10)

button_frame = tk.Frame(root)
button_frame.pack(fill='x')

# Media display label with default size
media_label = tk.Label(media_frame, width=1280, height=720)
media_label.pack()

# Store default backgrounds for media_label and media_frame
default_media_label_bg = media_label.cget('bg')
default_media_frame_bg = media_frame.cget('bg')

# Global variables
rating_option = tk.StringVar()
rating_option.set('General and Sensitive')  # Default option

media_option = tk.StringVar()
media_option.set('Video and Images')  # Default option

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

# Variables for Autonext feature
autonext_enabled = tk.BooleanVar()
autonext_interval = tk.StringVar(value='5')  # Default interval in seconds
autonext_job = None  # Variable to hold the after job ID

current_time = datetime.now()
db_timestamp = database.get_setting('last_time_app_accessed', str(current_time))
db_timestamp_obj = datetime.strptime(db_timestamp, "%Y-%m-%d %H:%M:%S.%f")
time_difference = current_time - db_timestamp_obj
if time_difference > timedelta(minutes=30):
    page = int(1)
    for r_o in rating_choices:
        for m_o in media_choices:
            database.set_setting(f'last_used_page_({r_o})_({m_o})', page)
    database.set_setting('last_time_app_accessed', datetime.now())
else:
    page = int(database.get_setting(f'last_used_page_({rating_option.get()})_({media_option.get()})', 1))

current_index = 0
posts = []

# Build the user profile at the start
profile = user_profile.build_user_profile()

# Function to clear the media_label content
def clear_media_label():
    media_label.config(image='', text='')  # Clear image and text from label

# Function to open the current post in the browser
def open_in_browser():
    post_id = posts[current_index]["id"]
    url = f"https://danbooru.donmai.us/posts/{post_id}"
    webbrowser.open(url)

def copy_to_clipboard():
    post_id = posts[current_index]["id"]
    url = f"https://danbooru.donmai.us/posts/{post_id}"
    root.clipboard_clear()
    root.clipboard_append(url)
    root.update()

# Function to stop video playback
def stop_playback():
    media.stop_playback()

# Function to handle liking a post
def like_post(event=None):
    global profile
    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    database.mark_post_status(post_id, 'liked', tags, rating)
    user_profile.update_profile_incrementally(post, 'liked', profile)
    user_profile.save_profile_to_file(profile)
    next_post()

# Function to handle super liking a post
def super_like_post(event=None):
    global profile
    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    database.mark_post_status(post_id, 'super liked', tags, rating)
    user_profile.update_profile_incrementally(post, 'super liked', profile)
    user_profile.save_profile_to_file(profile)
    next_post()

# Function to handle disliking a post
def dislike_post(event=None):
    global profile
    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    database.mark_post_status(post_id, 'disliked', tags, rating)
    user_profile.update_profile_incrementally(post, 'disliked', profile)
    user_profile.save_profile_to_file(profile)
    next_post()

# Function to resize and display the current post without distortion
def handle_video(media_url, current_index):
    temp_video_path = media.download_video(media_url, current_index)
    if temp_video_path:
        video_thread = threading.Thread(target=media.play_video, args=(temp_video_path, media_label))
        video_thread.start()
        return True
    return False

def handle_image(media_url):
    response = requests.get(media_url)
    if response.status_code != 200:
        return False
        
    try:
        image_data = Image.open(BytesIO(response.content))
        if fullscreen:
            img_width, img_height = image_data.size
            scale_factor = min(screen_width / img_width, screen_height / img_height)
            new_width = int(img_width * scale_factor)
            new_height = int(img_height * scale_factor)
            image_data = image_data.resize((new_width, new_height), Image.LANCZOS)
        else:
            image_data.thumbnail((1280, 720), Image.LANCZOS)
            
        image = ImageTk.PhotoImage(image_data)
        media_label.config(image=image)
        media_label.image = image
        return True
    except Exception as e:
        print(f"Failed to load image: {e}")
        return False

def show_post(index):
    global current_index
    stop_playback()
    current_index = index

    post = posts[current_index]
    post_id = post["id"]
    tags = post.get("tag_string", "")
    rating = post.get('rating', '')
    database.mark_as_seen(post_id, tags, rating)

    score = user_profile.predict_post_likelihood(post, user_profile.load_profile_from_file())
    print(f"Predicted likelihood score for this post: {score*100:.2f}%")
    print(f'Post score: {post.get("score")}')

    clear_media_label()
    media.cleanup_old_temp_files(current_index)

    media_url = post.get("file_url")
    if not media_url:
        print("Error: No media URL available.")
        next_post()
        return

    file_extension = post.get("file_ext", "")
    success = False
    
    if file_extension in ["mp4", "webm"]:
        success = handle_video(media_url, current_index)
    else:
        success = handle_image(media_url)
        
    if not success:
        next_post()

# Button functions to navigate posts
def next_post(event=None):
    global current_index, page
    if current_index < len(posts) - 1:
        current_index += 1
        show_post(current_index)
    else:
        page += 1  # Move to next page
        database.set_setting(f'last_used_page_({rating_option.get()})_({media_option.get()})', page)
        database.set_setting('last_time_app_accessed', datetime.now())
        fetch_and_update_posts()

def previous_post(event=None):
    global current_index
    if current_index > 0:
        current_index -= 1
        show_post(current_index)

# Fetch new posts and update
def fetch_and_update_posts():
    global posts, current_index, page
    new_posts = danbooru_client.fetch_new_posts(page, rating_option.get(), media_option.get())
    if new_posts:
        posts = new_posts
        current_index = 0
        show_post(current_index)
    else:
        print("No new posts available.")
        media_label.config(text="No new posts available.")

# Function to handle changes in the rating option
def rating_option_changed(*args):
    global page
    print(f"Rating option changed to: {rating_option.get()}")
    current_time = datetime.now()
    db_timestamp = database.get_setting('last_time_app_accessed', str(current_time))
    db_timestamp_obj = datetime.strptime(db_timestamp, "%Y-%m-%d %H:%M:%S.%f")
    time_difference = current_time - db_timestamp_obj
    if time_difference > timedelta(minutes=30):
        page = int(1)
        for r_o in rating_choices:
            for m_o in media_choices:
                database.set_setting(f'last_used_page_({r_o})_({m_o})', page)
        database.set_setting('last_time_app_accessed', datetime.now())
    else:
        page = int(database.get_setting(f'last_used_page_({rating_option.get()})_({media_option.get()})', 1))
    stop_playback()
    clear_media_label()
    fetch_and_update_posts()

# Function to handle changes in the media option
def media_option_changed(*args):
    global page
    print(f"Media option changed to: {media_option.get()}")
    current_time = datetime.now()
    db_timestamp = database.get_setting('last_time_app_accessed', str(current_time))
    db_timestamp_obj = datetime.strptime(db_timestamp, "%Y-%m-%d %H:%M:%S.%f")
    time_difference = current_time - db_timestamp_obj
    if time_difference > timedelta(minutes=30):
        page = int(1)
        for r_o in rating_choices:
            for m_o in media_choices:
                database.set_setting(f'last_used_page_({r_o})_({m_o})', page)
        database.set_setting('last_time_app_accessed', datetime.now())
    else:
        page = int(database.get_setting(f'last_used_page_({rating_option.get()})_({media_option.get()})', 1))
    stop_playback()
    clear_media_label()
    fetch_and_update_posts()

# Function to schedule autonext functionality
def schedule_autonext(event=None):
    global autonext_job
    if autonext_enabled.get():
        try:
            interval = float(autonext_interval.get())
            interval_ms = int(interval * 1000)
        except ValueError:
            print("Invalid Autonext Interval. Please enter a number.")
            interval_ms = 5000  # Default to 5 seconds if invalid
        autonext_job = root.after(interval_ms, autonext_next_post)
    else:
        if autonext_job is not None:
            root.after_cancel(autonext_job)
            autonext_job = None

def autonext_next_post():
    global autonext_job
    next_post()
    if autonext_enabled.get():
        try:
            interval = float(autonext_interval.get())
            interval_ms = int(interval * 1000)
        except ValueError:
            print("Invalid Autonext Interval. Please enter a number.")
            interval_ms = 5000  # Default to 5 seconds if invalid
        autonext_job = root.after(interval_ms, autonext_next_post)
    else:
        autonext_job = None

def toggle_autonext(event=None):
    autonext_checkbox.toggle()
    schedule_autonext()

# Function to toggle fullscreen mode
def toggle_fullscreen(event=None):
    global fullscreen
    fullscreen = not fullscreen

    if fullscreen:
        # Go to fullscreen mode
        root.attributes('-fullscreen', True)
        root.configure(background='black')
        media_label.configure(width=screen_width, height=screen_height, background='black')
        media_frame.configure(background='black')

        # Hide other frames
        button_frame.pack_forget()

        # Adjust media_label and media_frame
        media_label.pack_forget()
        media_label.pack(fill='both', expand=True)
        media_frame.pack_forget()
        media_frame.pack(fill='both', expand=True)
    else:
        # Exit fullscreen mode
        root.attributes('-fullscreen', False)
        root.configure(background=default_bg)
        media_label.configure(width=1280, height=720, background=default_media_label_bg)
        media_frame.configure(background=default_media_frame_bg)

        # Show other frames
        media_label.pack_forget()
        media_label.pack()
        media_frame.pack_forget()
        media_frame.pack(pady=10)
        button_frame.pack(fill='x')

    # Refresh the current post to adjust image size
    show_post(current_index)

# --- Arrange buttons as per the specified layout ---
# Create the main top button frame
top_button_frame = tk.Frame(button_frame)
top_button_frame.pack(fill='x', pady=10)  # Add vertical padding for better spacing

# Configure columns in top_button_frame to span the width of the window
for i in range(5):
    top_button_frame.columnconfigure(i, weight=1)

# Align Previous, Dislike, Like, Super Like, and Next buttons in a single row
prev_button = tk.Button(top_button_frame, text="Previous", command=previous_post)
prev_button.grid(row=0, column=0, padx=5, sticky='ew')

dislike_button = tk.Button(top_button_frame, text="Dislike", command=dislike_post, bg="red")
dislike_button.grid(row=0, column=1, padx=5, sticky='ew')

like_button = tk.Button(top_button_frame, text="Like", command=like_post, bg="green")
like_button.grid(row=0, column=2, padx=5, sticky='ew')

super_like_button = tk.Button(top_button_frame, text="Super Like", command=super_like_post, bg="blue")
super_like_button.grid(row=0, column=3, padx=5, sticky='ew')

next_button = tk.Button(top_button_frame, text="Next", command=next_post)
next_button.grid(row=0, column=4, padx=5, sticky='ew')

# Bottom frame for the Rating and Media dropdowns
bottom_frame = tk.Frame(button_frame)
bottom_frame.pack(fill='x', pady=10)  # Add vertical padding for better spacing

# Rating dropdown menu
rating_menu = tk.OptionMenu(bottom_frame, rating_option, *rating_choices)
rating_menu.grid(row=0, column=0, padx=10, sticky='w')

# Media Type dropdown menu
media_menu = tk.OptionMenu(bottom_frame, media_option, *media_choices)
media_menu.grid(row=0, column=1, padx=10, sticky='w')

# Autonext frame on the left side of the bottom frame
autonext_frame = tk.Frame(bottom_frame)
autonext_frame.grid(row=0, column=2, padx=10, sticky='w')

# Autonext checkbox and label
autonext_checkbox = tk.Checkbutton(autonext_frame, variable=autonext_enabled, command=schedule_autonext)
autonext_label = tk.Label(autonext_frame, text="Autonext")

# Autonext interval label and entry
autonext_interval_label = tk.Label(autonext_frame, text="Autonext Interval")
autonext_interval_entry = tk.Entry(autonext_frame, textvariable=autonext_interval, width=5)

# Arrange autonext widgets
autonext_checkbox.grid(row=0, column=0, padx=5, sticky='w')
autonext_label.grid(row=0, column=1, padx=5, sticky='w')
autonext_interval_label.grid(row=1, column=0, padx=5, sticky='w')
autonext_interval_entry.grid(row=1, column=1, padx=5, sticky='w')

# Open in Browser button below the dropdowns
open_browser_button = tk.Button(bottom_frame, text="Open in Browser", command=open_in_browser)
open_browser_button.grid(row=1, column=0, columnspan=2, pady=(5, 0), padx=10, sticky='w')

# Open in Browser button below the dropdowns
copy_to_clipboard_button = tk.Button(bottom_frame, text="Copy to Clipboard", command=copy_to_clipboard)
copy_to_clipboard_button.grid(row=1, column=1, columnspan=2, pady=(5, 0), padx=10, sticky='w')

# Set up the trace on the rating_option variable
rating_option.trace('w', rating_option_changed)
media_option.trace('w', media_option_changed)

# Function to handle the window closing event
def on_close():
    global page, autonext_job
    media.set_looping(False)
    media.set_closing_app(True)

    media.stop_vlc_completely()

    media.cleanup_old_temp_files(current_index)

    database.set_setting(f'last_used_page_({rating_option.get()})_({media_option.get()})', page)
    database.set_setting('last_time_app_accessed', datetime.now())

    if autonext_job is not None:
        root.after_cancel(autonext_job)
        autonext_job = None

    database.close_connection()
    root.destroy()
    sys.exit(0)

# Attach the on_close function to the window close event
root.protocol("WM_DELETE_WINDOW", on_close)

# Add SIGINT handler to catch Ctrl+C and ensure cleanup is performed
import signal

def sigint_handler(sig, frame):
    on_close()

signal.signal(signal.SIGINT, sigint_handler)

root.bind('<Right>', next_post)
root.bind('<Left>', previous_post)
root.bind('<Up>', like_post)
root.bind('<Down>', dislike_post)
root.bind('<space>', toggle_autonext)
root.bind('<F11>', toggle_fullscreen)

# Display the first post
fetch_and_update_posts()

root.mainloop()
