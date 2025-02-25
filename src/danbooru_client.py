# danbooru_client.py

import time
from pybooru import Danbooru
import database  # To access get_setting, set_setting, and is_seen
from datetime import datetime, timedelta

import user_profile

# Initialize Danbooru client
client = Danbooru('danbooru')

# Fetch new posts based on the current media and rating options
def fetch_new_posts(page, rating_option, media_option, limit=20):
    selected_rating = rating_option
    selected_media_option = media_option

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
    page_counter = 0

    # Start with trying the current page
    pages_to_try = [page]
    print(f"page {page}")
    # Keep track of pages we have already tried
    tried_pages = set()

    while page_counter < MAX_PAGES_TO_TRY:
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

            new_posts = [post for post in posts if not database.is_seen(post["id"])]

            # Filter posts based on selected_media_option~
            if selected_media_option == 'Video Only':
                new_posts = [post for post in new_posts if post.get("file_ext", '') in ["mp4", "webm"]]
            elif selected_media_option == 'Images Only':
                new_posts = [post for post in new_posts if post.get("file_ext", '') not in ["mp4", "webm"]]
            # For 'Video and Images', we don't need to filter

            # Remove posts with a score below 5
            new_posts = [post for post in new_posts if post.get("score", 0) >= 0]
            #trying to only show posts predicted to be liked
            #if int(user_profile.load_profile_from_file().get('total_liked', {})) >= 5:
            #    new_posts = [post for post in new_posts if user_profile.predict_post_likelihood(post, user_profile.load_profile_from_file()) >= 0.5]
            #for post in new_posts:
            #    print(user_profile.predict_post_likelihood(post, user_profile.load_profile_from_file()))
                

            if new_posts:
                database.set_setting(f'last_used_page_({selected_rating})_({selected_media_option})', page)  # Save the current page
                database.set_setting('last_time_app_accessed', datetime.now())
                return new_posts
            else:
                print(f"No new posts on page {page}.")

                # If no new posts found on initial pages, increment page and try again
                page += 1  # Increment to the next page
                database.set_setting(f'last_used_page_({selected_rating})_({selected_media_option})', page)  # Update last_used_page whenever page changes
                database.set_setting('last_time_app_accessed', datetime.now())
                page_counter += 1
                pages_to_try = [page]  # Only try the next page in the next iteration
                print(f"Trying next page: {page}")
                time.sleep(0.5)  # Delay to prevent hitting the rate limit

    print("No new posts found after trying multiple pages.")
    return []
