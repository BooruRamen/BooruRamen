from flask import Blueprint, jsonify, request, render_template, current_app, session
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
    direction = request.args.get('direction', 'next')
    try:
        if direction == 'prev':
            content_history = session.get('content_history', [])
            if len(content_history) > 1:
                content_history.pop()  # Remove current content
                previous_content_id = content_history.pop()  # Get previous content
                content = Content.query.get(previous_content_id)
                if content:
                    return jsonify(content.to_dict())
            # If no previous content, fall through to fetch new content

        recommended_content = recommend_content(current_user.id, page, 1)
        if recommended_content:
            content = recommended_content[0]
            content_history = session.get('content_history', [])
            content_history.append(content['id'])
            session['content_history'] = content_history
            return jsonify(content)
        else:
            return jsonify({"message": "No more content available"}), 204
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
    return jsonify([c.to_dict() for c in favorite_content if c])

@main.route('/reset_feed', methods=['POST'])
@token_required
def reset_feed(current_user):
    session.pop('content_history', None)
    return jsonify({"message": "Feed reset successfully"}), 200