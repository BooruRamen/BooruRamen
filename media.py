# media.py

import os
import time
import requests
import threading
import tempfile
from io import BytesIO
from PIL import Image, ImageTk
import vlc

# Global variables for media control
video_instance = None
player = None
looping = True
closing_app = False
recent_video_files = []

def set_looping(value):
    global looping
    looping = value

def set_closing_app(value):
    global closing_app
    closing_app = value

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

# Function to stop video playback
def stop_playback():
    global player
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

# Function to clean up old temporary video files
def cleanup_old_temp_files(current_index):
    global recent_video_files
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

# Function to play video using VLC
def play_video(temp_video_path, media_label):
    global video_instance, player, looping, closing_app
    if not temp_video_path:
        print("Failed to download video.")
        return

    # Initialize VLC instance if it doesn't exist
    if not video_instance:
        video_instance = vlc.Instance('--no-video-title-show', '--avcodec-hw=none', '--quiet')
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
