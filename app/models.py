from app import db
from flask_login import UserMixin
from datetime import datetime

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    preferred_tags = db.Column(db.String(500))
    blacklisted_tags = db.Column(db.String(500))
    content_type_preference = db.Column(db.String(20))

class Content(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    safebooru_id = db.Column(db.Integer, unique=True, nullable=False)
    url = db.Column(db.String(500), nullable=False)
    tags = db.Column(db.String(1000))
    content_type = db.Column(db.String(10))  # 'image' or 'video'

class UserInteraction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content_id = db.Column(db.Integer, db.ForeignKey('content.id'), nullable=False)
    interaction_type = db.Column(db.String(10))  # 'view', 'like', 'dislike', 'favorite'
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)