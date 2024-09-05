from app.models import User, Content, UserInteraction
from app.safebooru_api import fetch_content, process_safebooru_content
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from flask import session

def get_user_preferences(user_id):
    user = User.query.get(user_id)
    liked_content = UserInteraction.query.filter_by(user_id=user_id, interaction_type='like').all()
    disliked_content = UserInteraction.query.filter_by(user_id=user_id, interaction_type='dislike').all()
    
    liked_tags = [Content.query.get(i.content_id).tags for i in liked_content]
    disliked_tags = [Content.query.get(i.content_id).tags for i in disliked_content]
    
    return user.preferred_tags, user.blacklisted_tags, liked_tags, disliked_tags

def recommend_content(user_id, page, per_page):
    preferred_tags, blacklisted_tags, liked_tags, disliked_tags = get_user_preferences(user_id)
    
    # Get already seen content
    seen_content = session.get('seen_content', [])
    
    # Fetch new content from Safebooru
    new_content = fetch_content(preferred_tags, User.query.get(user_id).content_type_preference, limit=100)
    
    # Filter out blacklisted and seen content
    filtered_content = [c for c in new_content 
                        if not any(tag in c['tags'] for tag in blacklisted_tags.split(',') if blacklisted_tags)
                        and c['id'] not in seen_content]
    
    if not filtered_content:
        return []  # Return empty list if no content is available
    
    # Use TF-IDF and cosine similarity to rank content
    tfidf = TfidfVectorizer()
    all_tags = [c['tags'] for c in filtered_content] + liked_tags + disliked_tags
    content_matrix = tfidf.fit_transform(all_tags)
    
    if liked_tags or disliked_tags:
        user_profile = np.mean(content_matrix[-len(liked_tags):, :].toarray(), axis=0) - np.mean(content_matrix[-len(disliked_tags):, :].toarray(), axis=0)
        user_profile = user_profile.reshape(1, -1)  # Reshape to 2D array
        similarities = cosine_similarity(user_profile, content_matrix[:len(filtered_content), :])
        ranked_content = sorted(zip(filtered_content, similarities[0]), key=lambda x: x[1], reverse=True)
    else:
        # If no likes or dislikes, return content in original order
        ranked_content = [(c, 0) for c in filtered_content]
    
    # Paginate the results
    start = (page - 1) * per_page
    end = start + per_page
    paginated_content = ranked_content[start:end]
    
    # Update seen content
    seen_content.extend([c[0]['id'] for c in paginated_content])
    session['seen_content'] = seen_content
    
    return [process_safebooru_content(c[0]) for c in paginated_content]