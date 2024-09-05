from flask import Blueprint, jsonify, request, render_template, current_app
from functools import wraps
import jwt
from app.models import User, Content, UserInteraction
from app.recommendation import recommend_content
from app import db

main = Blueprint('main', __name__)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        try:
            token = token.split()[1]  # Remove 'Bearer ' prefix
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = User.query.get(data['user_id'])
        except:
            return jsonify({'message': 'Token is invalid!'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

@main.route('/')
def index():
    return render_template('index.html')

@main.route('/feed')
@token_required
def get_feed(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = 10  # Number of items per page
    try:
        recommended_content = recommend_content(current_user.id, page, per_page)
        return jsonify(recommended_content)
    except Exception as e:
        print(f"Error in get_feed: {str(e)}")
        return jsonify({"error": "An error occurred while fetching the feed"}), 500

@main.route('/interact', methods=['POST'])
@token_required
def interact(current_user):
    data = request.json
    interaction = UserInteraction(
        user_id=current_user.id,
        content_id=data['content_id'],
        interaction_type=data['interaction_type']
    )
    db.session.add(interaction)
    db.session.commit()
    return jsonify({"status": "success"})

@main.route('/update_preferences', methods=['POST'])
@token_required
def update_preferences(current_user):
    data = request.json
    current_user.preferred_tags = data.get('preferredTags', current_user.preferred_tags)
    current_user.blacklisted_tags = data.get('blacklistedTags', current_user.blacklisted_tags)
    current_user.content_type_preference = data.get('contentTypePreference', current_user.content_type_preference)
    db.session.commit()
    return jsonify({"status": "success"})

@main.route('/favorites')
@token_required
def get_favorites(current_user):
    favorites = UserInteraction.query.filter_by(user_id=current_user.id, interaction_type='favorite').all()
    favorite_content = [Content.query.get(f.content_id) for f in favorites]
    return jsonify([{
        "id": c.id,
        "url": c.url,
        "tags": c.tags,
        "content_type": c.content_type
    } for c in favorite_content])

@main.route('/reset_feed', methods=['POST'])
@token_required
def reset_feed(current_user):
    session.pop('seen_content', None)
    return jsonify({"message": "Feed reset successfully"}), 200