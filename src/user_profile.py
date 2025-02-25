# user_profile.py

import database
import json
import math

def build_user_profile():
    """
    Build a user profile based on liked and disliked posts.
    Returns a dictionary of tag preference scores and rating preferences.
    """
    c = database.conn.cursor()
    # Fetch liked posts
    c.execute("SELECT tags, rating FROM seen_posts WHERE status = 'liked'")
    liked_posts = c.fetchall()
    # Fetch disliked posts
    c.execute("SELECT tags, rating FROM seen_posts WHERE status = 'disliked'")
    disliked_posts = c.fetchall()

    tag_scores = {}       # Net likes - dislikes for each tag
    tag_totals = {}       # Total appearances of each tag
    rating_scores = {}    # Net likes - dislikes for each rating
    rating_totals = {}    # Total appearances of each rating

    total_liked = len(liked_posts)
    total_disliked = len(disliked_posts)

    # Process liked posts
    for tags_str, rating in liked_posts:
        tags = tags_str.split()
        for tag in tags:
            tag_scores[tag] = tag_scores.get(tag, 0) + 1
            tag_totals[tag] = tag_totals.get(tag, 0) + 1
        rating_scores[rating] = rating_scores.get(rating, 0) + 1
        rating_totals[rating] = rating_totals.get(rating, 0) + 1

    # Process disliked posts
    for tags_str, rating in disliked_posts:
        tags = tags_str.split()
        for tag in tags:
            tag_scores[tag] = tag_scores.get(tag, 0) - 1
            tag_totals[tag] = tag_totals.get(tag, 0) + 1
        rating_scores[rating] = rating_scores.get(rating, 0) - 1
        rating_totals[rating] = rating_totals.get(rating, 0) + 1

    profile = {
        'tag_scores': tag_scores,
        'tag_totals': tag_totals,
        'rating_scores': rating_scores,
        'rating_totals': rating_totals,
        'total_liked': total_liked,
        'total_disliked': total_disliked
    }

    return profile

def save_profile_to_file(profile, filename='user_profile.json'):
    """
    Save the user profile to a JSON file.
    """
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(profile, f, ensure_ascii=False, indent=4)
    print(f"User profile saved to {filename}")

def load_profile_from_file(filename='user_profile.json'):
    """
    Load the user profile from a JSON file.
    Returns the profile dictionary.
    """
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            profile = json.load(f)
        print(f"User profile loaded from {filename}")
        return profile
    except FileNotFoundError:
        print(f"Profile file {filename} not found.")
        return None

def sigmoid(x):
    """Standard sigmoid function."""
    return 1 / (1 + math.exp(-x))

def predict_post_likelihood(post, profile, tag_weight=0.7, rating_weight=0.3):
    """
    Given a post (dictionary with 'tag_string' and 'rating'),
    and a user profile, predict the likelihood the user will like the post.

    Returns a probability between 0 and 1; higher means more likely to be liked.
    """
    tags = post.get('tag_string', '').split()
    rating = post.get('rating', '')

    # User-specific scores and totals
    tag_scores = profile.get('tag_scores', {})
    tag_totals = profile.get('tag_totals', {})
    rating_scores = profile.get('rating_scores', {})
    rating_totals = profile.get('rating_totals', {})

    tag_score = 0
    rating_score = 0

    # Apply Laplace smoothing for tag scores
    for tag in tags:
        # User's interaction with the tag
        net_score = tag_scores.get(tag, 0)
        total = tag_totals.get(tag, 0)

        # Apply Laplace smoothing to handle rare or unseen tags
        smoothed_score = (net_score + 1) / (total + 2)  # +1 to numerator and +2 to denominator
        tag_score += smoothed_score

    if tags:
        tag_score /= len(tags)  # Average over number of tags
    else:
        # If there are no tags, assign a neutral score of 0.5
        tag_score = 0.5

    # Apply Laplace smoothing for rating scores
    net_rating_score = rating_scores.get(rating, 0)
    total_rating = rating_totals.get(rating, 0)

    if total_rating > 0:
        smoothed_rating_score = (net_rating_score + 1) / (total_rating + 2)
    else:
        # Assign a neutral score for unseen ratings
        smoothed_rating_score = 0.5

    rating_score = smoothed_rating_score

    # Normalize weights
    total_weight = tag_weight + rating_weight
    tag_weight_normalized = tag_weight / total_weight
    rating_weight_normalized = rating_weight / total_weight

    # Combine scores with normalized weighting
    total_score = (tag_weight_normalized * tag_score) + (rating_weight_normalized * rating_score)

    # Scale total score to a probability between 0 and 1 using the sigmoid function
    likelihood = sigmoid(5 * (total_score - 0.5))  # Adjusted to make neutral score correspond to 0.5 likelihood

    return likelihood

def update_profile_incrementally(post, status, profile):
    """
    Update the user profile incrementally based on a new post and its status.
    """
    tags = post.get("tag_string", "").split()
    rating = post.get('rating', '')

    if status == 'liked':
        increment = 1
        profile['total_liked'] += 1
    elif status == 'super liked':
        increment = 3
        profile['total_liked'] += 10
    elif status == 'disliked':
        increment = -1
        profile['total_disliked'] += 1
    else:
        return  # Do nothing for other statuses

    for tag in tags:
        profile['tag_scores'][tag] = profile['tag_scores'].get(tag, 0) + increment
        profile['tag_totals'][tag] = profile['tag_totals'].get(tag, 0) + 1

    profile['rating_scores'][rating] = profile['rating_scores'].get(rating, 0) + increment
    profile['rating_totals'][rating] = profile['rating_totals'].get(rating, 0) + 1

# Example usage:

if __name__ == '__main__':
    # Build the profile
    profile = build_user_profile()
    # Save the profile to a file
    save_profile_to_file(profile)

    # Load the profile from the file
    loaded_profile = load_profile_from_file()

    # For testing, create a sample post
    sample_post = {
        'tag_string': 'blue_hair green_eyes smile',
        'rating': 'general'
    }
    likelihood = predict_post_likelihood(sample_post, loaded_profile)
    print(f"Predicted likelihood for the sample post: {likelihood:.4f}")
