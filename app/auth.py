from flask import Blueprint, request, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash
from app.models import User
from app import db
import jwt
import datetime

auth = Blueprint('auth', __name__)

SECRET_KEY = 'your_secret_key'  # Replace with a real secret key

@auth.route('/register', methods=['POST'])
def register():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    if user:
        return jsonify({"error": "Username already exists"}), 400
    new_user = User(
        username=data['username'],
        password=generate_password_hash(data['password'], method='pbkdf2:sha256')
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": "User created successfully"}), 201

@auth.route('/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    if user and check_password_hash(user.password, data['password']):
        login_user(user)
        token = jwt.encode({
            'user_id': user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, current_app.config['SECRET_KEY'], algorithm='HS256')
        return jsonify({"message": "Logged in successfully", "token": token}), 200
    return jsonify({"error": "Invalid username or password"}), 401

@auth.route('/logout')
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out successfully"}), 200

@auth.route('/user')
@login_required
def get_user():
    return jsonify({
        "id": current_user.id,
        "username": current_user.username,
        "preferredTags": current_user.preferred_tags,
        "blacklistedTags": current_user.blacklisted_tags,
        "contentTypePreference": current_user.content_type_preference
    }), 200